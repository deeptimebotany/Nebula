// Mesures des étoiles de la constellation (Réussites v2, lot B) — serveur
// uniquement. Toujours des données réelles : publications en ligne,
// relevés de statistiques, réponses repérées sur les commentaires,
// Communauté, bilans de la semaine, page bio. Les étoiles elles-mêmes et
// leurs objectifs sont dans skills.ts.
import { prisma } from "@/lib/prisma";
import { ownedBy } from "@/lib/brand-access";
import { weeklyMissionsDb } from "@/lib/prisma-extra";
import { MIN_SNAPSHOTS_FOR_SLOT, bestHourOf, hourGap, wallHour, type HourSnapshot } from "@/lib/best-hour";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type { Metrics } from "./engine";
import { weekIndexOf } from "./periods";
import type { PublishedPost } from "./posts";
import type { SkillMetrics } from "./skills";
import { bioReady } from "./weekly";

const DAY = 86_400_000;
const MIN_REPLY_CHARS = 20;
/** Fenêtre du test de créneaux (Stratégie ★4). */
const SLOT_TEST_DAYS = 30;
/** Matin : avant 12 h ; soir : à partir de 18 h (heure de la marque). */
const MORNING_END = 12;
const EVENING_START = 18;

/** Plus longue suite de semaines consécutives dans un ensemble d'index de semaine. */
export function longestRun(weeks: Iterable<number>): number {
  const sorted = Array.from(new Set(weeks)).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of sorted) {
    run = prev !== null && w === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return best;
}

interface ConnectionSlots {
  id: string;
  network: string;
  brand: { timezone: string | null } | null;
  analytics: HourSnapshot[];
}

/**
 * Publications mises en ligne à l'heure du meilleur créneau de leur compte
 * (à une heure près), créneau calculé comme sur la Vue d'ensemble.
 */
export function bestSlotCount(posts: PublishedPost[], connections: ConnectionSlots[]): number {
  const best = new Map<string, { hour: number; tz: string }>();
  for (const c of connections) {
    if (c.analytics.length < MIN_SNAPSHOTS_FOR_SLOT) continue;
    const tz = c.brand?.timezone || DEFAULT_TIMEZONE;
    const b = bestHourOf(c.analytics, tz);
    if (b) best.set(c.id, { hour: b.hour, tz });
  }
  let n = 0;
  for (const p of posts) {
    if (p.targets.some((t) => {
      const b = best.get(t.connectionId);
      return b ? hourGap(wallHour(t.at, b.tz), b.hour) <= 1 : false;
    })) n++;
  }
  return n;
}

/**
 * Test de créneaux (Stratégie ★4) : sur le réseau le plus avancé, nombre de
 * publications du matin et du soir des 30 derniers jours.
 */
export function slotTest(posts: PublishedPost[], tzByConnection: Map<string, string>, now: Date): { morning: number; evening: number } {
  const since = now.getTime() - SLOT_TEST_DAYS * DAY;
  const byNetwork = new Map<string, { morning: Set<string>; evening: Set<string> }>();
  for (const p of posts) {
    for (const t of p.targets) {
      if (t.at.getTime() < since || t.at.getTime() > now.getTime()) continue;
      const h = wallHour(t.at, tzByConnection.get(t.connectionId) ?? DEFAULT_TIMEZONE);
      const slot = h < MORNING_END ? "morning" : h >= EVENING_START ? "evening" : null;
      if (!slot) continue;
      const entry = byNetwork.get(t.network) ?? { morning: new Set<string>(), evening: new Set<string>() };
      entry[slot].add(p.id);
      byNetwork.set(t.network, entry);
    }
  }
  let best = { morning: 0, evening: 0 };
  for (const e of Array.from(byNetwork.values())) {
    const cand = { morning: e.morning.size, evening: e.evening.size };
    const score = (x: typeof best) => Math.min(x.morning, 2) + Math.min(x.evening, 2);
    if (score(cand) > score(best) || (score(cand) === score(best) && cand.morning + cand.evening > best.morning + best.evening)) best = cand;
  }
  return best;
}

export async function computeSkillMetrics(userId: string, posts: PublishedPost[], now: Date, base: Metrics): Promise<SkillMetrics> {
  const [imported, connections, anySnapshot, commentReplies, threads, replies, reviews, bio] = await Promise.all([
    prisma.mediaAsset.count({ where: { importSource: { not: null }, brand: ownedBy(userId) } }),
    prisma.socialConnection.findMany({
      where: { brand: ownedBy(userId) },
      select: {
        id: true,
        network: true,
        brand: { select: { timezone: true } },
        analytics: { select: { capturedAt: true, followersDelta: true, engagementRate: true }, orderBy: { capturedAt: "desc" }, take: 400 }
      }
    }) as unknown as Promise<ConnectionSlots[]>,
    prisma.analyticsSnapshot.findFirst({ where: { connection: { brand: ownedBy(userId) } }, select: { id: true } }),
    prisma.engagementItem.count({ where: { ownerRepliedAt: { not: null }, connection: { brand: ownedBy(userId) } } }),
    prisma.forumThread.count({ where: { authorId: userId } }),
    prisma.forumReply.findMany({
      where: { authorId: userId },
      select: { body: true, thread: { select: { authorId: true } }, _count: { select: { reactions: { where: { userId: { not: userId } } } } } }
    }) as unknown as Promise<{ body: string; thread: { authorId: string }; _count: { reactions: number } }[]>,
    weeklyMissionsDb.findMany({ where: { userId, reviewedAt: { not: null } }, select: { reviewedAt: true } }),
    bioReady(userId)
  ]);

  const videos = posts.filter((p) => p.type === "VIDEO");
  const tzByConnection = new Map(connections.map((c) => [c.id, c.brand?.timezone || DEFAULT_TIMEZONE]));
  const slots = slotTest(posts, tzByConnection, now);
  const helpful = replies.filter((r) => r.thread.authorId !== userId && r.body.trim().length >= MIN_REPLY_CHARS && r._count.reactions > 0).length;
  const reviewWeeks = reviews.filter((r) => r.reviewedAt).map((r) => weekIndexOf(new Date(r.reviewedAt as Date)));

  return {
    scheduledPublished: posts.filter((p) => p.scheduledAhead).length,
    activeWeeks: new Set(posts.map((p) => weekIndexOf(p.firstAt))).size,
    daysPlannedAhead: base.daysPlannedAhead,
    importedMedia: imported,
    verticalVideos: videos.filter((p) => p.vertical).length,
    videoMaxNetworks: Math.max(0, ...videos.map((p) => p.networks.size)),
    youtubeThumbnails: videos.filter((p) => p.youtubeThumbnail).length,
    publishedVideos: videos.length,
    importedVideos: videos.filter((p) => p.imported).length,
    analyticsSynced: anySnapshot ? 1 : 0,
    bestSlotPosts: bestSlotCount(posts, connections),
    bestGain90d: base.bestGain90d,
    maxViews: base.maxViews,
    commentReplies,
    communityMessages: threads + replies.length,
    forumRepliedThreads: base.forumRepliedThreads,
    helpfulReplies: helpful,
    weeklyReviews: reviews.length,
    reviewStreak: longestRun(reviewWeeks),
    bioReady: bio ? 1 : 0,
    slotTestMorning: slots.morning,
    slotTestEvening: slots.evening
  };
}
