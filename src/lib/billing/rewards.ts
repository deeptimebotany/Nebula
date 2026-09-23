// Récompenses « un mois de Pro offert » (brief growth, lots G1.a et G7) :
//   - la marque dont le badge « Propulsé par Nebula » a amené un compte qui
//     devient payant (User.acqVia = slug de la marque) ;
//   - le parrain, à la première souscription payante de son filleul
//     (User.referredByCode).
// Une récompense par payant, jamais rétroactive (déclenchée par l'événement
// `paid` du webhook Stripe, lui-même posé une seule fois via firstPaidAt).
//
// Mécanisme : si le bénéficiaire a un abonnement Stripe actif, le coupon
// 100 % « une fois » (STRIPE_FREE_MONTH_COUPON, créé à la main dans Stripe)
// est appliqué à son abonnement ; sinon (compte gratuit, ou coupon non
// configuré) User.bonusMonths est incrémenté et sera consommé à sa
// prochaine souscription via ce même coupon (voir /api/billing/checkout).
import { prisma } from "@/lib/prisma";
import { stripe, isBillingEnabled } from "@/lib/billing/stripe";
import { sendRewardEmail } from "@/lib/emails/growth";
import { trackGrowth } from "@/lib/growth";

export type RewardReason = "badge" | "referral";

export function freeMonthCouponId(): string | null {
  return process.env.STRIPE_FREE_MONTH_COUPON || null;
}

/** Applique un mois de Pro offert au compte `userId`. Renvoie le mode utilisé. */
export async function grantProMonth(userId: string, reason: RewardReason, meta: { fromName?: string; brandSlug?: string }): Promise<"coupon" | "bonus" | "skipped"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, subscription: { select: { stripeSubscriptionId: true, status: true, plan: true } } }
  });
  if (!user) return "skipped";

  let mode: "coupon" | "bonus" = "bonus";
  const coupon = freeMonthCouponId();
  const sub = user.subscription;
  const hasActivePaid = Boolean(sub?.stripeSubscriptionId) && (sub?.status === "ACTIVE" || sub?.status === "TRIALING") && sub?.plan !== "FREE";

  if (hasActivePaid && coupon && isBillingEnabled()) {
    try {
      await stripe().subscriptions.update(sub!.stripeSubscriptionId!, { coupon });
      mode = "coupon";
    } catch (err) {
      console.error("[rewards] coupon non appliqué, repli sur bonusMonths :", (err as Error).message);
    }
  }
  if (mode === "bonus") {
    await prisma.user.update({ where: { id: userId }, data: { bonusMonths: { increment: 1 } } });
  }

  await trackGrowth("reward_granted", { reason, mode, brandSlug: meta.brandSlug ?? "" }, userId);
  await sendRewardEmail({ to: user.email, firstName: user.name.split(" ")[0], reason, fromName: meta.fromName, mode }).catch(() => undefined);
  return mode;
}

/**
 * Appelé une seule fois par compte devenu payant (webhook Stripe, événement
 * `paid`) : récompense la marque apporteuse et/ou le parrain.
 */
export async function rewardOnFirstPayment(payer: { id: string; name: string; acqVia: string | null; referredByCode: string | null }): Promise<void> {
  const firstName = payer.name.split(" ")[0];

  if (payer.acqVia) {
    const brand = await prisma.brand.findUnique({
      where: { slug: payer.acqVia },
      select: { slug: true, memberships: { where: { role: "OWNER" }, orderBy: { id: "asc" }, take: 1, select: { userId: true } } }
    });
    const ownerId = brand?.memberships[0]?.userId;
    if (ownerId && ownerId !== payer.id) await grantProMonth(ownerId, "badge", { fromName: firstName, brandSlug: brand!.slug });
  }

  if (payer.referredByCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: payer.referredByCode }, select: { id: true } });
    if (referrer && referrer.id !== payer.id) await grantProMonth(referrer.id, "referral", { fromName: firstName });
  }
}
