// Avis de la communauté (02/10/2026) — règles et calculs sans dépendance,
// partagés par le serveur (feedback.ts, routes) et les pages.
//
// Décisions de Lucas : ouvert à tous les paliers (2 demandes par semaine en
// Gratuit, sans limite pratique en Pro et Agence), demande ouverte 72 h.
import type { PublicAuthor } from "@/lib/reussites/public-author";

export const FEEDBACK_KINDS = ["THUMBNAIL", "TITLE"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_DURATION_MS = 72 * 60 * 60 * 1000;
export const FEEDBACK_MIN_OPTIONS = 2;
export const FEEDBACK_MAX_OPTIONS = 3;
export const FEEDBACK_TITLE_MAX = 100;
export const FEEDBACK_IMAGE_LABEL_MAX = 40;
export const FEEDBACK_CONTEXT_MAX = 280;
export const FEEDBACK_COMMENT_MAX = 500;
export const FEEDBACK_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Gratuit : demandes par semaine glissante. */
export const FEEDBACK_FREE_WEEKLY = 2;
/** Pro, Agence, essai : garde-fou anti-spam par jour. */
export const FEEDBACK_PAID_DAILY = 10;
/** Demandes terminées gardées (puis supprimées avec leurs images). */
export const FEEDBACK_RETENTION_DAYS = 30;
/**
 * Réussites v3 : avis qu'une demande peut marquer « Cet avis m'a aidé ».
 * L'auteur choisit les meilleurs ; deux comptes complices ne peuvent pas
 * fabriquer des dizaines d'« avis utiles » avec une seule demande.
 */
export const FEEDBACK_HELPFUL_MAX = 3;

export interface FeedbackOptionDTO {
  id: string;
  position: number;
  label: string;
  imageUrl: string | null;
  /** Visible par l'auteur, par qui a voté, et pour tous une fois la demande terminée. */
  votes: number | null;
}

export interface FeedbackCommentDTO {
  id: string;
  body: string;
  createdAt: string;
  author: PublicAuthor | null;
  mine: boolean;
  /** L'auteur de la demande l'a marqué « Cet avis m'a aidé » (Réussites v3). */
  helpful: boolean;
}

export interface FeedbackRequestDTO {
  id: string;
  kind: FeedbackKind;
  context: string;
  network: string | null;
  createdAt: string;
  closesAt: string;
  closed: boolean;
  author: PublicAuthor | null;
  mine: boolean;
  options: FeedbackOptionDTO[];
  totalVotes: number | null;
  myVote: string | null;
  commentCount: number;
  /** Chargés seulement sur demande (fil d'un avis). */
  comments?: FeedbackCommentDTO[];
}

export interface FeedbackQuotaDTO {
  limit: number;
  used: number;
  period: "week" | "day";
  /** Prochaine place libre quand la limite est atteinte. */
  nextAt: string | null;
}

/** Résultats visibles pour cette personne ? */
export function canSeeResults(input: { mine: boolean; voted: boolean; closed: boolean }): boolean {
  return input.mine || input.voted || input.closed;
}

/** Options gagnantes (plusieurs en cas d'égalité ; aucune sans vote). */
export function winningOptions(options: { id: string; votes: number | null }[]): string[] {
  const max = Math.max(0, ...options.map((o) => o.votes ?? 0));
  if (max === 0) return [];
  return options.filter((o) => (o.votes ?? 0) === max).map((o) => o.id);
}

/** Pourcentage arrondi (0 sans vote). */
export function votePercent(votes: number | null, total: number | null): number {
  if (!votes || !total) return 0;
  return Math.round((votes / total) * 100);
}

/** « encore 2 j », « encore 5 h », « encore 12 min », ou « terminé ». */
export function timeLeftLabel(closesAt: string | Date, now: number = Date.now()): string {
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return "terminé";
  const h = ms / 3_600_000;
  if (h >= 24) return `encore ${Math.floor(h / 24)} j`;
  if (h >= 1) return `encore ${Math.floor(h)} h`;
  return `encore ${Math.max(1, Math.floor(ms / 60_000))} min`;
}

/** Lettre d'une option (A, B, C). */
export function optionLetter(position: number): string {
  return String.fromCharCode(65 + position);
}
