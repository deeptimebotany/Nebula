import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import FacebookProvider from "next-auth/providers/facebook";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/referral";
import { cookies } from "next/headers";
import { ATTRIBUTION_COOKIE, attributionToUserFields, parseAttributionCookie, trackGrowth } from "@/lib/growth";
import { TOOLS_COOKIE, toolsExploredCount } from "@/lib/tools-explored";
import { applyPendingPartnerGrant } from "@/lib/billing/partners";
import { trialEndDate } from "@/lib/trial";
import { assertSecretConfig } from "@/lib/secrets";
import { currentSessionVersion, forgetSessionCache, isPrivilegedEmail, providerEmailVerified, sendVerificationEmail } from "@/lib/account-security";
import { notify } from "@/lib/notifications";

// Refuse un NEXTAUTH_SECRET resté à la valeur d'exemple (voir lib/secrets.ts).
assertSecretConfig();

function slugifyBrand(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `marque-${Date.now()}`
  );
}

// Crée le compte Nebula + sa marque par défaut au premier login Google/Apple
// (mêmes étapes que /api/auth/register, sans mot de passe — voir passwordHash
// nullable sur User). Idempotent : ne fait rien si le compte existe déjà.
// Photo fournie par Google/Apple/Facebook (et non envoyée à la main dans
// « Mon profil ») : celle-là suit le compte social à chaque connexion.
function isProviderAvatar(url: string): boolean {
  return /googleusercontent\.com|appleid\.apple\.com|fbcdn\.net|fbsbx\.com|facebook\.com/i.test(url);
}

type OAuthSignInResult = { ok: true } | { ok: false; error: "AccountExists" | "EmailReserved" };

// Connexion Google/Apple/Meta (audit sécurité, lot 1 — voir
// lib/account-security.ts pour le détail des règles).
export async function resolveOAuthSignIn(input: {
  provider: string;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl?: string | null;
}): Promise<OAuthSignInResult> {
  const normalizedEmail = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!existing) {
    // Une adresse réservée (propriétaire, administrateurs) ne peut être
    // prise que par un fournisseur qui garantit l'adresse.
    if (!input.emailVerified && isPrivilegedEmail(normalizedEmail)) return { ok: false, error: "EmailReserved" };
    await createOAuthUser(normalizedEmail, input);
    return { ok: true };
  }

  const avatarUpdate =
    input.avatarUrl && input.avatarUrl !== existing.avatarUrl && (!existing.avatarUrl || isProviderAvatar(existing.avatarUrl))
      ? { avatarUrl: input.avatarUrl }
      : {};

  if (input.emailVerified) {
    if (!existing.emailVerifiedAt) {
      // Compte créé par mot de passe mais jamais confirmé, et la personne
      // qui arrive prouve (via Google/Apple) posséder l'adresse : le mot de
      // passe posé sans preuve est supprimé et toutes les sessions ouvertes
      // sont coupées — si un inconnu avait créé ce compte avec son adresse,
      // il en perd immédiatement l'accès.
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...avatarUpdate,
          emailVerifiedAt: new Date(),
          emailVerifyTokenHash: null,
          emailVerifyTokenExpiresAt: null,
          passwordHash: null,
          facebookLoginId: null,
          sessionVersion: { increment: 1 }
        }
      });
      forgetSessionCache(existing.id);
      if (existing.passwordHash) {
        await notify(existing.id, {
          kind: "reconnect",
          title: "Adresse confirmée, mot de passe désactivé",
          body: "Votre adresse e-mail n'avait jamais été confirmée : par sécurité, le mot de passe défini à l'inscription a été désactivé et les autres sessions déconnectées. Utilisez « Mot de passe oublié » pour en choisir un nouveau.",
          href: "/settings",
          actionLabel: "Paramètres"
        }).catch(() => undefined);
      }
      await applyPendingPartnerGrant(existing.id, existing.email).catch(() => undefined);
    } else if (Object.keys(avatarUpdate).length) {
      await prisma.user.update({ where: { id: existing.id }, data: avatarUpdate });
    }
    return { ok: true };
  }

  // Adresse non garantie (Meta) : on ne relie un compte existant que s'il a
  // déjà été ouvert avec CE compte Facebook.
  if (input.provider === "facebook" && existing.facebookLoginId === input.providerAccountId) {
    if (Object.keys(avatarUpdate).length) await prisma.user.update({ where: { id: existing.id }, data: avatarUpdate });
    return { ok: true };
  }
  return { ok: false, error: "AccountExists" };
}

async function createOAuthUser(
  normalizedEmail: string,
  input: { provider: string; providerAccountId: string; emailVerified: boolean; name: string; avatarUrl?: string | null }
) {
  const name = input.name;
  const avatarUrl = input.avatarUrl;
  const brandName = name || normalizedEmail.split("@")[0];
  let slug = slugifyBrand(brandName);
  const slugTaken = await prisma.brand.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.floor(Math.random() * 10000)}`;

  // Même chemin d'attribution et d'essai que /api/auth/register (lot G0/G2/
  // G7) : le cookie nb_attr posé par le middleware est lisible ici (le
  // callback NextAuth s'exécute dans une route handler). Le code de
  // parrainage ne peut venir que du cookie (?ref= sur un lien).
  let attribution: ReturnType<typeof parseAttributionCookie> = null;
  // Badge Explorateur (Réussites, lot C) : outils gratuits essayés avant l'inscription.
  let toolsExplored = 0;
  try {
    attribution = parseAttributionCookie(cookies().get(ATTRIBUTION_COOKIE)?.value);
    toolsExplored = toolsExploredCount(cookies().get(TOOLS_COOKIE)?.value);
  } catch {
    attribution = null;
  }
  let referrerCode: string | null = null;
  if (attribution?.ref) {
    const code = attribution.ref.toUpperCase();
    const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (referrer) referrerCode = code;
  }
  const trialEndsAt = trialEndDate(Boolean(referrerCode));

  const referralCode = await generateUniqueReferralCode();
  const user = await prisma.user.create({
    data: {
      name: brandName,
      email: normalizedEmail,
      passwordHash: null,
      avatarUrl: avatarUrl ?? undefined,
      emailVerifiedAt: input.emailVerified ? new Date() : null,
      facebookLoginId: input.provider === "facebook" ? input.providerAccountId : null,
      referralCode,
      referredByCode: referrerCode,
      aiTrialUntil: referrerCode ? trialEndsAt : null,
      trialEndsAt,
      toolsExplored,
      ...attributionToUserFields(attribution),
      memberships: {
        create: {
          role: "OWNER",
          brand: { create: { name: brandName, slug } }
        }
      }
    }
  });
  await trackGrowth("signup", { source: attribution?.source ?? "direct", via: attribution?.via ?? "", referred: Boolean(referrerCode), oauth: true }, user.id);
  // Accès offert en attente pour cet email (partenaires, /admin/partenaires) :
  // seulement si l'adresse est garantie, sinon à la confirmation.
  if (input.emailVerified) await applyPendingPartnerGrant(user.id, user.email).catch(() => undefined);
  else await sendVerificationEmail(user).catch(() => undefined);
  return user;
}

export const authOptions: NextAuthOptions = {
  // maxAge explicite (60 jours) : la session est mémorisée dans un cookie
  // persistant, donc rouvrir le site plus tard ne redemande pas de
  // connexion (voir la redirection automatique vers /dashboard sur "/",
  // "/login" et "/register" quand une session valide existe déjà).
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 60 },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "Identifiants",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Anti-force brute : 20 tentatives par IP par quart d'heure, et 10
        // par couple IP+email (un attaquant qui cible un compte précis est
        // bloqué plus vite, sans pénaliser les autres comptes de cette IP).
        const ip = clientIpFromHeaders(req?.headers as Record<string, string | string[] | undefined> | undefined);
        const emailKey = credentials.email.toLowerCase();
        const [byIp, byAccount] = await Promise.all([
          consumeRateLimit("login-ip", ip, 20, 15),
          consumeRateLimit("login-account", `${ip}|${emailKey}`, 10, 15)
        ]);
        if (!byIp.ok || !byAccount.ok) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() }
        });
        // Un compte créé via Google/Apple n'a pas de passwordHash — pas de
        // connexion par mot de passe possible pour lui (voir le champ
        // nullable sur User, et les boutons de connexion rapide plus bas).
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
      }
    }),
    // Connexion rapide (voir bulle "Continuer avec Google/Apple" sur /login
    // et /register) — n'apparaissent dans la liste QUE si les identifiants
    // OAuth correspondants sont renseignés dans .env (voir .env.example et
    // src/lib/oauth-providers.ts, qui pilote l'affichage des boutons).
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // "select_account" : Google propose TOUJOURS le choix du compte
            // au lieu de silencieusement réutiliser celui déjà en session
            // dans le navigateur — indispensable pour "Ajouter un compte"
            // (voir account-switcher.tsx et /api/accounts/link), sinon
            // cliquer "+" reconnecterait juste le même compte Google.
            // GOOGLE_OAUTH_LANG=en : écrans Google en anglais (audit de
            // vérification Google, voir .env.example).
            authorization: { params: { prompt: "select_account", ...(process.env.GOOGLE_OAUTH_LANG ? { hl: process.env.GOOGLE_OAUTH_LANG } : {}) } }
          })
        ]
      : []),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? [AppleProvider({ clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET })]
      : []),
    // "Continuer avec Meta" (Facebook Login) — même logique OAuth que
    // Google/Apple ci-dessus, mais ATTENTION : distinct des connexions
    // Facebook/Instagram de src/lib/social (qui servent à publier, pas à se
    // connecter au compte Nebula). Utilise la même app Meta que ces
    // connexions ; tant que l'app n'est pas passée en App Review chez Meta,
    // seuls les comptes ajoutés comme "testeurs" dans Meta for Developers
    // peuvent l'utiliser (voir le commentaire dans .env.example).
    ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
      ? [FacebookProvider({ clientId: process.env.FACEBOOK_CLIENT_ID, clientSecret: process.env.FACEBOOK_CLIENT_SECRET })]
      : [])
  ],
  callbacks: {
    // Premier login Google/Apple : crée le compte Nebula + sa marque par
    // défaut avant que jwt() ne cherche à résoudre l'id (voir ci-dessous).
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" || account?.provider === "apple" || account?.provider === "facebook") {
        if (!user.email) return false;
        const result = await resolveOAuthSignIn({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email: user.email,
          emailVerified: providerEmailVerified(account.provider, profile),
          name: user.name ?? "",
          avatarUrl: user.image
        });
        if (!result.ok) return `/login?error=${result.error}`;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google" || account?.provider === "apple" || account?.provider === "facebook") {
          const dbUser = user.email
            ? await prisma.user.findUnique({ where: { email: user.email.toLowerCase() }, select: { id: true, sessionVersion: true } })
            : null;
          if (dbUser) {
            token.uid = dbUser.id;
            token.sv = dbUser.sessionVersion;
          }
        } else {
          token.uid = user.id;
          token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0;
        }
        return token;
      }
      // Révocation (audit sécurité, lot 1) : si le compte a coupé ses
      // sessions depuis (réinitialisation du mot de passe, compte repris par
      // le vrai propriétaire de l'adresse) ou n'existe plus, cette session
      // est refusée. Les sessions ouvertes avant cette mise à jour n'ont pas
      // de version : elles valent 0, comme les comptes.
      if (typeof token.uid === "string") {
        const current = await currentSessionVersion(token.uid);
        const own = typeof token.sv === "number" ? token.sv : 0;
        if (current === null || current !== own) throw new Error("Session révoquée");
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET
};
