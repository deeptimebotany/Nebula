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

export interface UserPlanInfo {
  plan: Plan;
  limits: PlanLimits;
  interval: BillingInterval;
  maxBrands: number;
}

// L'abonnement est rattaché au compte (User), pas à une marque : il gouverne
// combien de marques ce compte peut créer au total. Les quotas de comptes
// connectés / publications par mois, eux, restent appliqués marque par
// marque (voir assertConnectionQuota / assertPostQuota ci-dessous).
export async function getUserPlan(userId: string): Promise<UserPlanInfo> {
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  const plan = planOf(subscription);
  return {
    plan,
    limits: PLAN_LIMITS[plan],
    interval: intervalOf(subscription),
    maxBrands: maxBrandsOf(subscription)
  };
}

// Résout le plan applicable à une marque via son propriétaire (première
// Membership de rôle OWNER). Conserve la signature historique getBrandPlan()
// utilisée par la plupart des routes/pages existantes.
export async function getBrandPlan(brandId: string): Promise<UserPlanInfo> {
  const owner = await prisma.membership.findFirst({ where: { brandId, role: "OWNER" }, orderBy: { id: "asc" } });
  if (!owner) {
    return { plan: "FREE", limits: PLAN_LIMITS.FREE, interval: "month", maxBrands: PLAN_LIMITS.FREE.tiers[0].maxBrands };
  }
  return getUserPlan(owner.userId);
}

export async function assertConnectionQuota(brandId: string) {
  const { limits } = await getBrandPlan(brandId);
  const count = await prisma.socialConnection.count({ where: { brandId, status: { not: "DISCONNECTED" } } });
  if (count >= limits.maxConnections) {
    throw new Error(
      `Limite de comptes connectés atteinte pour le palier ${limits.label} (${limits.maxConnections}). Passez sur un palier supérieur dans Facturation.`
    );
  }
}

export async function assertPostQuota(brandId: string) {
  const { limits } = await getBrandPlan(brandId);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const count = await prisma.post.count({ where: { brandId, createdAt: { gte: startOfMonth } } });
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
