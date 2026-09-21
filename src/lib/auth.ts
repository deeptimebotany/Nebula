import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import FacebookProvider from "next-auth/providers/facebook";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/referral";

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
async function findOrCreateOAuthUser(email: string, name: string, avatarUrl?: string | null) {
  const normalizedEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return existing;

  const brandName = name || normalizedEmail.split("@")[0];
  let slug = slugifyBrand(brandName);
  const slugTaken = await prisma.brand.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.floor(Math.random() * 10000)}`;

  const referralCode = await generateUniqueReferralCode();
  return prisma.user.create({
    data: {
      name: brandName,
      email: normalizedEmail,
      passwordHash: null,
      avatarUrl: avatarUrl ?? undefined,
      referralCode,
      memberships: {
        create: {
          role: "OWNER",
          brand: { create: { name: brandName, slug } }
        }
      }
    }
  });
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() }
        });
        // Un compte créé via Google/Apple n'a pas de passwordHash — pas de
        // connexion par mot de passe possible pour lui (voir le champ
        // nullable sur User, et les boutons de connexion rapide plus bas).
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
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
            authorization: { params: { prompt: "select_account" } }
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
    async signIn({ user, account }) {
      if (account?.provider === "google" || account?.provider === "apple" || account?.provider === "facebook") {
        if (!user.email) return false;
        await findOrCreateOAuthUser(user.email, user.name ?? "", user.image);
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google" || account?.provider === "apple" || account?.provider === "facebook") {
          const dbUser = user.email
            ? await prisma.user.findUnique({ where: { email: user.email.toLowerCase() } })
            : null;
          if (dbUser) token.uid = dbUser.id;
        } else {
          token.uid = user.id;
        }
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
