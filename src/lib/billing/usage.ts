// Consommation RÉELLE d'une marque par rapport à son palier — calculée par
// les mêmes fonctions que les quotas appliqués côté serveur (voir plan.ts :
// assertPostQuota / assertConnectionQuota), pour que la barre de quota du
// calendrier, la page Comptes et la page Facturation affichent exactement ce
// que le serveur vérifiera au moment d'agir. Avant le Lot 4, chaque page
// recomptait de son côté (publications du mois, comptes connectés) avec ses
// propres règles.
import { countConnectionSlots, countPostsThisMonth, getBrandPlan } from "@/lib/billing/plan";
import type { Plan, PlanLimits, BillingInterval } from "@/lib/plans";

export interface BrandUsage {
  plan: Plan;
  interval: BillingInterval;
  limits: PlanLimits;
  postsThisMonth: number;
  connectionSlots: number;
  unlimitedPosts: boolean;
  unlimitedConnections: boolean;
}

export async function getBrandUsage(brandId: string): Promise<BrandUsage> {
  const [{ plan, limits, interval }, postsThisMonth, connectionSlots] = await Promise.all([
    getBrandPlan(brandId),
    countPostsThisMonth(brandId),
    countConnectionSlots(brandId)
  ]);
  return {
    plan,
    interval,
    limits,
    postsThisMonth,
    connectionSlots,
    unlimitedPosts: limits.maxPostsPerMonth >= 999999,
    unlimitedConnections: limits.maxConnections >= 9999
  };
}
