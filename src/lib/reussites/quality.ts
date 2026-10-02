// Réussites v3 (02/10/2026) : la qualité avant la quantité.
//
// Mesures de qualité d'un compte, calculées sur ce que les réseaux disent
// vraiment (API officielles, relevées par Nebula) et sur la Communauté :
//  - record de vues : une publication comparée à la médiane des 10
//    précédentes du même compte (juste pour un petit comme pour un grand
//    compte) ;
//  - engagement par abonné au-dessus des repères du réseau (les mêmes que le
//    calculateur de taux d'engagement) ;
//  - rétention YouTube (part moyenne regardée, vidéos de plus de 3 minutes) ;
//  - croissance réelle : abonnés nets sur 30 jours, mois de croissance ;
//  - partages et enregistrements d'une publication ;
//  - avis argumentés reçus, avis jugés utiles par la personne aidée (une
//    fois par demande, 3 avis utiles au plus par demande).
//
// Garde-fous : les comparaisons (vues, engagement, rétention) n'utilisent
// que des publications en ligne depuis 7 jours au moins (chiffres stables ;
// publier puis supprimer ne rapporte rien), et un palier se gagne une seule
// fois. Les fonctions pures ci-dessous sont testées sans base
// (tests/quality/reussites-quality.test.ts) ; loadQuality lit la base.
import { prisma } from "@/lib/prisma";
import { ownedBy } from "@/lib/brand-access";
import { ENGAGEMENT_BENCHMARKS, frNumber } from "@/lib/tools/engagement-rate";
import { isToolNetwork } from "@/lib/tools/app-context-shared";
import { NETWORK_META, type Network } from "@/lib/types";
import type { QualityEvidence } from "./evidence";

export type { QualityEvidence } from "./evidence";

const DAY = 86_400_000;
export const QUALITY_MIN_AGE_DAYS = 7;
export const VIEWS_HISTORY = 10;
export const VIEWS_MIN_HISTORY = 5;
export const VIEWS_MIN_MEDIAN = 50;
export const RETENTION_MIN_SECONDS = 180;
export const RETENTION_MIN_VIEWS = 100;
export const RETENTION_GOOD_PCT = 50;
export const GROWTH_MIN_NET = 20;
export const GROWTH_MONTH_MIN_PCT = 1;
export const ENGAGEMENT_MIN_FOLLOWERS = 100;
export const FEEDBACK_MIN_CHARS = 20;

export type QualityMetricId =
  | "bestViewsRatio"
  | "postsAboveMedianEngagement"
  | "postsAboveHighEngagement"
  | "videosRetention50"
  | "bestRetentionPct"
  | "bestGrowthPct30d"
  | "growthMonthsStreak"
  | "bestSavesShares"
  | "bestFeedbackReceived"
  | "helpfulAdvice";

export const QUALITY_METRICS: QualityMetricId[] = [
  "bestViewsRatio",
  "postsAboveMedianEngagement",
  "postsAboveHighEngagement",
  "videosRetention50",
  "bestRetentionPct",
  "bestGrowthPct30d",
  "growthMonthsStreak",
  "bestSavesShares",
  "bestFeedbackReceived",
  "helpfulAdvice"
];

export interface QualityResult {
  metrics: Record<QualityMetricId, number>;
  evidence: Partial<Record<QualityMetricId, QualityEvidence>>;
}

export interface MetricPostRow {
  connectionId: string;
  network: string;
  title: string | null;
  permalink: string | null;
  publishedAt: Date | null;
  capturedAt: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  avgViewPct: number | null;
  durationSeconds: number | null;
}

export interface FollowerSnapshot {
  connectionId: string;
  capturedAt: Date;
  followers: number;
}

const nf = (n: number) => Math.round(n).toLocaleString("fr-FR");
const netLabel = (network: string) => NETWORK_META[network as Network]?.label ?? network;
const iso = (d: Date) => d.toISOString();
const oldEnough = (r: MetricPostRow, now: Date) => Boolean(r.publishedAt && r.publishedAt.getTime() <= now.getTime() - QUALITY_MIN_AGE_DAYS * DAY);

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function byConnection<T extends { connectionId: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const list = out.get(r.connectionId) ?? [];
    list.push(r);
    out.set(r.connectionId, list);
  }
  return out;
}

/** Record de vues : meilleure publication rapportée à la médiane des 10 précédentes du même compte. */
export function viewsRecord(rows: MetricPostRow[], now: Date): { ratio: number; evidence: QualityEvidence | null } {
  let best = { ratio: 0, evidence: null as QualityEvidence | null };
  for (const list of Array.from(byConnection(rows).values())) {
    const dated = list.filter((r) => r.publishedAt && r.views !== null).sort((a, b) => a.publishedAt!.getTime() - b.publishedAt!.getTime());
    for (let i = 0; i < dated.length; i++) {
      const r = dated[i];
      if (!oldEnough(r, now)) continue;
      const history = dated.slice(Math.max(0, i - VIEWS_HISTORY), i).map((h) => h.views as number);
      if (history.length < VIEWS_MIN_HISTORY) continue;
      const med = median(history);
      if (med < VIEWS_MIN_MEDIAN) continue;
      const ratio = Math.floor(((r.views as number) / med) * 10) / 10;
      if (ratio > best.ratio) {
        best = {
          ratio,
          evidence: {
            headline: `${frNumber(ratio, 1)}× votre médiane de vues`,
            detail: `${nf(r.views as number)} vues, pour une médiane de ${nf(med)} sur vos ${history.length} publications précédentes (${netLabel(r.network)})`,
            title: r.title,
            network: r.network,
            permalink: r.permalink,
            measuredAt: iso(r.capturedAt)
          }
        };
      }
    }
  }
  return best;
}

/** Abonnés d'un compte à une date : dernier relevé avant, sinon le premier après. */
export function followersAt(snaps: FollowerSnapshot[], at: Date): number | null {
  if (snaps.length === 0) return null;
  let before: FollowerSnapshot | null = null;
  for (const s of snaps) if (s.capturedAt.getTime() <= at.getTime() && s.followers > 0) before = s;
  if (before) return before.followers;
  return snaps.find((s) => s.followers > 0)?.followers ?? null;
}

/** Publications au-dessus des repères médian et élevé de leur réseau (engagement par abonné). */
export function engagementAboveBenchmarks(rows: MetricPostRow[], snapsByConnection: Map<string, FollowerSnapshot[]>, now: Date): { median: number; high: number; evidence: QualityEvidence | null } {
  let aboveMedian = 0;
  let aboveHigh = 0;
  let best: { score: number; evidence: QualityEvidence } | null = null;
  for (const r of rows) {
    if (!isToolNetwork(r.network) || !oldEnough(r, now)) continue;
    const followers = followersAt(snapsByConnection.get(r.connectionId) ?? [], r.publishedAt!);
    if (!followers || followers < ENGAGEMENT_MIN_FOLLOWERS) continue;
    const interactions = (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0);
    const rate = (interactions / followers) * 100;
    const b = ENGAGEMENT_BENCHMARKS[r.network];
    if (rate >= b.median) aboveMedian++;
    if (rate >= b.high) aboveHigh++;
    const score = rate / b.high;
    if (rate >= b.median && (!best || score > best.score)) {
      best = {
        score,
        evidence: {
          headline: `${frNumber(rate, 1)} % d'engagement par abonné`,
          detail: `Repère ${netLabel(r.network)} : médian ${frNumber(b.median)} %, élevé ${frNumber(b.high)} % (${nf(interactions)} interactions, ${nf(followers)} abonnés)`,
          title: r.title,
          network: r.network,
          permalink: r.permalink,
          measuredAt: iso(r.capturedAt)
        }
      };
    }
  }
  return { median: aboveMedian, high: aboveHigh, evidence: best?.evidence ?? null };
}

/** Rétention YouTube : vidéos de plus de 3 minutes, vues 100 fois au moins. */
export function retentionStats(rows: MetricPostRow[], now: Date): { good: number; best: number; evidence: QualityEvidence | null } {
  let good = 0;
  let best = 0;
  let evidence: QualityEvidence | null = null;
  for (const r of rows) {
    if (r.network !== "YOUTUBE" || r.avgViewPct === null || !oldEnough(r, now)) continue;
    if ((r.durationSeconds ?? 0) < RETENTION_MIN_SECONDS || (r.views ?? 0) < RETENTION_MIN_VIEWS) continue;
    // Une vidéo regardée en boucle peut dépasser 100 % : plafonné.
    const pct = Math.min(100, Math.floor(r.avgViewPct));
    if (pct >= RETENTION_GOOD_PCT) good++;
    if (pct > best) {
      best = pct;
      const minutes = Math.round((r.durationSeconds ?? 0) / 60);
      evidence = {
        headline: `Vidéo regardée à ${pct} % en moyenne`,
        detail: `Vidéo YouTube de ${minutes} min, ${nf(r.views ?? 0)} vues (YouTube Analytics)`,
        title: r.title,
        network: "YOUTUBE",
        permalink: r.permalink,
        measuredAt: iso(r.capturedAt)
      };
    }
  }
  return { good, best, evidence };
}

/** Meilleure croissance relative sur 30 jours (abonnés nets, 20 au moins) sur un même compte. */
export function bestGrowth30d(snaps: FollowerSnapshot[], labels: Map<string, { network: string; name: string }>): { pct: number; evidence: QualityEvidence | null } {
  let best = { pct: 0, evidence: null as QualityEvidence | null };
  for (const [connectionId, list] of Array.from(byConnection(snaps).entries())) {
    const sorted = list.filter((s) => s.followers > 0).sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    let start = 0;
    for (let k = 0; k < sorted.length; k++) {
      const s = sorted[k];
      while (sorted[start].capturedAt.getTime() < s.capturedAt.getTime() - 30 * DAY) start++;
      // Base : le relevé le plus bas des 30 jours qui précèdent.
      let base = sorted[start];
      for (let m = start; m < k; m++) if (sorted[m].followers < base.followers) base = sorted[m];
      const net = s.followers - base.followers;
      if (net < GROWTH_MIN_NET || base.followers <= 0) continue;
      const pct = Math.floor((net / base.followers) * 1000) / 10;
      if (pct > best.pct) {
        const l = labels.get(connectionId);
        best = {
          pct,
          evidence: {
            headline: `+${frNumber(pct, 1)} % d'abonnés en 30 jours`,
            detail: `+${nf(net)} abonnés nets${l ? ` sur ${netLabel(l.network)} (${l.name})` : ""}, de ${nf(base.followers)} à ${nf(s.followers)}`,
            network: l?.network ?? null,
            measuredAt: iso(s.capturedAt)
          }
        };
      }
    }
  }
  return best;
}

const monthKey = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/** Mois de croissance d'affilée (≥ +1 % entre le premier et le dernier relevé du mois), sur un même compte. */
export function growthMonthsStreak(snaps: FollowerSnapshot[], labels: Map<string, { network: string; name: string }>): { months: number; evidence: QualityEvidence | null } {
  let best = { months: 0, evidence: null as QualityEvidence | null };
  for (const [connectionId, list] of Array.from(byConnection(snaps).entries())) {
    const byMonth = new Map<number, FollowerSnapshot[]>();
    for (const s of list) {
      if (s.followers <= 0) continue;
      const k = monthKey(s.capturedAt);
      byMonth.set(k, [...(byMonth.get(k) ?? []), s]);
    }
    const months = Array.from(byMonth.keys()).sort((a, b) => a - b);
    let run = 0;
    let prev: number | null = null;
    for (const m of months) {
      const ms = byMonth.get(m)!.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
      const first = ms[0];
      const last = ms[ms.length - 1];
      const spanOk = last.capturedAt.getTime() - first.capturedAt.getTime() >= 7 * DAY;
      const grew = spanOk && last.followers > first.followers && ((last.followers - first.followers) / first.followers) * 100 >= GROWTH_MONTH_MIN_PCT;
      run = grew ? (prev !== null && m === prev + 1 && run > 0 ? run + 1 : 1) : 0;
      prev = m;
      if (run > best.months) {
        const l = labels.get(connectionId);
        best = {
          months: run,
          evidence: {
            headline: `${run} mois de croissance d'affilée`,
            detail: `${l ? `${netLabel(l.network)} (${l.name}) : ` : ""}${nf(last.followers)} abonnés à la fin du dernier mois`,
            network: l?.network ?? null,
            measuredAt: iso(last.capturedAt)
          }
        };
      }
    }
  }
  return best;
}

/** Publication la plus partagée et enregistrée. */
export function savesSharesRecord(rows: MetricPostRow[]): { best: number; evidence: QualityEvidence | null } {
  let best = 0;
  let evidence: QualityEvidence | null = null;
  for (const r of rows) {
    const total = (r.shares ?? 0) + (r.saves ?? 0);
    if (total > best) {
      best = total;
      evidence = {
        headline: `${nf(total)} partages et enregistrements`,
        detail: `${nf(r.shares ?? 0)} partages, ${nf(r.saves ?? 0)} enregistrements (${netLabel(r.network)})`,
        title: r.title,
        network: r.network,
        permalink: r.permalink,
        measuredAt: iso(r.capturedAt)
      };
    }
  }
  return { best, evidence };
}

/** Avis argumentés de créateurs différents sur une même demande (jamais les siens). */
export function feedbackReceivedBest(requests: { id: string; context: string; comments: { authorId: string; body: string; createdAt: Date }[] }[], userId: string): { best: number; evidence: QualityEvidence | null } {
  let best = 0;
  let evidence: QualityEvidence | null = null;
  for (const req of requests) {
    const valid = req.comments.filter((c) => c.authorId !== userId && c.body.trim().length >= FEEDBACK_MIN_CHARS);
    const authors = new Set(valid.map((c) => c.authorId)).size;
    if (authors > best) {
      best = authors;
      const last = valid.reduce((d, c) => (c.createdAt > d ? c.createdAt : d), new Date(0));
      evidence = {
        headline: `${authors} créateur${authors > 1 ? "s" : ""} ont donné leur avis`,
        detail: "Avis argumentés reçus sur une demande d'avis de la Communauté Nebula",
        title: req.context || null,
        measuredAt: iso(last)
      };
    }
  }
  return { best, evidence };
}

const EMPTY: Record<QualityMetricId, number> = Object.fromEntries(QUALITY_METRICS.map((m) => [m, 0])) as Record<QualityMetricId, number>;

/** Mesures de qualité d'un compte (toutes ses marques), avec la preuve de chaque meilleur résultat. */
export async function loadQuality(userId: string, now: Date = new Date()): Promise<QualityResult> {
  const [rows, snaps, connections, requests, helpfulRows] = await Promise.all([
    prisma.postMetric.findMany({
      where: { connection: { brand: ownedBy(userId) } },
      select: { connectionId: true, network: true, title: true, permalink: true, publishedAt: true, capturedAt: true, views: true, likes: true, comments: true, shares: true, saves: true, avgViewPct: true, durationSeconds: true }
    }) as Promise<MetricPostRow[]>,
    prisma.analyticsSnapshot.findMany({
      where: { connection: { brand: ownedBy(userId) } },
      orderBy: { capturedAt: "asc" },
      select: { connectionId: true, capturedAt: true, followers: true }
    }) as Promise<FollowerSnapshot[]>,
    prisma.socialConnection.findMany({ where: { brand: ownedBy(userId) }, select: { id: true, network: true, displayName: true } }) as Promise<{ id: string; network: string; displayName: string }[]>,
    prisma.feedbackRequest.findMany({
      where: { authorId: userId },
      select: { id: true, context: true, comments: { select: { authorId: true, body: true, createdAt: true } } }
    }) as Promise<{ id: string; context: string; comments: { authorId: string; body: string; createdAt: Date }[] }[]>,
    // Une fois par demande : plusieurs messages sur la même demande ne
    // comptent pas double.
    prisma.feedbackComment.findMany({
      where: { authorId: userId, helpfulAt: { not: null }, request: { authorId: { not: userId } } },
      select: { requestId: true },
      distinct: ["requestId"]
    }) as Promise<{ requestId: string }[]>
  ]);
  const helpful = helpfulRows.length;
  const labels = new Map(connections.map((c) => [c.id, { network: c.network, name: c.displayName }]));
  const snapsByConnection = byConnection(snaps);
  const views = viewsRecord(rows, now);
  const engagement = engagementAboveBenchmarks(rows, snapsByConnection, now);
  const retention = retentionStats(rows, now);
  const growth = bestGrowth30d(snaps, labels);
  const months = growthMonthsStreak(snaps, labels);
  const saves = savesSharesRecord(rows);
  const feedback = feedbackReceivedBest(requests, userId);
  const metrics: Record<QualityMetricId, number> = {
    ...EMPTY,
    bestViewsRatio: views.ratio,
    postsAboveMedianEngagement: engagement.median,
    postsAboveHighEngagement: engagement.high,
    videosRetention50: retention.good,
    bestRetentionPct: retention.best,
    bestGrowthPct30d: growth.pct,
    growthMonthsStreak: months.months,
    bestSavesShares: saves.best,
    bestFeedbackReceived: feedback.best,
    helpfulAdvice: helpful
  };
  const helpfulEvidence: QualityEvidence | null = helpful
    ? { headline: `Vos avis ont aidé ${helpful} fois`, detail: "Marqués « Cet avis m'a aidé » par les créateurs qui avaient demandé l'avis de la Communauté Nebula", measuredAt: iso(now) }
    : null;
  const evidence: QualityResult["evidence"] = {
    bestViewsRatio: views.evidence ?? undefined,
    postsAboveMedianEngagement: engagement.evidence ?? undefined,
    postsAboveHighEngagement: engagement.evidence ?? undefined,
    videosRetention50: retention.evidence ?? undefined,
    bestRetentionPct: retention.evidence ?? undefined,
    bestGrowthPct30d: growth.evidence ?? undefined,
    growthMonthsStreak: months.evidence ?? undefined,
    bestSavesShares: saves.evidence ?? undefined,
    bestFeedbackReceived: feedback.evidence ?? undefined,
    helpfulAdvice: helpfulEvidence ?? undefined
  };
  return { metrics, evidence };
}
