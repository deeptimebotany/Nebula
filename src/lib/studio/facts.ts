// Studio IA (produit n°9) — « Ce qui marche chez vous » : faits calculés sur
// les vraies données de la marque, SANS IA. Fonctions pures (testées sans
// base) : la lecture en base est dans load.ts.
//
// Ces faits servent deux fois :
//  - affichés tels quels (aperçu, y compris pour le palier Gratuit) ;
//  - envoyés à l'IA comme seul contexte. Les chiffres montrés à côté d'une
//    idée (« 3,2 × vos vues habituelles ») viennent toujours d'ici, jamais
//    du texte de l'IA.
import type { Network } from "@/lib/types";

const DAY = 86_400_000;
/** Publications de moins de 2 jours : leurs chiffres montent encore. */
const SETTLE_MS = 2 * DAY;
export const STUDIO_WINDOW_DAYS = 120;
export const MIN_POSTS_FOR_FACTS = 3;

export interface MetricRow {
  network: Network;
  title: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface RetentionRow {
  /** [{ timeRatio (0–1), watchRatio (0–1) }] */
  curve: { timeRatio: number; watchRatio: number }[];
  /** Notes de l'analyse IA déjà faite (page Rétention IA). */
  notes: string[];
  createdAt: Date;
}

export interface TopPost {
  /** Numéro de référence (1, 2, 3…) que l'IA cite pour dire d'où vient une idée. */
  ref: number;
  network: Network;
  title: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  /** Chiffre principal : vues si le réseau les donne, sinon interactions. */
  metric: "views" | "interactions";
  value: number;
  /** Rapport à la médiane du même réseau (2,4 = 2,4 fois vos chiffres habituels). */
  vsUsual: number | null;
}

export interface StudioFacts {
  /** Publications mesurées sur la période (toutes plateformes). */
  measured: number;
  networks: Network[];
  topPosts: TopPost[];
  /** Médiane par réseau (vues ou interactions), pour les repères. */
  usual: { network: Network; metric: "views" | "interactions"; median: number; posts: number }[];
  bestSlots: { network: Network; hour: number }[];
  retention: {
    analyses: number;
    /** Moment (0–1 de la durée) où la moitié des spectateurs est partie (médiane), si jamais atteint : null. */
    halfAudienceAt: number | null;
    /** Part des spectateurs partis pendant les 10 premiers % (médiane). */
    earlyLoss: number | null;
    notes: string[];
  } | null;
  rhythm: { postsLast30Days: number; medianGapDays: number | null };
  /** Assez de chiffres pour parler de « ce qui marche » ? */
  enough: boolean;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const interactions = (m: MetricRow) => (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);

/** Chiffre principal d'une publication : les vues quand le réseau les donne, sinon les interactions. */
function mainMetric(rows: MetricRow[]): "views" | "interactions" {
  const withViews = rows.filter((r) => r.views !== null && r.views > 0).length;
  return withViews >= Math.ceil(rows.length / 2) ? "views" : "interactions";
}

/** Point de la courbe où l'audience passe sous un seuil (interpolé), ou null. */
export function crossing(curve: { timeRatio: number; watchRatio: number }[], threshold: number): number | null {
  const pts = [...curve].filter((p) => Number.isFinite(p.timeRatio) && Number.isFinite(p.watchRatio)).sort((a, b) => a.timeRatio - b.timeRatio);
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].watchRatio > threshold) continue;
    if (i === 0) return pts[0].timeRatio;
    const a = pts[i - 1];
    const b = pts[i];
    const t = (a.watchRatio - threshold) / Math.max(1e-9, a.watchRatio - b.watchRatio);
    return a.timeRatio + t * (b.timeRatio - a.timeRatio);
  }
  return null;
}

/** Audience restante à un moment donné (interpolée). */
export function watchAt(curve: { timeRatio: number; watchRatio: number }[], at: number): number | null {
  const pts = [...curve].sort((a, b) => a.timeRatio - b.timeRatio);
  if (pts.length === 0) return null;
  if (at <= pts[0].timeRatio) return pts[0].watchRatio;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].timeRatio >= at) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (at - a.timeRatio) / Math.max(1e-9, b.timeRatio - a.timeRatio);
      return a.watchRatio + t * (b.watchRatio - a.watchRatio);
    }
  }
  return pts[pts.length - 1].watchRatio;
}

export function computeStudioFacts(input: {
  metrics: MetricRow[];
  retention: RetentionRow[];
  bestSlots: { network: Network; hour: number }[];
  publishedDates: Date[];
  connectedNetworks: Network[];
  now: Date;
}): StudioFacts {
  const { now } = input;
  const since = now.getTime() - STUDIO_WINDOW_DAYS * DAY;
  const settled = input.metrics.filter((m) => {
    const t = m.publishedAt ? new Date(m.publishedAt).getTime() : null;
    return t !== null && t >= since && now.getTime() - t >= SETTLE_MS;
  });

  // Repère par réseau : la médiane de ses propres publications.
  const byNetwork = new Map<Network, MetricRow[]>();
  for (const m of settled) byNetwork.set(m.network, [...(byNetwork.get(m.network) ?? []), m]);
  const usual: StudioFacts["usual"] = [];
  const scored: { row: MetricRow; metric: "views" | "interactions"; value: number; vsUsual: number | null }[] = [];
  for (const [network, rows] of byNetwork) {
    const metric = mainMetric(rows);
    const values = rows.map((r) => (metric === "views" ? (r.views ?? 0) : interactions(r)));
    const med = median(values) ?? 0;
    usual.push({ network, metric, median: Math.round(med), posts: rows.length });
    rows.forEach((row, i) => scored.push({ row, metric, value: values[i], vsUsual: rows.length >= MIN_POSTS_FOR_FACTS && med > 0 ? values[i] / med : null }));
  }

  // Ce qui a le mieux marché, par rapport aux habitudes de chaque réseau
  // (un réseau avec peu de publications passe après).
  const ranked = scored
    .filter((s) => s.value > 0 && (s.row.title ?? "").trim().length > 0)
    .sort((a, b) => (b.vsUsual ?? 0) - (a.vsUsual ?? 0) || b.value - a.value)
    .slice(0, 6);
  const topPosts: TopPost[] = ranked.map((s, i) => ({
    ref: i + 1,
    network: s.row.network,
    title: (s.row.title ?? "").trim().slice(0, 160),
    permalink: s.row.permalink,
    thumbnailUrl: s.row.thumbnailUrl,
    publishedAt: s.row.publishedAt ? new Date(s.row.publishedAt).toISOString() : null,
    metric: s.metric,
    value: s.value,
    vsUsual: s.vsUsual === null ? null : Math.round(s.vsUsual * 10) / 10
  }));

  // Rétention : médianes des analyses déjà faites (les 10 plus récentes).
  const analyses = [...input.retention].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 10).filter((r) => r.curve.length >= 3);
  let retention: StudioFacts["retention"] = null;
  if (analyses.length > 0) {
    const halves = analyses.map((a) => crossing(a.curve, 0.5)).filter((x): x is number => x !== null);
    const early = analyses.map((a) => {
      const start = watchAt(a.curve, 0) ?? 1;
      const at10 = watchAt(a.curve, 0.1);
      return at10 === null ? null : Math.max(0, start - at10);
    });
    const earlyValues = early.filter((x): x is number => x !== null);
    retention = {
      analyses: analyses.length,
      halfAudienceAt: halves.length >= Math.ceil(analyses.length / 2) ? Math.round((median(halves) ?? 0) * 100) / 100 : null,
      earlyLoss: earlyValues.length ? Math.round((median(earlyValues) ?? 0) * 100) / 100 : null,
      notes: Array.from(new Set(analyses.flatMap((a) => a.notes).map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 220))).slice(0, 5)
    };
  }

  // Rythme : publications envoyées ces 30 derniers jours, écart médian.
  const dates = input.publishedDates.map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t) && t <= now.getTime()).sort((a, b) => b - a);
  const recent = dates.filter((t) => now.getTime() - t <= 30 * DAY);
  const gaps: number[] = [];
  for (let i = 0; i < Math.min(dates.length, 20) - 1; i++) gaps.push((dates[i] - dates[i + 1]) / DAY);

  return {
    measured: settled.length,
    networks: Array.from(new Set(input.connectedNetworks)),
    topPosts,
    usual: usual.sort((a, b) => b.posts - a.posts),
    bestSlots: input.bestSlots,
    retention,
    rhythm: { postsLast30Days: recent.length, medianGapDays: gaps.length >= 2 ? Math.round((median(gaps) ?? 0) * 10) / 10 : null },
    enough: topPosts.length >= MIN_POSTS_FOR_FACTS
  };
}

/** Faits compacts envoyés à l'IA (jamais les données brutes des comptes). */
export function factsForPrompt(facts: StudioFacts, brandName: string): Record<string, unknown> {
  return {
    marque: brandName,
    reseaux_connectes: facts.networks,
    publications_qui_ont_le_mieux_marche: facts.topPosts.map((p) => ({
      ref: p.ref,
      reseau: p.network,
      titre: p.title,
      [p.metric === "views" ? "vues" : "interactions"]: p.value,
      fois_les_chiffres_habituels: p.vsUsual
    })),
    chiffres_habituels_par_reseau: facts.usual.map((u) => ({ reseau: u.network, mesure: u.metric === "views" ? "vues" : "interactions", mediane: u.median, publications: u.posts })),
    meilleures_heures: facts.bestSlots.map((s) => ({ reseau: s.network, heure: `${s.hour} h` })),
    retention: facts.retention
      ? {
          videos_analysees: facts.retention.analyses,
          moitie_du_public_partie_a_pourcent_de_la_video: facts.retention.halfAudienceAt === null ? null : Math.round(facts.retention.halfAudienceAt * 100),
          public_perdu_dans_les_10_premiers_pourcents: facts.retention.earlyLoss === null ? null : Math.round(facts.retention.earlyLoss * 100),
          observations: facts.retention.notes
        }
      : null,
    rythme: { publications_30_derniers_jours: facts.rhythm.postsLast30Days, ecart_median_jours: facts.rhythm.medianGapDays }
  };
}
