import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/referral";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { consumeRateLimit, clientIpFromHeaders, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { ATTRIBUTION_COOKIE, attributionToUserFields, parseAttributionCookie, trackGrowth } from "@/lib/growth";
import { TOOLS_COOKIE, toolsExploredCount } from "@/lib/tools-explored";
import { isPrivilegedEmail, sendVerificationEmail } from "@/lib/account-security";
import { REFERRED_TRIAL_DAYS, TRIAL_DAYS, trialEndDate } from "@/lib/trial";

// Messages d'erreur lisibles : renvoyés tels quels au formulaire (avant, un
// objet zod brut arrivait au navigateur et devenait « Impossible de créer le
// compte »). Le nom de la marque est facultatif : à défaut, l'espace prend
// le nom de la personne — on ne bloque pas une inscription pour ça.
const schema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom (2 caractères minimum).").max(80, "Nom trop long."),
  email: z.string().trim().email("Adresse email invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(200),
  brandName: z.string().trim().max(80, "Nom de marque trop long.").optional(),
  referralCode: z.string().trim().toUpperCase().max(20).optional(),
  // Consentement explicite aux conditions et à la politique de
  // confidentialité (RGPD) — vérifié aussi côté serveur.
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Vous devez accepter les conditions d'utilisation pour créer un compte." }) }),
  turnstileToken: z.string().optional()
});

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `marque-${Date.now()}`
  );
}

export async function POST(req: Request) {
  // Anti-abus : au plus 10 créations de compte par IP et par heure (un
  // script qui enchaîne les inscriptions est bloqué, une famille ou un
  // bureau derrière la même IP ne l'est pas).
  const rate = await consumeRateLimit("register", clientIpFromHeaders(req.headers), 10, 60);
  if (!rate.ok) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  }

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Formulaire incomplet." }, { status: 400 });
  }
  const { name, email, password, referralCode, turnstileToken } = body.data;
  const brandName = body.data.brandName?.trim() || name;

  const humanVerified = await verifyTurnstileToken(turnstileToken);
  if (!humanVerified) {
    return NextResponse.json({ error: "Vérification anti-robot échouée, réessayez." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }
  // Adresses réservées (compte propriétaire, administrateurs) : jamais par
  // mot de passe sans preuve de possession — connexion Google uniquement.
  if (isPrivilegedEmail(email)) {
    return NextResponse.json({ error: "Cette adresse est réservée : utilisez « Continuer avec Google »." }, { status: 403 });
  }

  // Attribution « premier contact » posée par le middleware (utm_*, via,
  // ref) — copiée sur le compte puis le cookie est effacé (lot G0).
  const cookieStore = cookies();
  const attribution = parseAttributionCookie(cookieStore.get(ATTRIBUTION_COOKIE)?.value);

  // Code de parrainage optionnel (champ du formulaire, sinon celui du
  // cookie d'attribution si la personne est arrivée par un lien ?ref=).
  // Valide → essai Pro porté à REFERRED_TRIAL_DAYS jours au lieu de
  // TRIAL_DAYS (lot G7) ; le parrain sera récompensé à la première
  // souscription payante de ce compte (voir src/lib/billing/rewards.ts).
  let referrer: { id: string } | null = null;
  let usedReferralCode: string | null = null;
  if (referralCode && referralCode.length > 0) {
    referrer = await prisma.user.findUnique({ where: { referralCode }, select: { id: true } });
    if (!referrer) {
      return NextResponse.json({ error: "Code de parrainage invalide." }, { status: 400 });
    }
    usedReferralCode = referralCode;
  } else if (attribution?.ref) {
    const fromCookie = attribution.ref.toUpperCase();
    referrer = await prisma.user.findUnique({ where: { referralCode: fromCookie }, select: { id: true } });
    if (referrer) usedReferralCode = fromCookie;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let slug = slugify(brandName);
  const slugTaken = await prisma.brand.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.floor(Math.random() * 10000)}`;

  const ownReferralCode = await generateUniqueReferralCode();
  // Essai Pro pour tout le monde (14 j), 30 j avec parrainage. aiTrialUntil
  // reste aligné pour la compatibilité (message « IA offerte » des
  // Paramètres) : l'essai Pro inclut déjà l'IA.
  const trialEndsAt = trialEndDate(Boolean(referrer));

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      // Adresse à confirmer (lien envoyé ci-dessous) — voir account-security.ts.
      emailVerifiedAt: null,
      referralCode: ownReferralCode,
      referredByCode: usedReferralCode,
      aiTrialUntil: referrer ? trialEndsAt : null,
      trialEndsAt,
      // Badge Explorateur (Réussites, lot C) : outils gratuits essayés avant l'inscription.
      toolsExplored: toolsExploredCount(cookieStore.get(TOOLS_COOKIE)?.value),
      ...attributionToUserFields(attribution)
    }
  });
  await prisma.membership.create({
    data: { role: "OWNER", user: { connect: { id: user.id } }, brand: { create: { name: brandName, slug } } }
  });
  await trackGrowth("signup", { source: attribution?.source ?? "direct", via: attribution?.via ?? "", referred: Boolean(referrer) }, user.id);
  // Lien de confirmation de l'adresse. Les accès offerts en attente pour cet
  // email (partenaires) ne s'appliquent qu'une fois l'adresse confirmée
  // (voir /api/auth/verify-email).
  await sendVerificationEmail(user).catch(() => undefined);

  const res = NextResponse.json({ ok: true, aiTrialDays: referrer ? REFERRED_TRIAL_DAYS : TRIAL_DAYS, trialDays: referrer ? REFERRED_TRIAL_DAYS : TRIAL_DAYS });
  if (attribution) res.cookies.set({ name: ATTRIBUTION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
