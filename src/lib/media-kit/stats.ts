// Media kit public (produit n°10) — chiffres du kit, calculés SANS IA et sans
// saisie du créateur : abonnés relevés par la synchro Analytics
// (AnalyticsSnapshot), chiffres par publication relevés par Engagements
// (PostMetric). Fonctions pures (testées sans base) ; la lecture en base est
// dans load.ts.
//
// Règles (affichées sur le kit, sous « D'où viennent ces chiffres ») :
//  - abonnés : dernier relevé non nul du compte ;
//  - évolution : par rapport au relevé d'il y a 30 jours (ou au premier
//    relevé s'il a au moins 14 jours) ;
//  - vues par publication : médiane des 90 derniers jours ;
//  - taux d'engagement : interactions moyennes par publication (j'aime +
//    commentaires + partages) ÷ abonnés, sur 90 jours, comme le calculateur
//    gratuit /outils/taux-engagement ;
//  - 3 publications au moins pour une médiane ou un taux ; les publications
//    de moins de 2 jours sont écartées (leurs chiffres montent encore).
import type { Network } from "@/lib/types";
import { MAX_FEATURED_POSTS, type KitAccount, type KitPost, type KitStats } from "./types";

const DAY = 86_400_000;
const SETTLE_MS = 2 * DAY;
export const KIT_WINDOW_DAYS = 90;
export const KIT_AUTO_POSTS_DAYS = 180;
export const MIN_POSTS_FOR_RATES = 3;

export interface KitConnectionRow {
  id: string;
  network: Network;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  externalAccountId: string;
  status: string;
}

export interface KitSnapshotRow {
  connectionId: string;
  capturedAt: Date;
  followers: number;
}

export interface KitMetricRow {
  id: string;
  connectionId: string;
  network: Network;
  title: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  capturedAt?: Date | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export const interactionsOf = (m: Pick<KitMetricRow, "likes" | "comments" | "shares">) => (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);

const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

/** Réseaux où l'identifiant public est un nom d'utilisateur (@…). */
const USERNAME_NETWORKS: Network[] = ["INSTAGRAM", "TIKTOK", "THREADS", "BLUESKY", "PINTEREST"];

function cleanHandle(handle: string | null): string | null {
  const h = (handle ?? "").trim().replace(/^@+/, "");
  return /^[\w.-]{1,60}$/.test(h) ? h : null;
}

/** @nom affiché sous le compte (réseaux à nom d'utilisateur seulement). */
export function displayHandle(network: Network, handle: string | null): string | null {
  const h = cleanHandle(handle);
  return h && USERNAME_NETWORKS.includes(network) ? `@${h}` : null;
}

/** Lien public vers le compte, construit seulement quand l'identifiant a la bonne forme. */
export function profileUrl(network: Network, externalAccountId: string, handle: string | null): string | null {
  const h = cleanHandle(handle);
  switch (network) {
    case "INSTAGRAM":
      return h ? `https://www.instagram.com/${h}/` : null;
    case "TIKTOK":
      return h ? `https://www.tiktok.com/@${h}` : null;
    case "THREADS":
      return h ? `https://www.threads.net/@${h}` : null;
    case "BLUESKY":
      return h ? `https://bsky.app/profile/${h}` : null;
    case "PINTEREST":
      return h ? `https://www.pinterest.com/${h}/` : null;
    case "YOUTUBE":
      return /^UC[\w-]{22}$/.test(externalAccountId) ? `https://www.youtube.com/channel/${externalAccountId}` : null;
    case "FACEBOOK":
      return /^\d{5,25}$/.test(externalAccountId) ? `https://www.facebook.com/${externalAccountId}` : null;
    default:
      return null;
  }
}

function toPost(m: KitMetricRow): KitPost {
  return {
    id: m.id,
    network: m.network,
    title: m.title?.replace(/\s+/g, " ").trim().slice(0, 140) || "Publication sans titre",
    permalink: m.permalink && /^https:\/\//.test(m.permalink) ? m.permalink : null,
    thumbnailUrl: m.thumbnailUrl && /^https:\/\//.test(m.thumbnailUrl) ? m.thumbnailUrl : null,
    publishedAt: m.publishedAt ? new Date(m.publishedAt).toISOString() : null,
    views: m.views,
    interactions: interactionsOf(m)
  };
}

/** Le compte parle-t-il plutôt en vues (YouTube, TikTok…) qu'en interactions ? */
function usesViews(rows: KitMetricRow[]): boolean {
  if (rows.length === 0) return false;
  return rows.filter((r) => r.views !== null && r.views > 0).length >= Math.ceil(rows.length / 2);
}

function accountStats(conn: KitConnectionRow, snaps: KitSnapshotRow[], rows: KitMetricRow[], now: number): KitAccount & { meanInteractions: number | null } {
  const valid = snaps.filter((s) => s.followers > 0).sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  const latest = valid.at(-1) ?? null;
  const followers = latest ? latest.followers : null;

  let growth: KitAccount["growth"] = null;
  if (latest) {
    const latestAt = new Date(latest.capturedAt).getTime();
    const cutoff = latestAt - 30 * DAY;
    const before = valid.filter((s) => new Date(s.capturedAt).getTime() <= cutoff);
    let base = before.at(-1) ?? null;
    if (!base && valid.length > 1 && latestAt - new Date(valid[0].capturedAt).getTime() >= 14 * DAY) base = valid[0];
    if (base) {
      const delta = latest.followers - base.followers;
      growth = {
        delta,
        pct: base.followers > 0 ? round((delta / base.followers) * 100, 1) : null,
        days: Math.round((latestAt - new Date(base.capturedAt).getTime()) / DAY)
      };
    }
  }

  const since = now - KIT_WINDOW_DAYS * DAY;
  const inWindow = rows.filter((m) => m.publishedAt && new Date(m.publishedAt).getTime() >= since);
  const settled = inWindow.filter((m) => now - new Date(m.publishedAt as Date).getTime() >= SETTLE_MS);
  const views = settled.map((m) => m.views).filter((v): v is number => v !== null);
  const medianViews = views.length >= MIN_POSTS_FOR_RATES ? Math.round(median(views) as number) : null;
  const meanInteractions = settled.length >= MIN_POSTS_FOR_RATES ? settled.reduce((s, m) => s + interactionsOf(m), 0) / settled.length : null;
  const engagementRate = meanInteractions !== null && followers ? round((meanInteractions / followers) * 100, 2) : null;

  return {
    id: conn.id,
    network: conn.network,
    name: conn.displayName.trim() || conn.network,
    handle: displayHandle(conn.network, conn.handle),
    avatarUrl: conn.avatarUrl && /^https:\/\//.test(conn.avatarUrl) ? conn.avatarUrl : null,
    profileUrl: profileUrl(conn.network, conn.externalAccountId, conn.handle),
    followers,
    growth,
    medianViews,
    engagementRate,
    // Pas de relevé de publications du tout : on ne sait pas (≠ zéro publication).
    postsPerMonth: rows.length > 0 ? round(inWindow.length / (KIT_WINDOW_DAYS / 30), 1) : null,
    measuredPosts: settled.length,
    capturedAt: latest ? new Date(latest.capturedAt).toISOString() : null,
    meanInteractions: engagementRate !== null ? meanInteractions : null
  };
}

function publicAccount(a: KitAccount & { meanInteractions: number | null }): KitAccount {
  const copy: KitAccount & { meanInteractions?: number | null } = { ...a };
  delete copy.meanInteractions;
  return copy;
}

export function computeKitStats(input: {
  connections: KitConnectionRow[];
  snapshots: KitSnapshotRow[];
  metrics: KitMetricRow[];
  hiddenConnectionIds: string[];
  featuredPostIds: string[];
  now: Date;
}): KitStats {
  const now = input.now.getTime();
  const hidden = new Set(input.hiddenConnectionIds);
  const shown = input.connections.filter((c) => !hidden.has(c.id) && c.status !== "DISCONNECTED");
  const shownIds = new Set(shown.map((c) => c.id));
  const metrics = input.metrics.filter((m) => shownIds.has(m.connectionId));

  const computed = shown
    .map((c) =>
      accountStats(
        c,
        input.snapshots.filter((s) => s.connectionId === c.id),
        metrics.filter((m) => m.connectionId === c.id),
        now
      )
    )
    .sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1));

  const withFollowers = computed.filter((a) => a.followers !== null);
  const rated = computed.filter((a) => a.meanInteractions !== null && a.followers);
  const since = now - KIT_WINDOW_DAYS * DAY;
  const recent = metrics.filter((m) => m.publishedAt && new Date(m.publishedAt).getTime() >= since);
  const recentViews = recent.map((m) => m.views).filter((v): v is number => v !== null);
  const perMonth = computed.map((a) => a.postsPerMonth).filter((v): v is number => v !== null);

  const totals = {
    audience: withFollowers.length ? withFollowers.reduce((s, a) => s + (a.followers as number), 0) : null,
    views90: recentViews.length ? recentViews.reduce((s, v) => s + v, 0) : null,
    engagementRate: rated.length
      ? round((rated.reduce((s, a) => s + (a.meanInteractions as number), 0) / rated.reduce((s, a) => s + (a.followers as number), 0)) * 100, 2)
      : null,
    postsPerMonth: perMonth.length ? round(perMonth.reduce((s, v) => s + v, 0), 1) : null,
    accounts: computed.length
  };

  // Publications mises en avant : le choix du créateur (dans son ordre), sinon
  // les meilleures de chaque compte, à tour de rôle.
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const chosen = input.featuredPostIds.map((id) => byId.get(id)).filter((m): m is KitMetricRow => Boolean(m)).slice(0, MAX_FEATURED_POSTS);
  let posts: KitPost[];
  if (chosen.length) {
    posts = chosen.map(toPost);
  } else {
    const autoSince = now - KIT_AUTO_POSTS_DAYS * DAY;
    const queues = computed.map((a) => {
      const rows = metrics.filter((m) => m.connectionId === a.id && m.publishedAt && new Date(m.publishedAt).getTime() >= autoSince && now - new Date(m.publishedAt).getTime() >= SETTLE_MS);
      const byViews = usesViews(rows);
      return rows.sort((x, y) => (byViews ? (y.views ?? -1) - (x.views ?? -1) : 0) || interactionsOf(y) - interactionsOf(x));
    });
    posts = [];
    for (let turn = 0; posts.length < MAX_FEATURED_POSTS && queues.some((q) => q.length > turn); turn++) {
      for (const q of queues) {
        if (q[turn] && posts.length < MAX_FEATURED_POSTS) posts.push(toPost(q[turn]));
      }
    }
  }

  const dates = [
    ...computed.map((a) => a.capturedAt).filter((d): d is string => Boolean(d)),
    ...metrics.map((m) => (m.capturedAt ? new Date(m.capturedAt).toISOString() : null)).filter((d): d is string => Boolean(d))
  ].sort();

  return {
    accounts: computed.map(publicAccount),
    totals,
    posts,
    postsChosen: chosen.length > 0,
    updatedAt: dates.at(-1) ?? null
  };
}
