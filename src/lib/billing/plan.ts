import { prisma } from "@/lib/prisma";
import {
  PLAN_LIMITS,
  planOf,
  intervalOf,
  maxBrandsOf,
  type Plan,
  type PlanLimits,
  type BillingInterval
} from "@/lib/plans";
import { hasActiveReferralTrial } from "@/lib/referral";

export interface UserPlanInfo {
  plan: Plan;
  limits: PlanLimits;
  interval: BillingInterval;
  maxBrands: number;
  aiTrialUntil: Date | null;
}

// L'abonnement est rattaché au compte (User), pas à une marque : il gouverne
// combien de marques ce compte peut créer au total. Les quotas de comptes
// connectés / publications par mois, eux, restent appliqués marque par
// marque (voir assertConnectionQuota / assertPostQuota ci-dessous).
export async function getUserPlan(userId: string): Promise<UserPlanInfo> {
  const [subscription, user] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { aiTrialUntil: true } })
  ]);
  const plan = planOf(subscription);
  const limits = PLAN_LIMITS[plan];
  const onTrial = hasActiveReferralTrial(user?.aiTrialUntil);
  return {
    plan,
    // Un essai IA de parrainage actif active l'IA même sur le palier
    // Gratuit, sans changer le plan lui-même (les autres quotas — marques,
    // comptes connectés, publications — restent ceux du palier réel).
    limits: onTrial ? { ...limits, aiEnabled: true } : limits,
    interval: intervalOf(subscription),
    maxBrands: maxBrandsOf(subscription),
    aiTrialUntil: onTrial ? user!.aiTrialUntil! : null
  };
}

// Résout le plan applicable à une marque via son propriétaire (première
// Membership de rôle OWNER). Conserve la signature historique getBrandPlan()
// utilisée par la plupart des routes/pages existantes.
export async function getBrandPlan(brandId: string): Promise<UserPlanInfo> {
  const owner = await prisma.membership.findFirst({ where: { brandId, role: "OWNER" }, orderBy: { id: "asc" } });
  if (!owner) {
    return {
      plan: "FREE",
      limits: PLAN_LIMITS.FREE,
      interval: "month",
      maxBrands: PLAN_LIMITS.FREE.tiers[0].maxBrands,
      aiTrialUntil: null
    };
  }
  return getUserPlan(owner.userId);
}

// Instagram et Facebook passent tous les deux par la connexion "Meta" et sont
// comptés comme UN SEUL "compte" pour les quotas (au lieu de 2), puisqu'on
// les connecte ensemble depuis la même page. TikTok et YouTube comptent,
// eux, chacun pour un compte à part entière.
export async function countConnectionSlots(brandId: string): Promise<number> {
  const connections: { network: string }[] = await prisma.socialConnection.findMany({
    where: { brandId, status: { not: "DISCONNECTED" } },
    select: { network: true }
  });
  const instagramCount = connections.filter((c) => c.network === "INSTAGRAM").length;
  const facebookCount = connections.filter((c) => c.network === "FACEBOOK").length;
  const tiktokCount = connections.filter((c) => c.network === "TIKTOK").length;
  const youtubeCount = connections.filter((c) => c.network === "YOUTUBE").length;
  // Une connexion Meta ajoute généralement un compte Instagram ET une page
  // Facebook en même temps : on prend le plus grand des deux plutôt que
  // d'additionner, pour ne compter cette paire qu'une fois.
  const metaSlots = Math.max(instagramCount, facebookCount);
  return metaSlots + tiktokCount + youtubeCount;
}

export async function assertConnectionQuota(brandId: string) {
  const { limits } = await getBrandPlan(brandId);
  const count = await countConnectionSlots(brandId);
  if (count >= limits.maxConnections) {
    throw new Error(
      `Limite de comptes connectés atteinte pour le palier ${limits.label} (${limits.maxConnections} comptes ; Instagram + Facebook comptent ensemble pour un seul compte). Passez sur un palier supérieur dans Facturation.`
    );
  }
}

export function startOfCurrentMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Publications créées ce mois-ci pour la marque — le décompte utilisé par le quota ET par /api/billing/usage. */
export async function countPostsThisMonth(brandId: string): Promise<number> {
  return prisma.post.count({ where: { brandId, createdAt: { gte: startOfCurrentMonth() } } });
}

export async function assertPostQuota(brandId: string) {
  const { limits } = await getBrandPlan(brandId);
  // Même décompte que /api/billing/usage (voir usage.ts) : ce que l'écran
  // affiche est exactement ce qui est vérifié ici.
  const count = await countPostsThisMonth(brandId);
  if (count >= limits.maxPostsPerMonth) {
    throw new Error(
      `Limite de publications atteinte pour le palier ${limits.label} (${limits.maxPostsPerMonth}/mois). Passez sur un palier supérieur dans Facturation.`
    );
  }
}

// Nombre de marques déjà possédées (Membership OWNER) par ce compte.
export async function countOwnedBrands(userId: string): Promise<number> {
  return prisma.membership.count({ where: { userId, role: "OWNER" } });
}

// À vérifier avant de créer une nouvelle marque (POST /api/brands).
export async function assertBrandQuota(userId: string) {
  const { maxBrands, limits } = await getUserPlan(userId);
  const owned = await countOwnedBrands(userId);
  if (owned >= maxBrands) {
    throw new Error(
      `Limite de marques atteinte pour votre palier ${limits.label} (${maxBrands}). Passez à un palier supérieur, ou à un nombre de marques plus élevé, dans Facturation.`
    );
  }
}
