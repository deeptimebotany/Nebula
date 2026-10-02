// Outils dans l'application (02/10/2026) : types et calculs PURS du
// préremplissage (sans Prisma) — importables par les pages du navigateur.
// La lecture en base est dans app-context.ts (serveur).
import type { RawAuditInput } from "@/lib/audit/parse-input";
import { NETWORK_META } from "@/lib/types";

/** Réseaux couverts par les repères des outils (études publiques sourcées). */
export const TOOL_NETWORKS = ["INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE"] as const;
export type ToolNetwork = (typeof TOOL_NETWORKS)[number];
export function isToolNetwork(n: string): n is ToolNetwork {
  return (TOOL_NETWORKS as readonly string[]).includes(n);
}

export const ENGAGEMENT_WINDOW_DAYS = 30;
export const ENGAGEMENT_FALLBACK_POSTS = 10;

export interface MetricRow {
  publishedAt: Date | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface EngagementTotals {
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  /** "window" : publications des 30 derniers jours ; "recent" : les 10 dernières (rien sur 30 jours). */
  basis: "window" | "recent";
}

/** Totaux d'interactions des publications récentes d'un compte (null si aucune publication datée). */
export function engagementTotals(rows: MetricRow[], now: Date = new Date()): EngagementTotals | null {
  const dated = rows.filter((r): r is MetricRow & { publishedAt: Date } => r.publishedAt instanceof Date).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const since = now.getTime() - ENGAGEMENT_WINDOW_DAYS * 86_400_000;
  let picked = dated.filter((r) => r.publishedAt.getTime() >= since && r.publishedAt.getTime() <= now.getTime());
  let basis: EngagementTotals["basis"] = "window";
  if (picked.length === 0) {
    picked = dated.slice(0, ENGAGEMENT_FALLBACK_POSTS);
    basis = "recent";
  }
  if (picked.length === 0) return null;
  const sum = (key: "likes" | "comments" | "shares") => picked.reduce((s, r) => s + Math.max(0, r[key] ?? 0), 0);
  return { posts: picked.length, likes: sum("likes"), comments: sum("comments"), shares: sum("shares"), basis };
}

const AUDIT_FIELD: Partial<Record<string, keyof RawAuditInput>> = { YOUTUBE: "youtube", INSTAGRAM: "instagram", TIKTOK: "tiktok" };

/** Champs de l'audit préremplis : « @pseudo » du premier compte de chaque réseau, et la Page bio publiée. */
export function auditPrefill(connections: { network: string; handle: string | null }[], bioUrl: string | null): RawAuditInput {
  const out: RawAuditInput = {};
  for (const c of connections) {
    const field = AUDIT_FIELD[c.network];
    const handle = c.handle?.trim().replace(/^@+/, "");
    if (!field || !handle || out[field]) continue;
    out[field] = `@${handle}`;
  }
  if (bioUrl) out.website = bioUrl;
  return out;
}

export interface ToolAccountDTO {
  connectionId: string;
  network: ToolNetwork;
  displayName: string;
  handle: string | null;
  /** Abonnés du dernier relevé (null : aucun relevé). */
  followers: number | null;
  engagement: EngagementTotals | null;
}

export interface ToolBestTimeDTO {
  network: string;
  hasEnoughData: boolean;
  bestHour: number | null;
  sampleSize: number;
}

export interface ToolContextDTO {
  brand: { name: string; timezone: string };
  /** Description de l'activité (accroche du media kit, sinon bio de la Page bio). */
  about: string;
  accounts: ToolAccountDTO[];
  bestTimes: ToolBestTimeDTO[];
  /** Relevés nécessaires pour un créneau personnel. */
  minSnapshots: number;
  youtubeTitles: string[];
  audit: RawAuditInput;
}

/** Bouton « Vos comptes » du calculateur de taux d'engagement. */
export interface EngagementPreset {
  id: string;
  /** « Instagram · @studio.nova » */
  label: string;
  /** « 29 publications des 30 derniers jours » */
  detail: string;
  network: ToolNetwork;
  followers: number;
  likes: number;
  comments: number;
  shares: number;
  posts: number;
}

/** « Instagram · @studio.nova » */
export function accountLabel(a: ToolAccountDTO): string {
  return `${NETWORK_META[a.network].label} · ${a.handle ? `@${a.handle.replace(/^@+/, "")}` : a.displayName}`;
}

/** Comptes avec abonnés ET publications relevés : boutons du calculateur. */
export function engagementPresets(accounts: ToolAccountDTO[]): EngagementPreset[] {
  return accounts
    .filter((a) => a.followers && a.followers > 0 && a.engagement)
    .map((a) => {
      const e = a.engagement!;
      return {
        id: a.connectionId,
        label: accountLabel(a),
        detail: e.basis === "window" ? `${e.posts} publication${e.posts > 1 ? "s" : ""} des 30 derniers jours` : `${e.posts} dernière${e.posts > 1 ? "s" : ""} publication${e.posts > 1 ? "s" : ""}`,
        network: a.network,
        followers: a.followers!,
        likes: e.likes,
        comments: e.comments,
        shares: e.shares,
        posts: e.posts
      };
    });
}
