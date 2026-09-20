// Statut "Premium" (abonné payant PRO ou AGENCE) affiché dans toute
// l'app — communauté (pseudo doré, halo), profil (bulle de la barre du
// haut)... Calculé à partir du VRAI abonnement Stripe en base (plan +
// statut + date de début réelle), jamais une valeur déclarative côté
// client. Voir prisma/schema.prisma::Subscription.
import type { Plan } from "./plans";

export type TenureTier = "mois" | "semestre" | "an";

export interface PremiumInfo {
  isPremium: boolean;
  plan: Plan;
  /** Libellé humain de l'ancienneté ("1 mois", "6 mois", "1 an", "2 ans"...),
   *  null tant que l'abonnement a moins d'un mois. */
  tenureLabel: string | null;
  /** Palier d'ancienneté utilisé pour l'apparence du badge (voir PremiumBadge). */
  tenureTier: TenureTier | null;
}

const ACTIVE_STATUSES = ["ACTIVE", "TRIALING"];
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export function computePremiumInfo(
  sub: { plan: string; status: string; createdAt: Date | string } | null | undefined
): PremiumInfo {
  const isPaidPlan = !!sub && (sub.plan === "PRO" || sub.plan === "AGENCY");
  const isActive = !!sub && ACTIVE_STATUSES.includes(sub.status);
  if (!sub || !isPaidPlan || !isActive) {
    return { isPremium: false, plan: "FREE", tenureLabel: null, tenureTier: null };
  }

  const createdAt = sub.createdAt instanceof Date ? sub.createdAt : new Date(sub.createdAt);
  const months = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / MS_PER_MONTH));

  let tenureTier: TenureTier | null = null;
  let tenureLabel: string | null = null;
  if (months >= 12) {
    tenureTier = "an";
    const years = Math.floor(months / 12);
    tenureLabel = years >= 2 ? `${years} ans` : "1 an";
  } else if (months >= 6) {
    tenureTier = "semestre";
    tenureLabel = "6 mois";
  } else if (months >= 1) {
    tenureTier = "mois";
    tenureLabel = "1 mois";
  }

  return { isPremium: true, plan: sub.plan as Plan, tenureLabel, tenureTier };
}
