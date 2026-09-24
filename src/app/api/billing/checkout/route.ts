import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, isBillingEnabled } from "@/lib/billing/stripe";
import { PLAN_LIMITS, findTier, type Plan, type BillingInterval } from "@/lib/plans";
import { isOfferActive } from "@/lib/trial";
import { trackGrowth } from "@/lib/growth";
import { z } from "zod";

const bodySchema = z.object({
  plan: z.enum(["PRO", "AGENCY"]),
  interval: z.enum(["month", "year"]).default("month"),
  maxBrands: z.number().int().positive(),
  /** Raison de la modale de mise à niveau qui a mené ici (mesure). */
  reason: z.string().max(40).optional()
});

// POST /api/billing/checkout — crée une session Stripe Checkout pour
// souscrire (ou changer vers) un palier payant et un nombre de marques
// donné, mensuel ou annuel au choix, et renvoie son URL. L'abonnement est
// rattaché au COMPTE de l'utilisateur connecté, pas à une marque précise.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: "La facturation n'est pas configurée sur cette instance (STRIPE_SECRET_KEY manquant)." },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { plan, interval, maxBrands } = parsed.data;

  const limits = PLAN_LIMITS[plan as Plan];
  const tier = findTier(plan as Plan, maxBrands);
  if (!tier) {
    return NextResponse.json({ error: "Palier de nombre de marques invalide pour ce plan." }, { status: 400 });
  }
  const envVar = tier.stripePriceEnvVars[interval as BillingInterval];
  const priceId = process.env[envVar];
  if (!priceId) {
    return NextResponse.json(
      {
        error: `${envVar} manquant : créez le tarif "${limits.label} — jusqu'à ${maxBrands} marques" (${interval === "year" ? "annuel" : "mensuel"}) dans le Dashboard Stripe et copiez son Price ID dans .env.`
      },
      { status: 503 }
    );
  }

  const userId = (session.user as { id: string }).id;
  const [existing, user] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { bonusMonths: true, offerExpiresAt: true, offerUsedAt: true, firstPaidAt: true } })
  ]);

  // Réductions (brief growth) — au plus UN coupon par session Checkout :
  //   1. un mois de Pro offert en attente (badge apporteur / parrainage,
  //      User.bonusMonths) → coupon 100 % « une fois » ;
  //   2. sinon l'offre de bienvenue -50 % premier mois, si elle est encore
  //      valide, sur le MENSUEL uniquement (l'annuel a déjà ses mois offerts).
  // Les coupons sont créés à la main dans Stripe ; leurs identifiants sont
  // lus dans STRIPE_FREE_MONTH_COUPON / STRIPE_FIRST_MONTH_COUPON. Sans
  // variable, pas de réduction, pas d'erreur.
  const freeMonthCoupon = process.env.STRIPE_FREE_MONTH_COUPON;
  const firstMonthCoupon = process.env.STRIPE_FIRST_MONTH_COUPON;
  let coupon: string | undefined;
  let usedBonus = false;
  let usedOffer = false;
  // Le coupon « mois offert » ne s'applique qu'au MENSUEL : sur un tarif
  // annuel, un coupon 100 % « une fois » offrirait l'année entière. En
  // annuel, les mois en attente sont convertis en crédits juste après le
  // premier paiement (voir flushBonusMonths dans src/lib/billing/rewards.ts).
  if ((user?.bonusMonths ?? 0) > 0 && freeMonthCoupon && interval === "month") {
    coupon = freeMonthCoupon;
    usedBonus = true;
  } else if (interval === "month" && firstMonthCoupon && !user?.firstPaidAt && isOfferActive(user?.offerExpiresAt, user?.offerUsedAt)) {
    coupon = firstMonthCoupon;
    usedOffer = true;
  }

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const client = stripe();
  const metadata = { userId, plan, interval, maxBrands: String(maxBrands), usedBonus: usedBonus ? "1" : "0", usedOffer: usedOffer ? "1" : "0" };

  const checkoutSession = await client.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    customer: existing?.stripeCustomerId || undefined,
    customer_email: !existing?.stripeCustomerId ? session.user.email ?? undefined : undefined,
    subscription_data: { metadata },
    metadata,
    // Codes promo Stripe (partenaires, campagnes — section IV de la note du
    // 24/09/2026) : saisis par la personne sur la page de paiement. Stripe
    // interdit de cumuler avec `discounts`, donc seulement quand aucune
    // réduction automatique (mois offert, offre -50 %) n'est déjà appliquée.
    ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
    success_url: `${appUrl}/billing?checkout=success`,
    cancel_url: `${appUrl}/billing?checkout=cancel`
  });

  await trackGrowth("checkout_started", { plan, interval, maxBrands, usedBonus, usedOffer, reason: parsed.data.reason ?? "" }, userId);
  return NextResponse.json({ url: checkoutSession.url, coupon: usedBonus ? "free-month" : usedOffer ? "first-month-50" : null });
}
