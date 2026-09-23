import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode, REFERRAL_TRIAL_DAYS } from "@/lib/referral";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { consumeRateLimit, clientIpFromHeaders, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

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

  // Code de parrainage optionnel : s'il correspond à un compte existant, ce
  // NOUVEAU compte reçoit l'accès IA gratuitement pendant REFERRAL_TRIAL_DAYS
  // jours, même sur le palier Gratuit (voir src/lib/billing/plan.ts).
  let referrer: { id: string } | null = null;
  if (referralCode && referralCode.length > 0) {
    referrer = await prisma.user.findUnique({ where: { referralCode }, select: { id: true } });
    if (!referrer) {
      return NextResponse.json({ error: "Code de parrainage invalide." }, { status: 400 });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let slug = slugify(brandName);
  const slugTaken = await prisma.brand.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.floor(Math.random() * 10000)}`;

  const ownReferralCode = await generateUniqueReferralCode();
  const aiTrialUntil = referrer ? new Date(Date.now() + REFERRAL_TRIAL_DAYS * 24 * 60 * 60 * 1000) : null;

  await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      referralCode: ownReferralCode,
      referredByCode: referrer ? referralCode : null,
      aiTrialUntil,
      memberships: {
        create: {
          role: "OWNER",
          brand: { create: { name: brandName, slug } }
        }
      }
    }
  });

  return NextResponse.json({ ok: true, aiTrialDays: referrer ? REFERRAL_TRIAL_DAYS : 0 });
}
