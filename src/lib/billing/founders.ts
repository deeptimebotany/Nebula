// Offres fondateurs (02/10/2026, avant l'ouverture) — côté serveur. Les
// valeurs (prix, durées, places) sont dans src/lib/founders-offer.ts.
//
// « Fondateur » (mensuel) :
//   - proposé sur Pro 1 marque en MENSUEL, pour un premier abonnement
//     (jamais payé, pas déjà fondateur), tant qu'il reste des places ;
//   - un coupon Stripe « 2 € de remise pendant 3 mois » (12 € → 10 €),
//     plafonné à 100 utilisations : Stripe garantit la limite. Créé
//     automatiquement au premier usage (identifiant fixe), ou lu dans
//     STRIPE_FOUNDER_COUPON ;
//   - l'abonnement est un abonnement normal : prélevé automatiquement chaque
//     mois, 10 € les 3 premiers mois puis 12 € ;
//   - le webhook marque le compte (founderKind « MONTHLY ») quand
//     l'abonnement est actif.
// « Fondateur Premium » :
//   - 100 € en une fois (Stripe Checkout « payment »), renonciation au droit
//     de rétractation (accès immédiat), 100 places ;
//   - donne Pro 1 marque pendant 12 mois par l'accès offert existant
//     (User.compPlan / compUntil, comme les partenaires) + une ligne
//     PartnerGrant pour l'historique de /admin/partenaires ;
//   - rappels à J-30 et J-7 (cloche + e-mail), puis à la fin : limites du
//     Gratuit si aucun abonnement n'a pris le relais, et la question « quel
//     forfait vous faut-il ? » (FounderEndModal). Jamais de prélèvement
//     automatique.
// Les deux posent founderSince : badge « Fondateur » à vie.
// Vente des deux offres jusqu'au 1er janvier 2027 à 0 h, heure de Paris
// (FOUNDERS_SALE_ENDS_AT) : ensuite plus aucune éligibilité, et le coupon
// créé par Nebula porte la même date limite chez Stripe (redeem_by).
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isBillingEnabled, stripe } from "@/lib/billing/stripe";
import { getUserPlan } from "@/lib/billing/plan";
import { applyFreeLimits, reactivateAfterUpgrade } from "@/lib/billing/free-limits";
import { notify } from "@/lib/notifications";
import { alertOwner } from "@/lib/owner-alerts";
import { emailIdempotencyKey, escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { emailLayout, emailPlainText, type EmailLayoutInput } from "@/lib/emails/layout";
import { trackGrowth } from "@/lib/growth";
import { PLAN_LIMITS } from "@/lib/plans";
import {
  FOUNDERS_SALE_ENDS_AT,
  FOUNDERS_SALE_END_LABEL,
  FOUNDER_MONTHLY,
  FOUNDER_PREMIUM,
  FOUNDER_PREMIUM_NOTE,
  addMonthsUtc,
  euros,
  founderDiscountCents,
  founderRegularPrice,
  foundersSaleOpen,
  placesOf,
  type FounderPlaces,
  type FoundersResponse
} from "@/lib/founders-offer";

export { addMonthsUtc };
export const FOUNDER_PREMIUM_KIND = "founder_premium";
/** Identifiant fixe du coupon Stripe créé automatiquement (mode test et mode réel séparés chez Stripe). */
export const FOUNDER_COUPON_ID = "nebula-fondateur-3-mois";
/** Rappels avant la fin de l'année Premium (jours). */
export const PREMIUM_REMINDER_DAYS = [30, 7] as const;
const DAY = 86_400_000;

function appUrl(): string {
  return (process.env.NEXTAUTH_URL || "https://nebulahub.space").replace(/\/$/, "");
}

function frDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

// --- Places et éligibilité --------------------------------------------------------

export async function founderPlaces(): Promise<{ monthly: FounderPlaces; premium: FounderPlaces }> {
  const [monthly, premium] = await Promise.all([
    prisma.user.count({ where: { founderKind: "MONTHLY" } }),
    prisma.user.count({ where: { founderPremiumAt: { not: null } } })
  ]);
  return { monthly: placesOf(FOUNDER_MONTHLY.places, monthly), premium: placesOf(FOUNDER_PREMIUM.places, premium) };
}

interface FounderUser {
  founderKind: string | null;
  founderSince: Date | null;
  founderPremiumAt: Date | null;
  founderPremiumUntil: Date | null;
  founderPremiumSessionId: string | null;
  firstPaidAt: Date | null;
}

const FOUNDER_SELECT = { founderKind: true, founderSince: true, founderPremiumAt: true, founderPremiumUntil: true, founderPremiumSessionId: true, firstPaidAt: true } as const;

export interface FounderEligibility {
  monthly: boolean;
  premium: boolean;
  premiumBlocked: string | null;
  user: FounderUser | null;
}

/** Ce compte peut-il prendre l'une ou l'autre offre, maintenant ? Plus rien après le 1er janvier 2027. */
export async function founderEligibility(userId: string, places?: { monthly: FounderPlaces; premium: FounderPlaces }, now: Date = new Date()): Promise<FounderEligibility> {
  const [user, info, left] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: FOUNDER_SELECT }),
    getUserPlan(userId),
    places ? Promise.resolve(places) : founderPlaces()
  ]);
  if (!user) return { monthly: false, premium: false, premiumBlocked: "Compte introuvable.", user: null };
  const saleOpen = foundersSaleOpen(now);
  // Premier abonnement seulement : jamais payé, pas déjà fondateur.
  const monthly = saleOpen && left.monthly.left > 0 && !info.paid && !user.firstPaidAt && !user.founderKind && !user.founderPremiumAt;
  let premiumBlocked: string | null = null;
  if (user.founderPremiumSessionId) premiumBlocked = user.founderPremiumAt ? "Vous êtes déjà Fondateur Premium : merci !" : "L'offre Fondateur Premium ne se prend qu'une fois par compte.";
  else if (!saleOpen) premiumBlocked = `L'offre Fondateur Premium a pris fin le ${FOUNDERS_SALE_END_LABEL}.`;
  else if (info.paid) premiumBlocked = "Vous avez déjà un abonnement en cours : l'offre Fondateur Premium est réservée aux comptes sans abonnement.";
  else if (info.pausedUntil) premiumBlocked = "Votre abonnement est en pause : il reprendra seul à sa date. L'offre Premium est réservée aux comptes sans abonnement.";
  else if (info.comp) premiumBlocked = "Vous profitez déjà d'un accès offert.";
  else if (left.premium.left <= 0) premiumBlocked = "Les 100 places Fondateur Premium sont toutes prises.";
  return { monthly, premium: premiumBlocked === null, premiumBlocked, user };
}

/** Réponse de GET /api/billing/founders (places, et l'état du compte connecté). */
export async function foundersSnapshot(userId: string | null, now: Date = new Date()): Promise<FoundersResponse> {
  const places = await founderPlaces();
  const open = isBillingEnabled();
  let me: FoundersResponse["me"] = null;
  if (userId) {
    const e = await founderEligibility(userId, places, now);
    const kind = e.user?.founderKind === "MONTHLY" || e.user?.founderKind === "PREMIUM" ? e.user.founderKind : null;
    me = {
      kind,
      since: e.user?.founderSince?.toISOString() ?? null,
      premiumUntil: e.user?.founderPremiumAt && e.user.founderPremiumUntil ? e.user.founderPremiumUntil.toISOString() : null,
      monthlyEligible: open && e.monthly,
      premiumEligible: open && e.premium,
      premiumBlocked: open ? e.premiumBlocked : "Les paiements ne sont pas encore ouverts."
    };
  }
  return {
    open,
    saleOpen: foundersSaleOpen(now),
    saleEndsAt: FOUNDERS_SALE_ENDS_AT.toISOString(),
    monthly: { ...places.monthly, priceMonthly: FOUNDER_MONTHLY.priceMonthly, months: FOUNDER_MONTHLY.months, regularPrice: founderRegularPrice() },
    premium: { ...places.premium, priceCents: FOUNDER_PREMIUM.priceCents, months: FOUNDER_PREMIUM.months },
    me
  };
}

// --- « Fondateur » : coupon Stripe ------------------------------------------------

let cachedCoupon: string | null = null;

/** Pour les tests. */
export function resetFounderCouponCache(): void {
  cachedCoupon = null;
}

/**
 * Coupon « Fondateur » : celui de STRIPE_FOUNDER_COUPON, sinon le coupon à
 * identifiant fixe, créé au premier usage (remise de 12 € - 10 € pendant
 * 3 mois, 100 utilisations au plus). null = indisponible (le paiement se
 * fait alors au prix normal, affiché par Stripe avant de payer).
 */
export async function founderCouponId(): Promise<string | null> {
  if (process.env.STRIPE_FOUNDER_COUPON) return process.env.STRIPE_FOUNDER_COUPON;
  if (cachedCoupon) return cachedCoupon;
  const client = stripe();
  try {
    const c = await client.coupons.retrieve(FOUNDER_COUPON_ID);
    if (!c.valid) return null;
    cachedCoupon = c.id;
    return c.id;
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") {
      console.error("[fondateurs] coupon illisible :", (err as Error).message);
      return null;
    }
  }
  try {
    const c = await client.coupons.create({
      id: FOUNDER_COUPON_ID,
      name: "Offre Fondateur (3 mois)",
      amount_off: founderDiscountCents(),
      currency: "eur",
      duration: "repeating",
      duration_in_months: FOUNDER_MONTHLY.months,
      max_redemptions: FOUNDER_MONTHLY.places,
      // Stripe refuse aussi le coupon après la fin de la vente (1er janvier 2027).
      redeem_by: Math.floor(FOUNDERS_SALE_ENDS_AT.getTime() / 1000),
      metadata: { nebula: "founder_monthly" }
    });
    cachedCoupon = c.id;
    return c.id;
  } catch (err) {
    console.error("[fondateurs] coupon non créé :", (err as Error).message);
    return null;
  }
}

/** Webhook : abonnement actif pris avec l'offre « Fondateur » → compte marqué (une fois). */
export async function markMonthlyFounder(userId: string, sub: Pick<Stripe.Subscription, "status" | "metadata">, now: Date = new Date()): Promise<boolean> {
  if (sub.metadata?.founder !== "1" || !["active", "trialing"].includes(sub.status)) return false;
  const res = await prisma.user.updateMany({ where: { id: userId, founderKind: null }, data: { founderKind: "MONTHLY", founderSince: now } });
  if (res.count === 0) return false;
  await notify(userId, {
    kind: "achievement",
    title: "Bienvenue parmi les fondateurs",
    body: `Merci de soutenir Nebula dès le début : ${FOUNDER_MONTHLY.priceMonthly} € par mois pendant ${FOUNDER_MONTHLY.months} mois, puis ${founderRegularPrice()} €. Votre badge « Fondateur » est visible dans la Communauté et sur votre carte de créateur, pour toujours.`,
    href: "/community",
    actionLabel: "Voir la Communauté",
    dedupeKey: "founder:welcome"
  });
  await trackGrowth("founder_joined", { kind: "MONTHLY" }, userId);
  return true;
}

// --- « Fondateur Premium » : paiement unique ----------------------------------------

/** Ligne de paiement : prix Stripe s'il est configuré, sinon montant fixe (aucun réglage requis). */
export function founderPremiumLineItem(): Stripe.Checkout.SessionCreateParams.LineItem {
  const price = process.env.STRIPE_PRICE_FOUNDER_PREMIUM;
  if (price) return { price, quantity: 1 };
  return {
    quantity: 1,
    price_data: {
      currency: "eur",
      unit_amount: FOUNDER_PREMIUM.priceCents,
      product_data: {
        name: "Nebula Fondateur Premium",
        description: `${PLAN_LIMITS.PRO.label} 1 marque pendant ${FOUNDER_PREMIUM.months} mois. Paiement unique, sans renouvellement automatique.`
      }
    }
  };
}

class AlreadyGranted extends Error {}

/**
 * Webhook (checkout.session.completed / async_payment_succeeded) : accorde
 * l'année Premium, une seule fois par session. Un second achat (deux onglets
 * ouverts) n'est pas cumulé : le propriétaire est prévenu pour rembourser.
 */
export async function grantFounderPremium(session: Stripe.Checkout.Session, now: Date = new Date()): Promise<"granted" | "already" | "duplicate" | "ignored"> {
  if (session.mode !== "payment" || session.metadata?.kind !== FOUNDER_PREMIUM_KIND) return "ignored";
  if (session.payment_status !== "paid") return "ignored";
  const userId = session.client_reference_id || session.metadata?.userId;
  if (!userId) return "ignored";
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, founderKind: true, founderSince: true, founderPremiumSessionId: true } });
  if (!user) return "ignored";
  if (user.founderPremiumSessionId === session.id) return "already";
  if (user.founderPremiumSessionId) {
    await alertOwner({
      title: "Fondateur Premium payé deux fois",
      body: `${user.email} a payé une seconde fois (${session.id}). L'année n'est pas cumulée : remboursez ce paiement depuis Stripe.`,
      dedupeKey: `founder-duplicate:${session.id}`,
      href: "/admin/partenaires",
      actionLabel: "Voir les accès"
    }).catch(() => undefined);
    return "duplicate";
  }
  const until = addMonthsUtc(now, FOUNDER_PREMIUM.months);
  const paymentId = idOf(session.payment_intent as string | Stripe.PaymentIntent | null);
  try {
    await prisma.$transaction(async (tx) => {
      const res = await tx.user.updateMany({
        where: { id: userId, founderPremiumSessionId: null },
        data: {
          compPlan: FOUNDER_PREMIUM.plan,
          compMaxBrands: FOUNDER_PREMIUM.maxBrands,
          compUntil: until,
          compNote: FOUNDER_PREMIUM_NOTE,
          founderPremiumAt: now,
          founderPremiumUntil: until,
          founderPremiumSessionId: session.id,
          founderPremiumPaymentId: paymentId,
          founderPremiumEndedAt: null,
          founderEndNoticeAt: null,
          ...(user.founderKind ? {} : { founderKind: "PREMIUM" }),
          ...(user.founderSince ? {} : { founderSince: now })
        }
      });
      if (res.count === 0) throw new AlreadyGranted();
      await tx.partnerGrant.create({
        data: { email: user.email, plan: FOUNDER_PREMIUM.plan, maxBrands: FOUNDER_PREMIUM.maxBrands, months: FOUNDER_PREMIUM.months, note: `${FOUNDER_PREMIUM_NOTE} (${euros(session.amount_total ?? FOUNDER_PREMIUM.priceCents)} payés)`, appliedAt: now, expiresAt: until, userId }
      });
    });
  } catch (err) {
    if (err instanceof AlreadyGranted) return "already";
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "already";
    throw err;
  }
  // Marques et comptes en veille (fin d'essai) : réveillés dans la limite de Pro 1 marque.
  await reactivateAfterUpgrade(userId, now).catch((e) => console.error("[fondateurs] réactivation :", (e as Error).message));
  await notify(userId, {
    kind: "achievement",
    title: "Vous êtes Fondateur Premium",
    body: `Merci de soutenir Nebula ! ${PLAN_LIMITS.PRO.label} 1 marque est actif jusqu'au ${frDate(until)}. Rien ne sera prélevé ensuite : nous vous demanderons quel forfait il vous faut.`,
    href: "/billing",
    actionLabel: "Voir mon accès",
    dedupeKey: "founder:premium"
  });
  await sendFounderEmail(user.email, `founder-premium:${session.id}`, {
    title: `Merci${user.name ? `, ${escapeHtml(user.name.split(/\s+/)[0] ?? "")}` : ""} : vous êtes Fondateur Premium`,
    paragraphs: [
      `Votre paiement de <strong>${euros(session.amount_total ?? FOUNDER_PREMIUM.priceCents)}</strong> est confirmé. Le palier <strong>${PLAN_LIMITS.PRO.label} 1 marque</strong> est actif dès maintenant, jusqu'au <strong>${frDate(until)}</strong>.`,
      "Rien ne sera prélevé à la fin : un mois avant, puis une semaine avant, nous vous prévenons, et le jour venu Nebula vous demande quel forfait il vous faut. Sans réponse, vous repassez simplement au palier Gratuit, sans rien perdre.",
      "Votre badge « Fondateur » apparaît dans la Communauté et sur votre carte de créateur, pour toujours. Une idée, un bug ? Répondez à cet e-mail : je lis tout."
    ],
    cta: { label: "Ouvrir Nebula", url: `${appUrl()}/dashboard` },
    signature: true
  }, "Vous êtes Fondateur Premium de Nebula");
  await trackGrowth("founder_joined", { kind: "PREMIUM" }, userId);
  return "granted";
}

/** Remboursement complet d'un achat Premium : accès retiré, place libérée, badge retiré s'il venait de là. */
export async function revokeRefundedFounderPremium(charge: Pick<Stripe.Charge, "payment_intent" | "refunded">, now: Date = new Date()): Promise<boolean> {
  const paymentId = idOf(charge.payment_intent as string | Stripe.PaymentIntent | null);
  if (!paymentId || !charge.refunded) return false;
  const user = await prisma.user.findUnique({ where: { founderPremiumPaymentId: paymentId }, select: { id: true, founderKind: true, founderPremiumAt: true, compNote: true } });
  if (!user?.founderPremiumAt) return false;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        founderPremiumAt: null,
        founderPremiumUntil: null,
        ...(user.founderKind === "PREMIUM" ? { founderKind: null, founderSince: null } : {}),
        ...(user.compNote === FOUNDER_PREMIUM_NOTE ? { compPlan: null, compMaxBrands: null, compUntil: null, compNote: null } : {})
      }
    }),
    prisma.partnerGrant.updateMany({ where: { userId: user.id, note: { startsWith: FOUNDER_PREMIUM_NOTE }, revokedAt: null }, data: { revokedAt: now } })
  ]);
  await applyFreeLimits(user.id, "founder_end", now).catch((e) => console.error("[fondateurs] limites :", (e as Error).message));
  return true;
}

// --- Rappels et fin de l'année Premium (cron) -----------------------------------------

async function sendFounderEmail(to: string, key: string, layout: EmailLayoutInput, subject: string): Promise<void> {
  if (!isEmailConfigured()) return;
  await sendEmail({ to, subject, idempotencyKey: emailIdempotencyKey("founder", to, key), html: emailLayout(layout), text: emailPlainText(layout) }).catch(() => undefined);
}

/**
 * Tâche du cron (account-jobs.ts) : rappels J-30 et J-7 de la fin de
 * l'année Premium, puis la fin elle-même (accès offert retiré, limites du
 * Gratuit si aucun abonnement n'a pris le relais, question « quel forfait
 * vous faut-il ? » à la prochaine visite). Idempotente.
 */
export async function runFounderJobs(now: Date = new Date()): Promise<{ reminders: number; ended: number }> {
  let reminders = 0;
  // Sans abonnement payant actif (sinon il prend le relais : pas de rappel).
  const soon = await prisma.user.findMany({
    where: {
      founderPremiumAt: { not: null },
      founderPremiumEndedAt: null,
      founderPremiumUntil: { gt: now, lte: new Date(now.getTime() + PREMIUM_REMINDER_DAYS[0] * DAY) },
      OR: [{ subscription: null }, { subscription: { plan: "FREE" } }, { subscription: { status: { notIn: ["ACTIVE", "TRIALING"] } } }]
    },
    select: { id: true, email: true, founderPremiumUntil: true },
    take: 200
  });
  // Une seule lecture des rappels déjà envoyés (la tâche passe chaque minute).
  const keys = PREMIUM_REMINDER_DAYS.map((d) => `founder:premium-j${d}`);
  const sent = soon.length
    ? new Set((await prisma.notification.findMany({ where: { userId: { in: soon.map((u) => u.id) }, dedupeKey: { in: keys } }, select: { userId: true, dedupeKey: true } })).map((n) => `${n.userId}:${n.dedupeKey}`))
    : new Set<string>();
  for (const u of soon) {
    const until = u.founderPremiumUntil!;
    const daysLeft = Math.ceil((until.getTime() - now.getTime()) / DAY);
    const step = daysLeft <= PREMIUM_REMINDER_DAYS[1] ? PREMIUM_REMINDER_DAYS[1] : PREMIUM_REMINDER_DAYS[0];
    const dedupeKey = `founder:premium-j${step}`;
    if (sent.has(`${u.id}:${dedupeKey}`)) continue;
    const when = step === PREMIUM_REMINDER_DAYS[1] ? "dans une semaine" : "dans un mois";
    await notify(u.id, {
      kind: "reminder",
      title: `Votre année Fondateur Premium se termine ${when}`,
      body: `${PLAN_LIMITS.PRO.label} 1 marque reste actif jusqu'au ${frDate(until)}. Rien ne sera prélevé : choisissez le forfait qui vous convient, ou repassez au Gratuit sans rien perdre.`,
      href: "/billing#paliers",
      actionLabel: "Choisir mon forfait",
      dedupeKey
    });
    await sendFounderEmail(u.email, `j${step}:${until.toISOString().slice(0, 10)}`, {
      title: `Votre année Fondateur Premium se termine ${when}`,
      paragraphs: [
        `Merci encore d'avoir soutenu Nebula. Votre palier <strong>${PLAN_LIMITS.PRO.label} 1 marque</strong> reste actif jusqu'au <strong>${frDate(until)}</strong>.`,
        "Rien ne sera prélevé automatiquement. Pour continuer sans interruption, choisissez votre forfait dans Abonnement ; sinon, vous repasserez au palier Gratuit, sans rien perdre. Votre badge « Fondateur », lui, reste à vie."
      ],
      cta: { label: "Choisir mon forfait", url: `${appUrl()}/billing#paliers` },
      signature: true
    }, `Votre année Fondateur Premium se termine ${when}`);
    reminders += 1;
  }

  let ended = 0;
  const due = await prisma.user.findMany({
    where: { founderPremiumAt: { not: null }, founderPremiumEndedAt: null, founderPremiumUntil: { lte: now } },
    select: { id: true, email: true, compNote: true },
    take: 200
  });
  for (const u of due) {
    const res = await prisma.user.updateMany({
      where: { id: u.id, founderPremiumEndedAt: null },
      data: { founderPremiumEndedAt: now, ...(u.compNote === FOUNDER_PREMIUM_NOTE ? { compPlan: null, compMaxBrands: null, compUntil: null, compNote: null } : {}) }
    });
    if (res.count === 0) continue;
    ended += 1;
    const info = await getUserPlan(u.id);
    if (info.paid || info.comp) continue;
    await applyFreeLimits(u.id, "founder_end", now).catch((e) => console.error("[fondateurs] limites :", (e as Error).message));
    await notify(u.id, {
      kind: "reminder",
      title: "Votre année Fondateur Premium est terminée",
      body: "Merci pour cette année ! Quel forfait vous faut-il maintenant ? Rien n'a été prélevé : vous êtes en Gratuit, sans rien perdre, jusqu'à votre choix.",
      href: "/billing#paliers",
      actionLabel: "Choisir mon forfait",
      dedupeKey: "founder:premium-end"
    });
    await sendFounderEmail(u.email, `end:${now.toISOString().slice(0, 10)}`, {
      title: "Votre année Fondateur Premium est terminée",
      paragraphs: [
        "Merci d'avoir soutenu Nebula pendant cette première année. Rien n'a été prélevé : votre compte est passé au palier Gratuit, et tout est conservé (les marques en trop sont en veille, pas supprimées).",
        "Quel forfait vous faut-il maintenant ? Pro 1 marque, Pro 5 ou 10 marques, Agence : choisissez dans Abonnement, tout se réactive aussitôt. Votre badge « Fondateur » reste à vie."
      ],
      cta: { label: "Choisir mon forfait", url: `${appUrl()}/billing#paliers` },
      signature: true
    }, "Votre année Fondateur Premium est terminée");
  }
  return { reminders, ended };
}

/** Réponse à la question de fin d'année (modale) : on ne la repose plus. */
export async function recordFounderEndChoice(userId: string, choice: string, now: Date = new Date()): Promise<boolean> {
  const res = await prisma.user.updateMany({ where: { id: userId, founderPremiumEndedAt: { not: null }, founderEndNoticeAt: null }, data: { founderEndNoticeAt: now } });
  if (res.count) await trackGrowth("founder_end_choice", { choice }, userId);
  return res.count > 0;
}
