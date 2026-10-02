// Calculateur de taux d'engagement (outil public /outils/taux-engagement et
// outil de l'application /tools/taux-engagement) : formule et repères,
// partagés par les deux pages. Sans IA.
//
// Ordres de grandeur du taux d'engagement (interactions / abonnés, par
// publication), relevés en septembre 2026 à partir des études publiques
// annuelles des éditeurs d'outils d'analyse (Socialinsider, Rival IQ,
// Hootsuite). Ce sont des MOYENNES générales : les statistiques du compte
// dans Nebula font toujours foi.
import type { ToolNetwork } from "@/lib/tools/app-context-shared";

export const ENGAGEMENT_BENCHMARKS: Record<ToolNetwork, { low: number; median: number; high: number }> = {
  INSTAGRAM: { low: 0.5, median: 1.5, high: 4 },
  TIKTOK: { low: 2, median: 4.5, high: 9 },
  YOUTUBE: { low: 1, median: 3, high: 6 },
  FACEBOOK: { low: 0.1, median: 0.5, high: 1.5 }
};
export const ENGAGEMENT_BENCHMARK_DATE = "septembre 2026";

export type EngagementVerdict = "excellent" | "bon" | "dans la moyenne" | "en dessous de la moyenne";

/** Taux par publication (en %) et interactions moyennes ; null sans abonnés. */
export function engagementRate(input: { followers: number; likes: number; comments: number; shares: number; posts: number }, network: ToolNetwork): { rate: number; perPost: number; verdict: EngagementVerdict } | null {
  const f = input.followers;
  if (!Number.isFinite(f) || f <= 0) return null;
  const p = Math.max(1, Math.floor(input.posts) || 1);
  const interactions = (input.likes || 0) + (input.comments || 0) + (input.shares || 0);
  const perPost = interactions / p;
  const rate = (perPost / f) * 100;
  const b = ENGAGEMENT_BENCHMARKS[network];
  const verdict: EngagementVerdict = rate >= b.high ? "excellent" : rate >= b.median ? "bon" : rate >= b.low ? "dans la moyenne" : "en dessous de la moyenne";
  return { rate, perPost, verdict };
}

/** Nombre à la française (« 0,5 », « 4 »). */
export function frNumber(n: number, digits = 2): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}
