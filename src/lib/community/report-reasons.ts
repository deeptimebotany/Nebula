// Motifs de signalement de la Communauté (30/09/2026). Constantes sans
// dépendance : lues par l'interface (content-actions.tsx) et par le serveur
// (moderation.ts, route /api/community/reports).
export const REPORT_TARGET_TYPES = ["THREAD", "REPLY", "VIDEO"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  { id: "SPAM", label: "Spam ou publicité" },
  { id: "OFFENSIVE", label: "Contenu choquant ou inapproprié" },
  { id: "HARASSMENT", label: "Harcèlement ou attaque personnelle" },
  { id: "MISLEADING", label: "Arnaque ou information trompeuse" },
  { id: "OTHER", label: "Autre raison" }
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id) as [ReportReason, ...ReportReason[]];

/** Longueur maximale du texte libre d'un signalement. */
export const REPORT_DETAILS_MAX = 500;

export function reportReasonLabel(id: string): string {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? "Autre raison";
}

/** Clé d'un contenu signalé (« THREAD:abc »), partagée avec l'interface. */
export function reportKey(type: ReportTargetType, id: string): string {
  return `${type}:${id}`;
}
