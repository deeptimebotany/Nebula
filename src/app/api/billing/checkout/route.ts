import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, isBillingEnabled } from "@/lib/billing/stripe";
import { PAID_PLANS, PLAN_LIMITS, findTier, upToBrandsText, type Plan, type BillingInterval } from "@/lib/plans";
import { isOfferActive } from "@/lib/trial";
import { trackGrowth } from "@/lib/growth";
import { founderCouponId, founderEligibility } from "@/lib/billing/founders";
import { FOUNDER_PREMIUM, isFounderMonthlyTier } from "@/lib/founders-offer";
import { z } from "zod";

const bodySchema = z.object({
  plan: z.enum(PAID_PLANS),
  interval: z.enum(["month", "year"]).default("month"),
  maxBrands: z.number().int().positive(),
  /** Raison de la modale de mise à niveau qui a mené ici (mesure). */
  reason: z.string().max(40).optional(),
  /** Offre « Fondateur » demandée (Pro 1 marque, mensuel) : appliquée si le compte y a droit. */
  founder: z.boolean().optional()
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
        error: `${envVar} manquant : créez le tarif "${limits.label} — ${upToBrandsText(maxBrands)}" (${interval === "year" ? "annuel" : "mensuel"}) dans le Dashboard Stripe et copiez son Price ID dans .env.`
      },
      { status: 503 }
    );
  }

  const userId = (session.user as { id: string }).id;
  const [existing, user] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { bonusMonths: true, offerExpiresAt: true, offerUsedAt: true, firstPaidAt: true, founderPremiumAt: true, founderPremiumUntil: true } })
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

  // Offre « Fondateur » (02/10/2026, src/lib/billing/founders.ts) : Pro
  // 1 marque en mensuel, premier abonnement, places restantes → coupon
  // « 10 € pendant 3 mois ». Elle passe avant le mois offert et l'offre
  // -50 % (même économie, plus le badge) ; les mois offerts en attente ne
  // sont pas perdus : convertis en crédit après le premier paiement
  // (flushBonusMonths).
  let founderCoupon: string | null = null;
  if (parsed.data.founder && isFounderMonthlyTier(plan, maxBrands, interval) && (await founderEligibility(userId)).monthly) {
    founderCoupon = await founderCouponId().catch(() => null);
  }

  // Fondateur Premium en cours qui prend la suite en Pro 1 marque (même
  // palier) : rien n'est prélevé avant la fin de son année (période d'essai
  // Stripe jusqu'à cette date), pas de chevauchement. Un autre palier
  // démarre, lui, tout de suite.
  const deferUntil =
    user?.founderPremiumAt && user.founderPremiumUntil && plan === FOUNDER_PREMIUM.plan && maxBrands === FOUNDER_PREMIUM.maxBrands && user.founderPremiumUntil.getTime() > Date.now() + 2 * 86_400_000
      ? user.founderPremiumUntil
      : null;

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const client = stripe();
  const customerEmail = !existing?.stripeCustomerId ? session.user.email ?? undefined : undefined;
  const create = (discount: { coupon: string | null; founder: boolean; usedBonus: boolean; usedOffer: boolean }) => {
    const metadata = {
      userId,
      plan,
      interval,
      maxBrands: String(maxBrands),
      usedBonus: discount.usedBonus ? "1" : "0",
      usedOffer: discount.usedOffer ? "1" : "0",
      founder: discount.founder ? "1" : "0"
    };
    return client.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      customer: existing?.stripeCustomerId || undefined,
      customer_email: customerEmail,
      subscription_data: { metadata, ...(deferUntil ? { trial_end: Math.floor(deferUntil.getTime() / 1000) } : {}) },
      metadata,
      // Codes promo Stripe (partenaires, campagnes — section IV de la note du
      // 24/09/2026) : saisis par la personne sur la page de paiement. Stripe
      // interdit de cumuler avec `discounts`, donc seulement quand aucune
      // réduction automatique (Fondateur, mois offert, offre -50 %) n'est déjà appliquée.
      ...(discount.coupon ? { discounts: [{ coupon: discount.coupon }] } : { allow_promotion_codes: true }),
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=cancel`
    });
  };

  const fallback = { coupon: coupon ?? null, founder: false, usedBonus, usedOffer };
  let applied = founderCoupon ? { coupon: founderCoupon, founder: true, usedBonus: false, usedOffer: false } : fallback;
  let checkoutSession;
  try {
    checkoutSession = await create(applied);
  } catch (err) {
    // Coupon Fondateur épuisé chez Stripe (100 utilisations) : prix normal.
    if (!applied.founder) throw err;
    console.error("[checkout] offre Fondateur refusée par Stripe :", (err as Error).message);
    applied = fallback;
    checkoutSession = await create(applied);
  }

  await trackGrowth("checkout_started", { plan, interval, maxBrands, usedBonus: applied.usedBonus, usedOffer: applied.usedOffer, founder: applied.founder, reason: parsed.data.reason ?? "" }, userId);
  return NextResponse.json({ url: checkoutSession.url, coupon: applied.founder ? "founder" : applied.usedBonus ? "free-month" : applied.usedOffer ? "first-month-50" : null, firstChargeAt: deferUntil ? deferUntil.toISOString() : null });
}
