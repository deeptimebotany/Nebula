// Outils IA de /outils : quotas par compte (29/09/2026). Depuis le lot E2
// (brief « Essai 14 jours »), ils passent par la porte unique de l'IA
// (src/lib/ai/guard.ts) : limites lues dans src/lib/plans.ts (aiDaily),
// réservation atomique, plafond par adresse IP en Gratuit et en Essai,
// budget global du jour. Ce module garde les noms historiques utilisés par
// les pages et les tests.
import { PLANS, PLAN_LIMITS, type Plan } from "@/lib/plans";
import { TOOL_IP_DAILY_LIMITS } from "@/lib/ai/guard";

export type ToolKind = "text" | "thumbnail";

/** Générations par jour et par compte (lues dans plans.ts). */
export const TOOL_DAILY_LIMITS = Object.fromEntries(
  PLANS.map((p) => [p, { text: PLAN_LIMITS[p].aiDaily.text, thumbnail: PLAN_LIMITS[p].aiDaily.image }])
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

/** Message affiché quand le quota du jour est épuisé. */
export function toolQuotaMessage(plan: Plan, kind: ToolKind, quota: ToolQuota): string {
  const what = kind === "thumbnail" ? "miniatures" : "générations";
  if (quota.ipLimited) return `Limite atteinte pour aujourd'hui depuis cette connexion. Revenez demain, ou passez à Pro pour générer davantage.`;
  const limits = PLAN_LIMITS[plan];
  if (limits.upgradeTo && limits.aiGuardrails) {
    const next = PLAN_LIMITS[limits.upgradeTo];
    return `Vous avez utilisé vos ${quota.limit} ${what} ${limits.aiBudgetBucket === "trial" ? "de l'essai" : "gratuites"} d'aujourd'hui. Revenez demain, ou passez à ${next.label} pour en avoir ${TOOL_DAILY_LIMITS[limits.upgradeTo][kind]} par jour.`;
  }
  return `Vous avez utilisé vos ${quota.limit} ${what} d'aujourd'hui : le compteur repart à zéro demain.`;
}

/** Réponse commune d'un visiteur sans compte (la page montre une démo à la place). */
export const TOOL_SIGNUP_REQUIRED = "Créez un compte gratuit (ou connectez-vous) pour générer avec l'IA. Sans compte, la page montre une démo préparée à l'avance, sans IA.";
