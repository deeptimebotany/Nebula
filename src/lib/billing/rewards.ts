// Récompenses « un mois de Pro offert » (brief growth, lots G1.a et G7 —
// règles revues le 25/09/2026) :
//   - la marque dont le badge « Propulsé par Nebula » a amené un compte qui
//     devient payant (User.acqVia = slug de la marque) ;
//   - le parrain, quand son filleul devient payant (User.referredByCode).
//
// Règles (texte affiché dans Mon profil, voir profile-panel.tsx) :
//   1. La récompense est mise en attente au premier abonnement du filleul
//      (ReferralReward, statut PENDING), puis accordée par le cron 30 jours
//      plus tard SI le filleul a réellement payé (une facture > 0 €, pas
//      seulement un mois offert) et n'a pas résilié entre-temps.
//   2. Plafond : 12 mois offerts au maximum sur 12 mois glissants par
//      bénéficiaire, parrainage et badge confondus. Au-delà, statut CAPPED :
//      pas de mois, mais le filleul compte pour les paliers ambassadeur
//      (5, 10, 25, 50 filleuls abonnés — succès + badges, sans coût).
//
// Mécanisme du mois offert :
//   - abonné payant : crédit sur le solde client Stripe, égal à un mois du
//     Pro d'entrée de gamme. Les crédits s'additionnent (deux mois gagnés
//     la même semaine = deux mois déduits) et fonctionnent aussi pour un
//     abonnement annuel — l'ancien coupon « une fois » remplaçait le
//     précédent et offrait une année entière sur un tarif annuel ;
//   - compte gratuit : User.bonusMonths est incrémenté, consommé à la
//     prochaine souscription mensuelle via STRIPE_FREE_MONTH_COUPON (voir
//     /api/billing/checkout), le reste étant converti en crédits dès que
//     l'abonnement tourne (flushBonusMonths).
import { prisma } from "@/lib/prisma";
import { stripe, isBillingEnabled } from "@/lib/billing/stripe";
import { sendRewardEmail } from "@/lib/emails/growth";
import { trackGrowth } from "@/lib/growth";
import { PLAN_LIMITS } from "@/lib/plans";
import { referralRewardDb } from "@/lib/prisma-extra";
import { notify } from "@/lib/notifications";
import { markEasterEggFound } from "@/lib/easter-eggs/server";

export type RewardReason = "badge" | "referral";
export type RewardMode = "credit" | "bonus";

export const REWARD_DELAY_DAYS = 30;
export const REWARD_CAP_MONTHS = 12;
export const REWARD_WINDOW_DAYS = 365;
// Sans premier vrai paiement au bout de ce délai, la récompense est annulée.
const REWARD_GIVE_UP_DAYS = 120;

export const AMBASSADOR_TIERS: { at: number; key: string; label: string; emoji: string }[] = [
  { at: 5, key: "ambassador-bronze", label: "Ambassadeur bronze", emoji: "🥉" },
  { at: 10, key: "ambassador-silver", label: "Ambassadeur argent", emoji: "🥈" },
  { at: 25, key: "ambassador-gold", label: "Ambassadeur or", emoji: "🥇" },
  { at: 50, key: "ambassador-legend", label: "Ambassadeur légendaire", emoji: "🌠" }
];

const DAY = 86_400_000;

export function freeMonthCouponId(): string | null {
  return process.env.STRIPE_FREE_MONTH_COUPON || null;
}

/** Valeur d'« un mois de Pro » en centimes (Pro d'entrée de gamme, mensuel). */
export function proMonthValueCents(): number {
  const prices = PLAN_LIMITS.PRO.tiers.map((t) => t.priceMonthly).filter((p) => p > 0);
  return Math.round((prices.length ? Math.min(...prices) : 9) * 100);
}

interface PaidSub {
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  status: string;
  plan: string;
}

function activeCustomerId(sub: PaidSub | null | undefined): string | null {
  if (!sub?.stripeSubscriptionId || !sub.stripeCustomerId) return null;
  if (sub.status !== "ACTIVE" && sub.status !== "TRIALING") return null;
  if (sub.plan === "FREE") return null;
  return sub.stripeCustomerId;
}

/** Crédite `months` mois de Pro sur le solde Stripe du client. */
async function creditMonths(customerId: string, months: number, description: string): Promise<void> {
  await stripe().customers.createBalanceTransaction(customerId, {
    amount: -proMonthValueCents() * months,
    currency: "eur",
    description
  });
}

/** Applique un mois de Pro offert au compte `userId`. Renvoie le mode utilisé. */
export async function grantProMonth(userId: string, reason: RewardReason, meta: { fromName?: string; brandSlug?: string }): Promise<RewardMode | "skipped"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, subscription: { select: { stripeSubscriptionId: true, stripeCustomerId: true, status: true, plan: true } } }
  });
  if (!user) return "skipped";

  let mode: RewardMode = "bonus";
  const customerId = activeCustomerId(user.subscription);
  if (customerId && isBillingEnabled()) {
    try {
      await creditMonths(customerId, 1, reason === "badge" ? "Nebula — 1 mois de Pro offert (badge Propulsé par Nebula)" : "Nebula — 1 mois de Pro offert (parrainage)");
      mode = "credit";
    } catch (err) {
      console.error("[rewards] crédit Stripe non appliqué, repli sur bonusMonths :", (err as Error).message);
    }
  }
  if (mode === "bonus") {
    await prisma.user.update({ where: { id: userId }, data: { bonusMonths: { increment: 1 } } });
  }

  await trackGrowth("reward_granted", { reason, mode, brandSlug: meta.brandSlug ?? "" }, userId);
  await sendRewardEmail({ to: user.email, firstName: user.name.split(" ")[0], reason, fromName: meta.fromName, mode }).catch(() => undefined);
  const who = meta.fromName ?? "Votre filleul";
  await notify(userId, {
    kind: "referral",
    title: reason === "badge" ? "Badge « Propulsé par Nebula »" : "Parrainage",
    body:
      mode === "credit"
        ? `${who} est toujours abonné : 1 mois de Pro vous est offert, déduit de votre prochaine facture.`
        : `${who} est toujours abonné : 1 mois de Pro vous est offert, déduit de votre prochaine souscription.`,
    href: "/billing",
    actionLabel: "Voir ma facturation"
  });
  return mode;
}

/**
 * Convertit les mois offerts en attente (User.bonusMonths) en crédits sur
 * le solde Stripe, dès que le compte a un abonnement payant actif. Appelé
 * après le premier paiement et par le cron (filet de sécurité).
 */
export async function flushBonusMonths(userId: string): Promise<number> {
  if (!isBillingEnabled()) return 0;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bonusMonths: true, subscription: { select: { stripeSubscriptionId: true, stripeCustomerId: true, status: true, plan: true } } }
  });
  const months = user?.bonusMonths ?? 0;
  const customerId = activeCustomerId(user?.subscription);
  if (!user || months <= 0 || !customerId) return 0;
  // Remise à zéro conditionnelle AVANT le crédit : deux exécutions qui se
  // chevauchent ne peuvent pas créditer deux fois les mêmes mois.
  const claimed = await prisma.user.updateMany({ where: { id: userId, bonusMonths: months }, data: { bonusMonths: 0 } });
  if (claimed.count === 0) return 0;
  try {
    await creditMonths(customerId, months, `Nebula — ${months} mois de Pro offert${months > 1 ? "s" : ""} (en attente)`);
    return months;
  } catch (err) {
    await prisma.user.update({ where: { id: userId }, data: { bonusMonths: { increment: months } } });
    console.error("[rewards] conversion des mois offerts impossible :", (err as Error).message);
    return 0;
  }
}

/** Filet de sécurité du cron : convertit les mois en attente des abonnés actifs. */
export async function flushAllBonusMonths(): Promise<number> {
  if (!isBillingEnabled()) return 0;
  const users = await prisma.user.findMany({
    where: { bonusMonths: { gt: 0 }, subscription: { is: { status: { in: ["ACTIVE", "TRIALING"] }, plan: { not: "FREE" }, stripeSubscriptionId: { not: null } } } },
    select: { id: true },
    take: 50
  });
  let total = 0;
  for (const u of users as { id: string }[]) total += await flushBonusMonths(u.id);
  return total;
}

/**
 * Appelé une seule fois par compte devenu payant (webhook Stripe, premier
 * abonnement) : met en attente la récompense de la marque apporteuse et/ou
 * du parrain. Accordée (ou non) 30 jours plus tard par processDueRewards.
 */
export async function rewardOnFirstPayment(payer: { id: string; name: string; acqVia: string | null; referredByCode: string | null }): Promise<void> {
  const firstName = payer.name.split(" ")[0];
  const eligibleAt = new Date(Date.now() + REWARD_DELAY_DAYS * DAY);

  const queue: { beneficiaryId: string; reason: RewardReason; brandSlug?: string }[] = [];
  if (payer.acqVia) {
    const brand = await prisma.brand.findUnique({
      where: { slug: payer.acqVia },
      select: { slug: true, memberships: { where: { role: "OWNER" }, orderBy: { id: "asc" }, take: 1, select: { userId: true } } }
    });
    const ownerId = brand?.memberships[0]?.userId;
    if (ownerId && ownerId !== payer.id) queue.push({ beneficiaryId: ownerId, reason: "badge", brandSlug: brand!.slug });
  }
  if (payer.referredByCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: payer.referredByCode }, select: { id: true } });
    if (referrer && referrer.id !== payer.id) queue.push({ beneficiaryId: referrer.id, reason: "referral" });
  }

  for (const q of queue) {
    try {
      await referralRewardDb.create({
        data: { beneficiaryId: q.beneficiaryId, refereeId: payer.id, reason: q.reason, eligibleAt, brandSlug: q.brandSlug ?? null, refereeName: firstName }
      });
    } catch {
      // Déjà en file (unicité refereeId + reason) : rien à faire.
      continue;
    }
    await notify(q.beneficiaryId, {
      kind: "referral",
      title: q.reason === "badge" ? "Badge « Propulsé par Nebula »" : "Nouveau filleul abonné",
      body: `${firstName} vient de s'abonner grâce à vous. Votre mois de Pro sera confirmé dans ${REWARD_DELAY_DAYS} jours, s'il est toujours abonné.`
    });
  }
}

/** Le filleul a-t-il réellement payé au moins une facture (> 0 €) ? */
async function hasRealPayment(stripeSubscriptionId: string): Promise<boolean> {
  const invoices = await stripe().invoices.list({ subscription: stripeSubscriptionId, status: "paid", limit: 12 });
  return invoices.data.some((inv) => (inv.amount_paid ?? 0) > 0);
}

/** Nombre de filleuls confirmés (abonnés 30 jours) d'un parrain, plafond compris. */
export async function confirmedReferralCount(userId: string): Promise<number> {
  return referralRewardDb.count({ where: { beneficiaryId: userId, reason: "referral", status: { in: ["GRANTED", "CAPPED"] } } });
}

/** Mois offerts sur les 12 derniers mois (tous motifs confondus). */
export async function grantedInWindow(userId: string): Promise<number> {
  return referralRewardDb.count({
    where: { beneficiaryId: userId, status: "GRANTED", grantedAt: { gte: new Date(Date.now() - REWARD_WINDOW_DAYS * DAY) } }
  });
}

/** Récompenses en attente de confirmation (filleuls abonnés depuis moins de 30 jours). */
export async function pendingRewardCount(userId: string): Promise<number> {
  return referralRewardDb.count({ where: { beneficiaryId: userId, status: { in: ["PENDING", "PROCESSING"] } } });
}

async function checkAmbassadorTiers(userId: string): Promise<void> {
  const count = await confirmedReferralCount(userId);
  for (const tier of AMBASSADOR_TIERS) {
    if (count >= tier.at) await markEasterEggFound(userId, tier.key);
  }
  // Paliers ambassadeur = accomplissements de la page Réussites (import
  // dynamique : le moteur des Réussites importe ce fichier).
  const { refreshReussites } = await import("@/lib/reussites/engine");
  await refreshReussites(userId);
}

/**
 * Cron : traite les récompenses arrivées à échéance (30 jours après le
 * premier abonnement du filleul). Accorde, plafonne ou annule.
 */
export async function processDueRewards(): Promise<{ granted: number; capped: number; canceled: number }> {
  const out = { granted: 0, capped: 0, canceled: 0 };
  const due = await referralRewardDb.findMany({ where: { status: "PENDING", eligibleAt: { lte: new Date() } }, orderBy: { eligibleAt: "asc" }, take: 50 });

  for (const r of due) {
    // Verrou : une seule exécution du cron traite cette ligne.
    const claimed = await referralRewardDb.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "PROCESSING" } });
    if (claimed.count === 0) continue;
    try {
      const sub = await prisma.subscription.findUnique({
        where: { userId: r.refereeId },
        select: { plan: true, status: true, stripeSubscriptionId: true }
      });
      const gaveUp = Date.now() - new Date(r.createdAt).getTime() > REWARD_GIVE_UP_DAYS * DAY;
      const paid = sub?.stripeSubscriptionId && isBillingEnabled() ? await hasRealPayment(sub.stripeSubscriptionId) : false;
      const stillSubscribed = Boolean(sub) && sub!.plan !== "FREE" && sub!.status !== "CANCELED";

      if (!paid || !stillSubscribed) {
        if (!stillSubscribed || gaveUp) {
          await referralRewardDb.update({ where: { id: r.id }, data: { status: "CANCELED" } });
          out.canceled++;
        } else {
          // Mois offert en cours (facture à 0 €) : on revérifie dans 7 jours.
          await referralRewardDb.update({ where: { id: r.id }, data: { status: "PENDING", eligibleAt: new Date(Date.now() + 7 * DAY) } });
        }
        continue;
      }

      if ((await grantedInWindow(r.beneficiaryId)) >= REWARD_CAP_MONTHS) {
        await referralRewardDb.update({ where: { id: r.id }, data: { status: "CAPPED" } });
        out.capped++;
        await notify(r.beneficiaryId, {
          kind: "referral",
          title: "Plafond de mois offerts atteint",
          body: `${r.refereeName ?? "Votre filleul"} est bien abonné. Vous avez déjà reçu ${REWARD_CAP_MONTHS} mois de Pro sur les 12 derniers mois : celui-ci compte pour vos paliers ambassadeur.`,
          href: "/reussites",
          actionLabel: "Voir mes réussites"
        });
      } else {
        const mode = await grantProMonth(r.beneficiaryId, r.reason as RewardReason, { fromName: r.refereeName ?? undefined, brandSlug: r.brandSlug ?? undefined });
        await referralRewardDb.update({ where: { id: r.id }, data: { status: "GRANTED", grantedAt: new Date(), mode: mode === "skipped" ? null : mode } });
        out.granted++;
      }
      if (r.reason === "referral") await checkAmbassadorTiers(r.beneficiaryId);
    } catch (err) {
      console.error("[rewards] traitement impossible :", (err as Error).message);
      await referralRewardDb.update({ where: { id: r.id }, data: { status: "PENDING", eligibleAt: new Date(Date.now() + DAY) } }).catch(() => undefined);
    }
  }
  return out;
}
