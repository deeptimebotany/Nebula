// Outils IA de /outils : quotas par compte (29/09/2026). Depuis le lot E2
// (brief « Essai 14 jours »), ils passent par la porte unique de l'IA
// (src/lib/ai/guard.ts) : limites lues dans src/lib/plans.ts (aiDaily),
// réservation atomique, plafond par adresse IP en Gratuit et en Essai,
// budget global du jour. Ce module garde les noms historiques utilisés par
// les pages et les tests.
import { PLANS, PLAN_LIMITS, type Plan } from "@/lib/plans";
import { TOOL_IP_DAILY_LIMITS } from "@/lib/ai/guard";

export type ToolKind = "text" | "thumbnail";

/**
 * Limites des outils par compte (lues dans plans.ts) : textes PAR JOUR,
 * miniatures PAR MOIS (30/09/2026 : les images se comptent dans le quota
 * mensuel d'images du palier ; aucune en Gratuit).
 */
export const TOOL_DAILY_LIMITS = Object.fromEntries(
  PLANS.map((p) => [p, { text: PLAN_LIMITS[p].aiDaily.text, thumbnail: PLAN_LIMITS[p].aiMonthly.image }])
) as Record<Plan, Record<ToolKind, number>>;

/** Plafond par adresse IP et par jour (Gratuit et Essai). */
export const FREE_IP_DAILY_LIMITS: Record<ToolKind, number> = { text: TOOL_IP_DAILY_LIMITS.text, thumbnail: TOOL_IP_DAILY_LIMITS.image };

export interface ToolQuota {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Refus dû au plafond par adresse IP. */
  ipLimited?: boolean;
}

/** Message affiché quand le quota est épuisé (textes : jour ; miniatures : mois ou essai). */
export function toolQuotaMessage(plan: Plan, kind: ToolKind, quota: ToolQuota): string {
  if (quota.ipLimited) return `Limite atteinte pour aujourd'hui depuis cette connexion. Revenez demain, ou passez à Pro pour générer davantage.`;
  const limits = PLAN_LIMITS[plan];
  if (kind === "thumbnail") {
    if (quota.limit <= 0) return `Les miniatures IA font partie des paliers Pro (${PLAN_LIMITS.PRO.aiMonthly.image} par mois) et Agence.`;
    if (limits.aiBudgetBucket === "trial") return `Vous avez utilisé les ${quota.limit} miniatures de l'essai. En Pro, ${PLAN_LIMITS.PRO.aiMonthly.image} par mois.`;
    return `Vous avez utilisé vos ${quota.limit} miniatures de ce mois-ci : le compteur repart le 1er du mois prochain.`;
  }
  if (limits.upgradeTo && limits.aiGuardrails) {
    const next = PLAN_LIMITS[limits.upgradeTo];
    return `Vous avez utilisé vos ${quota.limit} générations ${limits.aiBudgetBucket === "trial" ? "de l'essai" : "gratuites"} d'aujourd'hui. Revenez demain, ou passez à ${next.label} pour en avoir ${TOOL_DAILY_LIMITS[limits.upgradeTo].text} par jour.`;
  }
  return `Vous avez utilisé vos ${quota.limit} générations d'aujourd'hui : le compteur repart à zéro demain.`;
}

/** Réponse commune d'un visiteur sans compte (la page montre une démo à la place). */
export const TOOL_SIGNUP_REQUIRED = "Créez un compte gratuit (ou connectez-vous) pour générer avec l'IA. Sans compte, la page montre une démo préparée à l'avance, sans IA.";
