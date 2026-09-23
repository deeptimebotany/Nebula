// Récapitulatif de l'essai Pro (brief growth, lot G2.a) : ce que le compte
// a utilisé pendant l'essai et ce qui sera verrouillé en Gratuit — pour la
// modale « Votre essai Pro est terminé » (/api/billing/trial) et l'email
// trial_ends_48h (src/lib/emails/lifecycle.ts).
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/billing/plan";
import { PLAN_LIMITS } from "@/lib/plans";

export type TrialSummary = Awaited<ReturnType<typeof computeTrialSummary>>;

export async function computeTrialSummary(userId: string) {
  const [info, user] = await Promise.all([
    getUserPlan(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { trialEndsAt: true, createdAt: true, memberships: { where: { role: "OWNER" }, select: { brandId: true } } } })
  ]);
  const brandIds = user?.memberships.map((m) => m.brandId) ?? [];
  const since = user?.createdAt ?? new Date(0);
  const [scheduledPosts, reports, calendarShares, bioLinks, retentionAnalyses] = await Promise.all([
    prisma.post.count({ where: { brandId: { in: brandIds }, createdAt: { gte: since }, status: { in: ["SCHEDULED", "PUBLISHED", "PUBLISHING"] } } }),
    prisma.brandReport.count({ where: { brandId: { in: brandIds }, enabled: true } }),
    prisma.calendarShare.count({ where: { brandId: { in: brandIds }, enabled: true } }),
    prisma.linkItem.count({ where: { linkPage: { brandId: { in: brandIds } } } }),
    prisma.videoInsight.count({ where: { connection: { brandId: { in: brandIds } } } }).catch(() => 0)
  ]);
  const freeLinks = PLAN_LIMITS.FREE.maxBioLinks;
  return {
    onTrial: info.onTrial,
    paid: info.paid,
    trialEndsAt: user?.trialEndsAt ? user.trialEndsAt.toISOString() : null,
    used: {
      scheduledPosts,
      reportsPublished: reports,
      calendarSharesPublished: calendarShares,
      bioLinks,
      bioLinksBeyondFree: Math.max(0, bioLinks - freeLinks),
      retentionAnalyses,
      brands: brandIds.length,
      brandsBeyondFree: Math.max(0, brandIds.length - PLAN_LIMITS.FREE.tiers[0].maxBrands)
    },
    locked: {
      reports: PLAN_LIMITS.FREE.reportsEnabled === false,
      calendarShare: PLAN_LIMITS.FREE.calendarShareEnabled === false,
      ai: PLAN_LIMITS.FREE.aiEnabled === false,
      bioLinksLimit: freeLinks,
      maxBrands: PLAN_LIMITS.FREE.tiers[0].maxBrands
    }
  };
}
