// Bilan du mois (03/10/2026) : calcul du bilan à partir des relevés déjà
// enregistrés. Fichier PUR (les données sont chargées par data.ts), testé
// seul. Règle d'or : uniquement de vrais chiffres, calculés comme chaque
// réseau les donne (voir VIEWS_KIND), « — » quand un réseau ne les donne pas.
import {
  dayIndexOf,
  dayLabel,
  dayLongLabel,
  daysInMonth,
  monthBounds,
  monthLabel,
  monthName,
  monthTitle,
  nextMonth,
  previousMonth,
  thanInMonth,
  weekdayAndHour,
  weekdayName,
  type MonthKey
} from "./period";
import type { FollowerRow, MonthlySummaryData, TopPost, ViewRow, ViewsKind } from "./types";

/**
 * Comment chaque réseau donne ses vues (relevés AnalyticsSnapshot.impressions) :
 *  - daily : valeur du jour (Instagram « views », Facebook « page_media_view ») → somme d'un relevé par jour ;
 *  - cumulative : compteur total de la chaîne (YouTube viewCount) → fin du mois moins début ;
 *  - rolling30 : total des 30 derniers jours (Pinterest) → dernier relevé du mois ;
 *  - posts : pas de vues de compte (TikTok) → vues des publications du mois ;
 *  - none : non communiquées (Bluesky, LinkedIn).
 */
export const VIEWS_KIND: Record<string, ViewsKind> = {
  INSTAGRAM: "daily",
  FACEBOOK: "daily",
  YOUTUBE: "cumulative",
  PINTEREST: "rolling30",
  TIKTOK: "posts",
  THREADS: "posts",
  BLUESKY: "none",
  LINKEDIN: "none"
};

export const NETWORK_NAMES: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  YOUTUBE: "YouTube",
  PINTEREST: "Pinterest",
  TIKTOK: "TikTok",
  THREADS: "Threads",
  BLUESKY: "Bluesky",
  LINKEDIN: "LinkedIn"
};

/** Minimum de publications chiffrées pour « Ce qui a marché ». */
export const MIN_POSTS_FOR_INSIGHTS = 6;
/** Miniatures dont l'adresse ne périme pas (les adresses Instagram ou TikTok expirent en quelques jours). */
const STABLE_THUMB_HOSTS = [/(^|\.)ytimg\.com$/, /(^|\.)pinimg\.com$/, /(^|\.)public\.blob\.vercel-storage\.com$/];

export interface SnapIn {
  connectionId: string;
  capturedAt: Date;
  followers: number;
  impressions: number;
}

export interface PostMetricIn {
  connectionId: string;
  postExternalId: string;
  title: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  durationSeconds: number | null;
}

export interface NebulaTargetIn {
  postId: string;
  connectionId: string;
  externalPostId: string | null;
  externalUrl: string | null;
  publishedAt: Date;
  mediaType: string | null;
  title: string;
  thumbnailUrl: string | null;
}

export interface SummaryInput {
  month: MonthKey;
  tz: string;
  brand: { id: string; name: string; slug: string };
  accounts: { id: string; network: string; name: string }[];
  /** Ni abonnement payant, ni accès offert : encart Pro. */
  upsell: boolean;
  /** Relevés de compte, du début du mois précédent (moins quelques jours) à la fin du mois. */
  snapshots: SnapIn[];
  /** Métriques par publication publiées le mois précédent ou ce mois-ci. */
  postMetrics: PostMetricIn[];
  /** Mises en ligne Nebula du mois précédent et de ce mois-ci. */
  targets: NebulaTargetIn[];
  /** Publications programmées le mois suivant (date de mise en ligne). */
  scheduledNext: Date[];
  community: { comments: number; replies: number } | null;
  bio: { total: number; delta: number | null } | null;
  reussites: MonthlySummaryData["reussites"];
  /** Adresse du site (https://nebulahub.space) : ses propres fichiers sont des miniatures sûres. */
  appOrigin?: string;
}

// --- Petits outils ------------------------------------------------------------

export function frNumber(n: number): string {
  return Math.round(n).toLocaleString("fr-FR").replace(/ | /g, " ");
}

/** « +22 % », « +5,8 % », « −8 % » (une décimale sous 10 %). */
export function pctText(p: number): string {
  const abs = Math.abs(p);
  const value = abs < 10 ? (Math.round(abs * 10) / 10).toLocaleString("fr-FR") : String(Math.round(abs));
  return `${p < 0 ? "−" : "+"}${value} %`;
}

export function signed(n: number): string {
  return `${n < 0 ? "−" : "+"}${frNumber(Math.abs(n))}`;
}

function pct(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before <= 0) return null;
  return ((now - before) / before) * 100;
}

function sumOrNull(values: (number | null | undefined)[]): number | null {
  let seen = false;
  let total = 0;
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) {
      seen = true;
      total += v;
    }
  }
  return seen ? total : null;
}

function stableThumb(url: string | null, appOrigin?: string): string | null {
  if (!url) return null;
  try {
    // Fichier du site (ex. médias de démonstration) : adresse complète.
    const u = new URL(url, appOrigin || "https://invalid.local");
    const own = appOrigin ? new URL(appOrigin).hostname : null;
    return u.protocol === "https:" && (STABLE_THUMB_HOSTS.some((r) => r.test(u.hostname)) || (own !== null && u.hostname === own)) ? u.toString() : null;
  } catch {
    return null;
  }
}

function ratioText(r: number): string {
  return `${(Math.round(r * 10) / 10).toLocaleString("fr-FR")} fois`;
}

/** Dernier relevé de chaque jour du mois (index du jour → relevé). */
function lastPerDay(snaps: SnapIn[], key: MonthKey, tz: string): Map<number, SnapIn> {
  const out = new Map<number, SnapIn>();
  for (const s of snaps) {
    const d = dayIndexOf(s.capturedAt, key, tz);
    if (d < 0) continue;
    const prev = out.get(d);
    if (!prev || s.capturedAt >= prev.capturedAt) out.set(d, s);
  }
  return out;
}

// --- Abonnés -----------------------------------------------------------------------

export interface AccountFollowers {
  total: number;
  base: number;
  gain: number;
  daily: number[];
  /** Pas de relevé avant le mois : gain compté depuis le premier relevé du mois. */
  partial: boolean;
}

export function accountFollowers(snaps: SnapIn[], key: MonthKey, tz: string): AccountFollowers | null {
  const { start, end } = monthBounds(key, tz);
  const sorted = [...snaps].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const before = sorted.filter((s) => s.capturedAt < start).at(-1) ?? null;
  const inMonth = sorted.filter((s) => s.capturedAt >= start && s.capturedAt < end);
  if (inMonth.length === 0) return null;
  const base = before?.followers ?? inMonth[0].followers;
  const perDay = lastPerDay(inMonth, key, tz);
  const n = daysInMonth(key);
  const daily: number[] = [];
  let prev = base;
  for (let d = 0; d < n; d++) {
    const s = perDay.get(d);
    if (s) {
      daily.push(s.followers - prev);
      prev = s.followers;
    } else daily.push(0);
  }
  const total = inMonth[inMonth.length - 1].followers;
  return { total, base, gain: total - base, daily, partial: !before };
}

// --- Vues ----------------------------------------------------------------------------

export interface AccountViews {
  total: number | null;
  daily: number[] | null;
  partial: boolean;
}

export function accountViews(kind: ViewsKind, snaps: SnapIn[], posts: PostMetricIn[], key: MonthKey, tz: string): AccountViews {
  const { start, end } = monthBounds(key, tz);
  const n = daysInMonth(key);
  const sorted = [...snaps].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const inMonth = sorted.filter((s) => s.capturedAt >= start && s.capturedAt < end);
  if (kind === "daily") {
    if (inMonth.length === 0) return { total: null, daily: null, partial: false };
    const perDay = lastPerDay(inMonth, key, tz);
    const daily = Array.from({ length: n }, (_, d) => Math.max(0, perDay.get(d)?.impressions ?? 0));
    return { total: daily.reduce((a, b) => a + b, 0), daily, partial: perDay.size < n };
  }
  if (kind === "cumulative") {
    if (inMonth.length === 0) return { total: null, daily: null, partial: false };
    const before = sorted.filter((s) => s.capturedAt < start).at(-1) ?? null;
    let prev = before?.impressions ?? inMonth[0].impressions;
    const perDay = lastPerDay(inMonth, key, tz);
    const daily: number[] = [];
    for (let d = 0; d < n; d++) {
      const s = perDay.get(d);
      if (s) {
        daily.push(Math.max(0, s.impressions - prev));
        prev = Math.max(prev, s.impressions);
      } else daily.push(0);
    }
    return { total: daily.reduce((a, b) => a + b, 0), daily, partial: !before };
  }
  if (kind === "rolling30") {
    // Dernier relevé du mois, s'il date des 5 derniers jours (sinon il couvre surtout le mois d'avant).
    const last = inMonth.at(-1);
    if (!last || last.capturedAt.getTime() < end.getTime() - 5 * 86_400_000) return { total: null, daily: null, partial: false };
    return { total: Math.max(0, last.impressions), daily: null, partial: false };
  }
  if (kind === "posts") {
    const inMonthPosts = posts.filter((p) => p.publishedAt >= start && p.publishedAt < end);
    return { total: sumOrNull(inMonthPosts.map((p) => p.views)), daily: null, partial: false };
  }
  return { total: null, daily: null, partial: false };
}

/**
 * Vues d'un compte sur une période quelconque (Rapports clients, 03/10/2026),
 * selon la façon dont le réseau les donne. `before` : dernier relevé avant la
 * période (compteurs cumulés). Jours comptés en UTC.
 */
export function viewsInRange(kind: ViewsKind, snaps: SnapIn[], before: SnapIn | null, posts: Pick<PostMetricIn, "publishedAt" | "views">[], start: Date, end: Date): number | null {
  const inRange = [...snaps].filter((s) => s.capturedAt >= start && s.capturedAt < end).sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  if (kind === "daily") {
    if (inRange.length === 0) return null;
    const perDay = new Map<string, number>();
    for (const s of inRange) perDay.set(s.capturedAt.toISOString().slice(0, 10), Math.max(0, s.impressions));
    return Array.from(perDay.values()).reduce((a, b) => a + b, 0);
  }
  if (kind === "cumulative") {
    if (inRange.length === 0) return null;
    const base = before?.impressions ?? inRange[0].impressions;
    return Math.max(0, inRange[inRange.length - 1].impressions - base);
  }
  if (kind === "rolling30") return inRange.length ? Math.max(0, inRange[inRange.length - 1].impressions) : null;
  if (kind === "posts") return sumOrNull(posts.filter((p) => p.publishedAt >= start && p.publishedAt < end).map((p) => p.views));
  return null;
}

// --- Interactions ------------------------------------------------------------------------

interface InteractionTotals {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  total: number | null;
  rate: number | null;
}

export function interactionsOf(posts: PostMetricIn[]): InteractionTotals {
  const likes = sumOrNull(posts.map((p) => p.likes));
  const comments = sumOrNull(posts.map((p) => p.comments));
  const shares = sumOrNull(posts.map((p) => p.shares));
  const saves = sumOrNull(posts.map((p) => p.saves));
  const total = sumOrNull([likes, comments, shares, saves]);
  const withViews = posts.filter((p) => (p.views ?? 0) > 0);
  const views = withViews.reduce((a, p) => a + (p.views ?? 0), 0);
  const inter = withViews.reduce((a, p) => a + postInteractions(p), 0);
  return { likes, comments, shares, saves, total, rate: views > 0 ? (inter / views) * 100 : null };
}

export function postInteractions(p: Pick<PostMetricIn, "likes" | "comments" | "shares" | "saves">): number {
  return (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0);
}

// --- Publications ------------------------------------------------------------------------

interface PublicationStats {
  count: number;
  online: number;
  videos: number;
  photos: number;
  others: number;
  activeDays: number[];
  perNetwork: Map<string, number>;
  viaNebula: number;
}

function publicationsOf(key: MonthKey, tz: string, targets: NebulaTargetIn[], posts: PostMetricIn[], networkOf: (connectionId: string) => string): PublicationStats {
  const { start, end } = monthBounds(key, tz);
  const t = targets.filter((x) => x.publishedAt >= start && x.publishedAt < end);
  const nebulaKeys = new Set(t.filter((x) => x.externalPostId).map((x) => `${x.connectionId}:${x.externalPostId}`));
  const external = posts.filter((p) => p.publishedAt >= start && p.publishedAt < end && !nebulaKeys.has(`${p.connectionId}:${p.postExternalId}`));
  const perNetwork = new Map<string, number>();
  const days = new Set<number>();
  for (const x of t) {
    const net = networkOf(x.connectionId);
    perNetwork.set(net, (perNetwork.get(net) ?? 0) + 1);
    days.add(dayIndexOf(x.publishedAt, key, tz));
  }
  for (const p of external) {
    const net = networkOf(p.connectionId);
    perNetwork.set(net, (perNetwork.get(net) ?? 0) + 1);
    days.add(dayIndexOf(p.publishedAt, key, tz));
  }
  const nebulaPosts = new Map<string, string | null>();
  for (const x of t) if (!nebulaPosts.has(x.postId)) nebulaPosts.set(x.postId, x.mediaType);
  let videos = 0;
  let photos = 0;
  let others = 0;
  for (const type of Array.from(nebulaPosts.values())) {
    if (type === "VIDEO") videos++;
    else if (type === "IMAGE") photos++;
    else others++;
  }
  for (const p of external) {
    const net = networkOf(p.connectionId);
    if (net === "TIKTOK" || net === "YOUTUBE") videos++;
    else others++;
  }
  days.delete(-1);
  return {
    count: nebulaPosts.size + external.length,
    online: t.length + external.length,
    videos,
    photos,
    others,
    activeDays: Array.from(days).sort((a, b) => a - b),
    perNetwork,
    viaNebula: nebulaPosts.size
  };
}

// --- Ce qui a marché ----------------------------------------------------------------------

const WINDOWS: { from: number; to: number }[] = [
  { from: 6, to: 9 },
  { from: 9, to: 12 },
  { from: 12, to: 15 },
  { from: 15, to: 18 },
  { from: 18, to: 21 },
  { from: 21, to: 24 },
  { from: 0, to: 6 }
];

interface Insight {
  text: string;
  ratio: number;
  kind: "hour" | "weekday" | "format" | "duration" | "network" | "weekend";
  weekday?: number;
  window?: { from: number; to: number };
}

function avg(list: number[]): number {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
}

/** Meilleur groupe face aux autres : au moins 2 publications de chaque côté, 1,3 fois mieux au moins. */
function bestGroup<T>(items: { key: T; views: number }[], minRatio = 1.3): { key: T; ratio: number; count: number; total: number } | null {
  const groups = new Map<T, number[]>();
  for (const it of items) groups.set(it.key, [...(groups.get(it.key) ?? []), it.views]);
  let best: { key: T; ratio: number; count: number; total: number } | null = null;
  for (const [key, list] of Array.from(groups)) {
    if (list.length < 2) continue;
    const others = items.filter((i) => i.key !== key).map((i) => i.views);
    if (others.length < 2) continue;
    const o = avg(others);
    if (o <= 0) continue;
    const ratio = avg(list) / o;
    if (ratio >= minRatio && (!best || ratio > best.ratio)) best = { key, ratio, count: list.length, total: items.length };
  }
  return best;
}

export function insightsOf(posts: (PostMetricIn & { network: string; mediaType: string | null })[], tz: string): Insight[] {
  const withViews = posts.filter((p) => (p.views ?? 0) > 0);
  if (withViews.length < MIN_POSTS_FOR_INSIGHTS) return [];
  const out: Insight[] = [];
  const hour = bestGroup(
    withViews.map((p) => {
      const h = weekdayAndHour(p.publishedAt, tz).hour;
      return { key: WINDOWS.findIndex((w) => h >= w.from && h < w.to), views: p.views ?? 0 };
    })
  );
  if (hour) {
    const w = WINDOWS[hour.key];
    out.push({
      kind: "hour",
      ratio: hour.ratio,
      window: w,
      text: `Vos publications mises en ligne **entre ${w.from} h et ${w.to} h** ont fait en moyenne **${ratioText(hour.ratio)} plus de vues** que les autres (${hour.count} sur ${hour.total}).`
    });
  }
  const day = bestGroup(withViews.map((p) => ({ key: weekdayAndHour(p.publishedAt, tz).weekday, views: p.views ?? 0 })));
  if (day) {
    out.push({
      kind: "weekday",
      ratio: day.ratio,
      weekday: day.key,
      text: `Le **${weekdayName(day.key)}** a été votre meilleur jour : **${ratioText(day.ratio)} plus de vues** en moyenne.`
    });
  }
  const typed = withViews
    .map((p) => ({ key: p.mediaType === "VIDEO" || p.network === "TIKTOK" || p.network === "YOUTUBE" ? "VIDEO" : p.mediaType === "IMAGE" ? "IMAGE" : null, views: p.views ?? 0 }))
    .filter((x): x is { key: "VIDEO" | "IMAGE"; views: number } => x.key !== null);
  const format = bestGroup(typed, 1.5);
  if (format) {
    out.push({
      kind: "format",
      ratio: format.ratio,
      text: format.key === "VIDEO" ? `Vos **vidéos** ont fait **${ratioText(format.ratio)} plus de vues** que vos photos.` : `Vos **photos** ont fait **${ratioText(format.ratio)} plus de vues** que vos vidéos.`
    });
  }
  const timed = withViews.filter((p) => typeof p.durationSeconds === "number" && p.durationSeconds > 0);
  const duration = bestGroup(timed.map((p) => ({ key: (p.durationSeconds ?? 0) <= 60 ? "short" : "long", views: p.views ?? 0 })), 1.5);
  if (duration) {
    out.push({
      kind: "duration",
      ratio: duration.ratio,
      text: duration.key === "short" ? `Les vidéos de **moins d'une minute** ont fait **${ratioText(duration.ratio)} plus de vues** que les plus longues.` : `Les vidéos de **plus d'une minute** ont fait **${ratioText(duration.ratio)} plus de vues** que les plus courtes.`
    });
  }
  // Réseau où l'on réagit le plus (taux d'engagement), au moins 2 réseaux de 2 publications.
  const byNet = new Map<string, { inter: number; views: number; count: number }>();
  for (const p of withViews) {
    const b = byNet.get(p.network) ?? { inter: 0, views: 0, count: 0 };
    b.inter += postInteractions(p);
    b.views += p.views ?? 0;
    b.count += 1;
    byNet.set(p.network, b);
  }
  const nets = Array.from(byNet).filter(([, b]) => b.count >= 2 && b.views > 0);
  if (nets.length >= 2) {
    nets.sort((a, b) => b[1].inter / b[1].views - a[1].inter / a[1].views);
    const [net, b] = nets[0];
    const second = nets[1][1];
    const rate = (b.inter / b.views) * 100;
    const ratio = b.inter / b.views / Math.max(1e-9, second.inter / second.views);
    if (ratio >= 1.2 && rate > 0) {
      out.push({
        kind: "network",
        ratio,
        text: `C'est sur **${NETWORK_NAMES[net] ?? net}** que vos publications ont le plus fait réagir : **${(Math.round(rate * 10) / 10).toLocaleString("fr-FR")} %** d'engagement.`
      });
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, 3);
}

// --- Bilan complet ----------------------------------------------------------------------------

export function buildSummary(input: SummaryInput): MonthlySummaryData {
  const { month, tz } = input;
  const prev = previousMonth(month);
  const next = nextMonth(month);
  const n = daysInMonth(month);
  const bounds = monthBounds(month, tz);
  const prevBounds = monthBounds(prev, tz);
  const accountById = new Map(input.accounts.map((a) => [a.id, a]));
  const networkOf = (id: string) => accountById.get(id)?.network ?? "";
  const snapsOf = (id: string) => input.snapshots.filter((s) => s.connectionId === id);
  const postsOf = (id: string) => input.postMetrics.filter((p) => p.connectionId === id);
  const inMonth = (d: Date, b: { start: Date; end: Date }) => d >= b.start && d < b.end;

  // Abonnés
  const followerRows: FollowerRow[] = [];
  let followersDaily: number[] | null = null;
  let prevGain: number | null = null;
  for (const a of input.accounts) {
    const f = accountFollowers(snapsOf(a.id), month, tz);
    const pf = accountFollowers(snapsOf(a.id), prev, tz);
    if (pf) prevGain = (prevGain ?? 0) + pf.gain;
    if (!f) continue;
    followerRows.push({ accountId: a.id, network: a.network, name: a.name, total: f.total, gain: f.gain, pct: f.base > 0 ? (f.gain / f.base) * 100 : null });
    followersDaily = followersDaily ? followersDaily.map((v, i) => v + f.daily[i]) : [...f.daily];
  }
  followerRows.sort((a, b) => b.total - a.total);
  const followersTotal = followerRows.length ? followerRows.reduce((s, r) => s + r.total, 0) : null;
  const followersGain = followerRows.length ? followerRows.reduce((s, r) => s + (r.gain ?? 0), 0) : null;
  let bestDay: MonthlySummaryData["followers"]["bestDay"] = null;
  if (followersDaily) {
    const max = Math.max(...followersDaily);
    const sorted = [...followersDaily].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (max >= 10 && max >= 2 * Math.max(1, median)) {
      const d = followersDaily.indexOf(max);
      bestDay = { dayIndex: d, label: dayLongLabel(month, d), gain: max };
    }
  }

  // Vues
  const viewRows: ViewRow[] = [];
  let viewsDaily: number[] | null = null;
  const dailyNetworks = new Set<string>();
  const notes: string[] = [];
  let prevViews: number | null = null;
  for (const a of input.accounts) {
    const kind = VIEWS_KIND[a.network] ?? "none";
    const v = accountViews(kind, snapsOf(a.id), postsOf(a.id), month, tz);
    const pv = accountViews(kind, snapsOf(a.id), postsOf(a.id), prev, tz);
    if (pv.total !== null) prevViews = (prevViews ?? 0) + pv.total;
    if (v.daily) {
      viewsDaily = viewsDaily ? viewsDaily.map((x, i) => x + v.daily![i]) : [...v.daily];
      dailyNetworks.add(a.network);
    }
    viewRows.push({ accountId: a.id, network: a.network, name: a.name, kind, total: v.total, share: null, pct: pct(v.total, pv.total) });
  }
  const viewsTotal = sumOrNull(viewRows.map((r) => r.total));
  for (const r of viewRows) r.share = viewsTotal && r.total !== null ? (r.total / viewsTotal) * 100 : null;
  viewRows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const nets = new Set(input.accounts.map((a) => a.network));
  if (Array.from(nets).some((x) => VIEWS_KIND[x] === "posts")) {
    notes.push(`${Array.from(nets).filter((x) => VIEWS_KIND[x] === "posts").map((x) => NETWORK_NAMES[x] ?? x).join(" et ")} ne donne que les vues par publication : ce sont celles des publications mises en ligne en ${monthName(month)}.`);
  }
  if (nets.has("PINTEREST")) notes.push("Pinterest : vues des 30 derniers jours au dernier relevé du mois.");
  if (Array.from(nets).some((x) => VIEWS_KIND[x] === "none")) {
    notes.push(`${Array.from(nets).filter((x) => VIEWS_KIND[x] === "none").map((x) => NETWORK_NAMES[x] ?? x).join(" et ")} ne communique pas ses vues.`);
  }

  // Interactions (publications du mois)
  const monthPosts = input.postMetrics.filter((p) => inMonth(p.publishedAt, bounds));
  const prevPosts = input.postMetrics.filter((p) => inMonth(p.publishedAt, prevBounds));
  const it = interactionsOf(monthPosts);
  const pit = prevPosts.length ? interactionsOf(prevPosts) : null;
  let note: string | null = null;
  if (it.rate !== null) {
    note = `Taux d'engagement : **${(Math.round(it.rate * 10) / 10).toLocaleString("fr-FR")} %** des vues${pit?.rate != null ? ` (${(Math.round(pit.rate * 10) / 10).toLocaleString("fr-FR")} % en ${monthName(prev)})` : ""}.`;
    if (pit) {
      const fields: { label: string; now: number | null; before: number | null }[] = [
        { label: "j'aime", now: it.likes, before: pit.likes },
        { label: "commentaires", now: it.comments, before: pit.comments },
        { label: "partages", now: it.shares, before: pit.shares },
        { label: "enregistrements", now: it.saves, before: pit.saves }
      ];
      const growing = fields
        .map((f) => ({ ...f, p: f.now !== null && f.before !== null && f.before >= 20 ? pct(f.now, f.before) : null }))
        .filter((f) => f.p !== null && f.p >= 10)
        .sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
      if (growing[0]) note += ` Ce sont les **${growing[0].label}** qui progressent le plus (${pctText(growing[0].p!)}).`;
    }
  }

  // Publications
  const pub = publicationsOf(month, tz, input.targets, input.postMetrics, networkOf);
  const prevPub = publicationsOf(prev, tz, input.targets, input.postMetrics, networkOf);
  const hasPrevPub = prevPub.online > 0 || input.snapshots.some((s) => inMonth(s.capturedAt, prevBounds));

  // Top 3 (par vues, sinon par interactions)
  const targetByExternal = new Map(input.targets.filter((x) => x.externalPostId).map((x) => [`${x.connectionId}:${x.externalPostId}`, x]));
  const top: TopPost[] = monthPosts
    .map((p) => ({ p, score: p.views ?? postInteractions(p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ p }) => {
      const t = targetByExternal.get(`${p.connectionId}:${p.postExternalId}`);
      const d = dayIndexOf(p.publishedAt, month, tz);
      const inter = p.likes === null && p.comments === null && p.shares === null && p.saves === null ? null : postInteractions(p);
      const rawTitle = (p.title || t?.title || "").replace(/\s+/g, " ").trim();
      return {
        title: rawTitle ? (rawTitle.length > 90 ? `${rawTitle.slice(0, 87)}…` : rawTitle) : `Publication du ${dayLongLabel(month, d)}`,
        network: networkOf(p.connectionId),
        accountName: accountById.get(p.connectionId)?.name ?? "",
        dayIndex: d,
        dayLabel: dayLabel(month, d),
        views: p.views,
        interactions: inter,
        rate: p.views && p.views > 0 && inter !== null ? (inter / p.views) * 100 : null,
        url: p.permalink ?? t?.externalUrl ?? null,
        thumbnailUrl: stableThumb(t?.thumbnailUrl ?? null, input.appOrigin) ?? stableThumb(p.thumbnailUrl, input.appOrigin)
      };
    });

  // Ce qui a marché
  const typedPosts = monthPosts.map((p) => ({
    ...p,
    network: networkOf(p.connectionId),
    mediaType: targetByExternal.get(`${p.connectionId}:${p.postExternalId}`)?.mediaType ?? null
  }));
  const found = insightsOf(typedPosts, tz);
  const insights = found.map((i) => i.text);
  const weekendPosts = pub.activeDays.filter((d) => {
    const wd = weekdayAndHour(new Date(bounds.start.getTime() + d * 86_400_000 + 12 * 3_600_000), tz).weekday;
    return wd >= 5;
  });
  if (insights.length > 0 && insights.length < 3 && pub.activeDays.length >= 8 && weekendPosts.length === 0) insights.push("Vous n'avez rien publié le **week-end** ce mois-ci.");

  // Mois suivant
  const nextBounds = monthBounds(next, tz);
  const scheduled = input.scheduledNext.filter((d) => inMonth(d, nextBounds));
  const scheduledDays = new Set(scheduled.map((d) => dayIndexOf(d, next, tz))).size;
  const missing = Math.max(0, pub.activeDays.length - scheduledDays);
  const bestWeekday = found.find((i) => i.kind === "weekday");
  const bestWindow = found.find((i) => i.kind === "hour");
  const suggestion =
    bestWeekday || bestWindow
      ? `idéalement ${bestWeekday ? `le ${weekdayName(bestWeekday.weekday!)}` : ""}${bestWeekday && bestWindow ? " " : ""}${bestWindow ? `vers ${bestWindow.window!.from} h` : ""}`
      : null;

  // L'essentiel
  const hasPrev = prevGain !== null || prevViews !== null;
  const essentials: string[] = [];
  const gainUp = followersGain !== null && prevGain !== null ? followersGain > prevGain : null;
  const viewsPct = pct(viewsTotal, prevViews);
  const ups = [gainUp, viewsPct !== null ? viewsPct > 0 : null].filter((x) => x !== null) as boolean[];
  const tone = !hasPrev ? "Votre premier bilan" : ups.length && ups.every(Boolean) ? (viewsPct !== null && viewsPct >= 15 ? "Très bon mois" : "Bon mois") : ups.some(Boolean) ? "Mois en progrès" : "Mois plus calme";
  const parts: string[] = [];
  if (followersGain !== null) {
    let s = `**${signed(followersGain)} abonné${Math.abs(followersGain) > 1 ? "s" : ""}**`;
    if (prevGain !== null && prevGain > 0 && followersGain > 0) {
      const g = pct(followersGain, prevGain)!;
      if (Math.abs(g) >= 5) s += ` (${Math.round(Math.abs(g))} % ${g > 0 ? "de plus" : "de moins"} ${thanInMonth(prev)})`;
    }
    parts.push(s);
  }
  if (viewsTotal !== null) parts.push(`**${frNumber(viewsTotal)} vues**${viewsPct !== null ? ` (${pctText(viewsPct)})` : ""}`);
  if (parts.length) essentials.push(`${tone} : ${parts.join(" et ")}.`);
  else if (pub.online > 0) essentials.push(`${tone} : **${pub.count} publication${pub.count > 1 ? "s" : ""}** en ${monthName(month)}.`);
  const best = top[0];
  if (best && best.views !== null && viewsTotal && viewsTotal > 0 && monthPosts.length >= 3) {
    const share = best.views / viewsTotal;
    if (share >= 0.2) {
      const portion = share >= 0.45 ? "près de la moitié" : share >= 0.3 ? "près d'un tiers" : share >= 0.22 ? "un quart" : "un cinquième";
      essentials.push(`Votre publication « ${best.title} » a apporté à elle seule **${portion} de vos vues**${bestDay && Math.abs(bestDay.dayIndex - best.dayIndex) <= 1 ? ` et le pic d'abonnés du ${bestDay.label}` : ""}.`);
    }
  }
  if (essentials.length < 2 && bestDay) essentials.push(`Votre meilleur jour : le **${bestDay.label}**, avec **${signed(bestDay.gain)} abonnés**.`);

  const hasData = followerRows.length > 0 || viewsTotal !== null || pub.online > 0 || monthPosts.length > 0;

  return {
    month,
    monthTitle: monthTitle(month),
    monthLabel: monthLabel(month),
    previousMonth: prev,
    previousName: monthName(prev),
    days: n,
    brand: input.brand,
    accounts: input.accounts,
    firstReport: !hasPrev,
    hasData,
    essentials,
    followers: { total: followersTotal, gain: followersGain, prevGain, daily: followersDaily, bestDay, rows: followerRows },
    views: {
      total: viewsTotal,
      prevTotal: prevViews,
      pct: viewsPct,
      daily: viewsDaily,
      dailyNetworks: Array.from(dailyNetworks),
      rows: viewRows,
      notes
    },
    interactions: {
      total: it.total,
      prevTotal: pit?.total ?? null,
      pct: pct(it.total, pit?.total ?? null),
      likes: it.likes,
      comments: it.comments,
      shares: it.shares,
      saves: it.saves,
      rate: it.rate,
      prevRate: pit?.rate ?? null,
      note
    },
    publications: {
      count: pub.count,
      prevCount: hasPrevPub ? prevPub.count : null,
      online: pub.online,
      videos: pub.videos,
      photos: pub.photos,
      others: pub.others,
      activeDays: pub.activeDays,
      prevActiveDays: hasPrevPub ? prevPub.activeDays.length : null,
      perNetwork: Array.from(pub.perNetwork)
        .map(([network, count]) => ({ network, count }))
        .sort((a, b) => b.count - a.count),
      viaNebula: pub.viaNebula
    },
    top,
    insights,
    community: input.community,
    bio: input.bio,
    reussites: input.reussites,
    nextMonth: { key: next, title: monthTitle(next), scheduled: scheduled.length, days: scheduledDays, daysInMonth: daysInMonth(next), missing, suggestion },
    upsell: input.upsell
  };
}
