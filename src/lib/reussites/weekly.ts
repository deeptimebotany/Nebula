// Missions de la semaine, coffre, série et boucliers (Réussites v2,
// 26/09/2026) — serveur uniquement. Les règles et le catalogue sont dans
// missions.ts et streak.ts (purs, testés à part) ; ici, la lecture des vraies
// données et l'enregistrement, toujours idempotents (contraintes uniques) :
// relancer l'évaluation ne valide jamais deux fois la même mission, n'ouvre
// jamais deux fois un coffre et ne dépense jamais deux fois un bouclier.
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { ownedBy } from "@/lib/brand-access";
import { challengeCompletionDb, reussiteItemDb, weeklyMissionsDb, type WeeklyMissionsRow } from "@/lib/prisma-extra";
import { getUserPlan } from "@/lib/billing/plan";
import { dropboxConfig, gdriveConfig, isCanvaConfigured, isOneDriveConfigured, isUnsplashConfigured } from "@/lib/integrations/config";
import {
  CHEST_BONUS_XP,
  CHEST_XP,
  MAX_SHIELDS,
  MAX_SWAPS,
  chestItemFromRoll,
  findMission,
  habitTargetFor,
  missionCompletionKey,
  pickWeeklyMissions,
  type ChestResult,
  type MissionContext,
  type MissionDef,
  type MissionMetric,
  type MissionSlot
} from "./missions";
import { parisDayKey, parisDayNumber, weekIndexOf, weekOf, weekendOf, type Period } from "./periods";
import { shieldToGrant, shieldsToUse, streakOf, type StreakInfo } from "./streak";
import type { PublishedPost } from "./posts";

const DAY = 86_400_000;
const MIN_REPLY_CHARS = 20;
/** Au plus 2 publications comptées par jour : la qualité avant la quantité. */
const MAX_COUNTED_PER_DAY = 2;
const REUSE_AFTER_MS = 30 * DAY;

// --- Contexte et objectif ------------------------------------------------------

function importSourcesConfigured(): boolean {
  return Boolean(gdriveConfig() || dropboxConfig() || isOneDriveConfigured() || isUnsplashConfigured() || isCanvaConfigured());
}

export async function bioReady(userId: string): Promise<boolean> {
  const pages = (await prisma.linkPage.findMany({
    where: { published: true, brand: ownedBy(userId) },
    select: { _count: { select: { links: { where: { enabled: true } } } } }
  })) as { _count: { links: number } }[];
  return pages.some((p) => p._count.links >= 3);
}

export async function missionContext(userId: string, posts: PublishedPost[], now: Date): Promise<MissionContext> {
  const [connections, bio] = await Promise.all([
    prisma.socialConnection.findMany({ where: { brand: ownedBy(userId) }, select: { network: true } }) as Promise<{ network: string }[]>,
    bioReady(userId)
  ]);
  return {
    networks: connections.map((c) => c.network),
    importSources: importSourcesConfigured(),
    hasOldMedia: posts.some((p) => p.mediaIds.length > 0 && p.firstAt.getTime() < now.getTime() - REUSE_AFTER_MS),
    bioReady: bio
  };
}

/** Publications comptées (au plus 2 par jour, heure de Paris). */
export function cappedCount(list: PublishedPost[]): number {
  const perDay = new Map<string, number>();
  for (const p of list) {
    const k = parisDayKey(p.firstAt);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  let n = 0;
  perDay.forEach((v) => (n += Math.min(MAX_COUNTED_PER_DAY, v)));
  return n;
}

/** Publications comptées des 4 semaines terminées avant celle-ci, de la plus ancienne à la plus récente. */
export function lastWeeksCounts(posts: PublishedPost[], week: Period): number[] {
  const out: number[] = [];
  for (let i = 4; i >= 1; i--) {
    const idx = week.index - i;
    out.push(cappedCount(posts.filter((p) => weekIndexOf(p.firstAt) === idx)));
  }
  return out;
}

/** Missions de la semaine du compte, créées à la première évaluation de la semaine. */
export async function ensureWeeklyMissions(userId: string, week: Period, posts: PublishedPost[], now: Date): Promise<WeeklyMissionsRow> {
  const existing = await weeklyMissionsDb.findUnique({ where: { userId_week: { userId, week: week.id } } });
  if (existing) return existing;
  const [ctx, plan, previous] = await Promise.all([
    missionContext(userId, posts, now),
    getUserPlan(userId)
      .then((p) => p.plan as string)
      .catch(() => "FREE"),
    weeklyMissionsDb.findFirst({ where: { userId, week: { not: week.id } }, orderBy: { createdAt: "desc" } })
  ]);
  const { target } = habitTargetFor(lastWeeksCounts(posts, week), plan);
  const pick = pickWeeklyMissions({
    userId,
    weekId: week.id,
    weekIndex: week.index,
    ctx,
    habitTarget: target,
    daysLeft: 7 - (parisDayNumber(now) - parisDayNumber(new Date(week.start.getTime() + 3_600_000))),
    previousProgressKey: previous?.progressKey,
    previousMysteryKey: previous?.mysteryKey
  });
  try {
    return await weeklyMissionsDb.create({ data: { userId, week: week.id, ...pick } });
  } catch {
    // Création concurrente (deux évaluations en même temps) : on relit.
    const again = await weeklyMissionsDb.findUnique({ where: { userId_week: { userId, week: week.id } } });
    if (again) return again;
    throw new Error("missions de la semaine introuvables");
  }
}

// --- Mesures de la semaine -------------------------------------------------------

export type MissionValues = Record<MissionMetric, number>;

export async function missionValues(userId: string, posts: PublishedPost[], week: Period, now: Date): Promise<MissionValues> {
  const inWeek = posts.filter((p) => p.firstAt >= week.start && p.firstAt < week.end);
  const earliest = new Map<string, number>();
  for (const p of posts) {
    for (const id of p.mediaIds) {
      const prev = earliest.get(id);
      if (prev === undefined || p.firstAt.getTime() < prev) earliest.set(id, p.firstAt.getTime());
    }
  }
  const weekend = weekendOf(week);
  const today = parisDayNumber(now);
  const [created, upcoming, replies, shared, bio] = await Promise.all([
    prisma.post.findMany({
      where: {
        createdById: userId,
        createdAt: { gte: week.start, lt: week.end },
        status: { in: ["SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIAL"] },
        scheduledAt: { not: null }
      },
      select: { createdAt: true, scheduledAt: true }
    }) as Promise<{ createdAt: Date; scheduledAt: Date | null }[]>,
    prisma.post.findMany({
      where: { createdById: userId, status: "SCHEDULED", scheduledAt: { gt: now, lt: new Date(now.getTime() + 4 * DAY) } },
      select: { scheduledAt: true }
    }) as Promise<{ scheduledAt: Date | null }[]>,
    prisma.forumReply.findMany({
      where: { authorId: userId, createdAt: { gte: week.start, lt: week.end }, thread: { authorId: { not: userId } } },
      select: { body: true }
    }) as Promise<{ body: string }[]>,
    prisma.sharedVideo.count({ where: { authorId: userId, createdAt: { gte: week.start, lt: week.end } } }),
    bioReady(userId)
  ]);
  let plannedAhead = 0;
  let weekendScheduled = 0;
  for (const p of created) {
    if (!p.scheduledAt) continue;
    const lead = p.scheduledAt.getTime() - p.createdAt.getTime();
    if (lead >= DAY) plannedAhead++;
    if (p.scheduledAt >= weekend.start && p.scheduledAt < weekend.end && lead >= 3_600_000) weekendScheduled++;
  }
  const nextDays = new Set<number>();
  for (const u of upcoming) {
    if (!u.scheduledAt) continue;
    const n = parisDayNumber(u.scheduledAt);
    if (n >= today && n < today + 3) nextDays.add(n);
  }
  return {
    posts: cappedCount(inWeek),
    days: new Set(inWeek.map((p) => parisDayKey(p.firstAt))).size,
    earlyPost: inWeek.some((p) => p.firstAt.getTime() < week.start.getTime() + 2 * DAY) ? 1 : 0,
    videos: cappedCount(inWeek.filter((p) => p.type === "VIDEO")),
    photos: cappedCount(inWeek.filter((p) => p.type === "IMAGE")),
    multi2: inWeek.filter((p) => p.networks.size >= 2).length,
    multi3: inWeek.filter((p) => p.networks.size >= 3).length,
    plannedAhead,
    weekendScheduled,
    next3Days: nextDays.size,
    importedPosts: inWeek.filter((p) => p.imported).length,
    reusedPosts: inWeek.filter((p) => p.mediaIds.some((id) => (earliest.get(id) ?? Infinity) <= p.firstAt.getTime() - REUSE_AFTER_MS)).length,
    firstComments: inWeek.filter((p) => p.hasFirstComment).length,
    communityReplies: replies.filter((r) => r.body.trim().length >= MIN_REPLY_CHARS).length,
    sharedVideos: shared,
    bioReady: bio ? 1 : 0
  };
}

// --- Évaluation des missions ---------------------------------------------------------

export interface MissionState {
  slot: MissionSlot;
  key: string;
  title: string;
  description: string;
  skill: string;
  target: number;
  value: number;
  xp: number;
  done: boolean;
  /** Mission mystère : false tant qu'elle n'est pas révélée (rien n'en est montré). */
  revealed: boolean;
  href: string;
  action: string;
}

export interface WeekMissions {
  week: Period;
  row: WeeklyMissionsRow;
  missions: MissionState[];
  doneCount: number;
  chest: { ready: boolean; opened: boolean; item: string | null };
}

export interface FreshMission {
  slot: MissionSlot;
  title: string;
  xp: number;
}

/** Jeudi 00:00 (heure de Paris) : la mission mystère se révèle d'elle-même. */
export function revealTime(week: Period): Date {
  // Lundi → jeudi : aucun changement d'heure possible (ils ont lieu le dimanche).
  return new Date(week.start.getTime() + 3 * DAY);
}

function stateOf(slot: MissionSlot, def: MissionDef, target: number, value: number, done: boolean, revealed: boolean): MissionState {
  return {
    slot,
    key: def.key,
    title: def.title(target),
    description: def.description,
    skill: def.skill,
    target,
    value: Math.min(value, target),
    xp: def.xp,
    done,
    revealed,
    href: def.href,
    action: def.action
  };
}

async function tryComplete(userId: string, week: Period, slot: MissionSlot, xp: number, celebrated: boolean): Promise<boolean> {
  try {
    await challengeCompletionDb.create({
      data: { userId, period: week.id, challengeKey: missionCompletionKey(slot), kind: "MISSION", xp, celebratedAt: celebrated ? new Date() : null }
    });
    return true;
  } catch {
    return false; // déjà validée (évaluation concurrente)
  }
}

/**
 * Missions de la semaine : crée la semaine si besoin, mesure, valide ce qui
 * est atteint (record: true) et révèle la mission mystère au bon moment.
 */
export async function evaluateWeekMissions(
  userId: string,
  posts: PublishedPost[],
  now: Date,
  opts: { record: boolean; celebrated?: boolean }
): Promise<{ state: WeekMissions; fresh: FreshMission[]; revealedNow: boolean }> {
  const week = weekOf(now);
  const row = await ensureWeeklyMissions(userId, week, posts, now);
  const [values, doneRows] = await Promise.all([
    missionValues(userId, posts, week, now),
    challengeCompletionDb.findMany({ where: { userId, period: week.id, kind: "MISSION" } })
  ]);
  const done = new Set(doneRows.map((r) => r.challengeKey));
  const fresh: FreshMission[] = [];
  const habit = findMission(row.habitKey) ?? findMission("habit-posts")!;
  const progress = findMission(row.progressKey) ?? findMission("prog-plan3")!;
  const mystery = findMission(row.mysteryKey) ?? findMission("mys-weekend")!;

  const check = async (slot: MissionSlot, def: MissionDef, target: number) => {
    const key = missionCompletionKey(slot);
    if (done.has(key) || values[def.metric] < target || !opts.record) return;
    if (await tryComplete(userId, week, slot, def.xp, Boolean(opts.celebrated))) {
      done.add(key);
      fresh.push({ slot, title: def.title(target), xp: def.xp });
    }
  };
  await check("habit", habit, row.habitTarget);
  await check("progress", progress, progress.target);

  let revealedAt = row.revealedAt;
  let revealedNow = false;
  const bothDone = done.has(missionCompletionKey("habit")) && done.has(missionCompletionKey("progress"));
  if (!revealedAt && (bothDone || now >= revealTime(week)) && opts.record) {
    const claimed = await weeklyMissionsDb.updateMany({ where: { id: row.id, revealedAt: null }, data: { revealedAt: now } });
    revealedAt = now;
    revealedNow = claimed.count > 0;
  }
  const revealed = Boolean(revealedAt) || bothDone || now >= revealTime(week);
  if (revealed) await check("mystery", mystery, mystery.target);

  const missions = [
    stateOf("habit", habit, row.habitTarget, values[habit.metric], done.has(missionCompletionKey("habit")), true),
    stateOf("progress", progress, progress.target, values[progress.metric], done.has(missionCompletionKey("progress")), true),
    stateOf("mystery", mystery, mystery.target, values[mystery.metric], done.has(missionCompletionKey("mystery")), revealed)
  ];
  const doneCount = missions.filter((m) => m.done).length;
  return {
    state: {
      week,
      row: { ...row, revealedAt },
      missions,
      doneCount,
      chest: { ready: doneCount === 3, opened: Boolean(row.chestOpenedAt), item: row.chestItem }
    },
    fresh,
    revealedNow
  };
}

/** Propositions de la mission Progression, avec leur titre (page Réussites). */
export function progressChoices(row: WeeklyMissionsRow): { key: string; title: string; xp: number; skill: string; chosen: boolean }[] {
  return row.choices
    .map((key) => findMission(key))
    .filter((m): m is MissionDef => Boolean(m))
    .map((m) => ({ key: m.key, title: m.title(m.target), xp: m.xp, skill: m.skill, chosen: m.key === row.progressKey }));
}

// --- Choix de la mission Progression ----------------------------------------------------

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };

export async function chooseProgress(userId: string, key: string, now: Date = new Date()): Promise<ActionResult> {
  const week = weekOf(now);
  const row = await weeklyMissionsDb.findUnique({ where: { userId_week: { userId, week: week.id } } });
  if (!row) return { ok: false, status: 404, error: "Ouvrez la page Réussites pour recevoir vos missions de la semaine." };
  if (!row.choices.includes(key)) return { ok: false, status: 400, error: "Cette mission ne fait pas partie de vos propositions." };
  if (row.progressKey === key) return { ok: true };
  const completed = await challengeCompletionDb.findFirst({ where: { userId, period: week.id, challengeKey: missionCompletionKey("progress") } });
  if (completed) return { ok: false, status: 409, error: "Mission déjà réussie cette semaine : bravo !" };
  if (row.swapsUsed >= MAX_SWAPS) return { ok: false, status: 409, error: "Vous avez déjà changé de mission cette semaine." };
  const changed = await weeklyMissionsDb.updateMany({ where: { id: row.id, swapsUsed: row.swapsUsed }, data: { progressKey: key, swapsUsed: row.swapsUsed + 1 } });
  if (changed.count === 0) return { ok: false, status: 409, error: "Vous avez déjà changé de mission cette semaine." };
  return { ok: true };
}

// --- Objets : boucliers et fragments ---------------------------------------------------------

export async function itemBalances(userId: string): Promise<{ shield: number; fragment: number }> {
  const rows = await reussiteItemDb.findMany({ where: { userId }, select: { item: true, qty: true } });
  const out = { shield: 0, fragment: 0 };
  for (const r of rows) if (r.item === "shield" || r.item === "fragment") out[r.item] += r.qty;
  return { shield: Math.max(0, out.shield), fragment: Math.max(0, out.fragment) };
}

// --- Coffre --------------------------------------------------------------------------------

/**
 * Ouvre le coffre d'une semaine dont les 3 missions sont réussies. Un coffre
 * n'expire jamais ; il ne s'ouvre qu'une fois (réservation atomique).
 * Toujours 40 XP, plus un objet tiré au sort (chances : CHEST_TABLE).
 */
export async function openChest(userId: string, weekId: string, now: Date = new Date()): Promise<ActionResult<{ item: ChestResult; xp: number }>> {
  if (!/^\d{4}-W\d{2}$/.test(weekId)) return { ok: false, status: 400, error: "Semaine inconnue." };
  const row = await weeklyMissionsDb.findUnique({ where: { userId_week: { userId, week: weekId } } });
  if (!row) return { ok: false, status: 404, error: "Aucune mission pour cette semaine." };
  if (row.chestOpenedAt) return { ok: false, status: 409, error: "Ce coffre est déjà ouvert." };
  const done = await challengeCompletionDb.count({ where: { userId, period: weekId, kind: "MISSION" } });
  if (done < 3) return { ok: false, status: 409, error: "Réussissez les 3 missions de la semaine pour ouvrir le coffre." };

  let item: ChestResult = chestItemFromRoll(randomInt(100));
  if (item === "shield" && (await itemBalances(userId)).shield >= MAX_SHIELDS) item = "shield-converted";
  const claimed = await weeklyMissionsDb.updateMany({ where: { id: row.id, chestOpenedAt: null }, data: { chestOpenedAt: now, chestItem: item } });
  if (claimed.count === 0) return { ok: false, status: 409, error: "Ce coffre est déjà ouvert." };

  const xp = CHEST_XP + (item === "bonus" || item === "shield-converted" ? CHEST_BONUS_XP : 0);
  await challengeCompletionDb
    .create({ data: { userId, period: weekId, challengeKey: "chest", kind: "CHEST", xp, celebratedAt: now } })
    .catch(() => undefined);
  // Bouclier, fragment ou ticket « vidéo à la une » (lot C) : un objet en réserve.
  if (item === "shield" || item === "fragment" || item === "feature") {
    await reussiteItemDb.create({ data: { userId, item, qty: 1, reason: `chest:${weekId}` } }).catch(() => undefined);
  }
  return { ok: true, item, xp };
}

/** Coffres des semaines passées, réussis mais pas encore ouverts (ils n'expirent jamais). */
export async function pendingChests(userId: string, currentWeekId: string): Promise<string[]> {
  const rows = await weeklyMissionsDb.findMany({ where: { userId, chestOpenedAt: null, week: { not: currentWeekId } }, orderBy: { week: "desc" }, take: 8 });
  const out: string[] = [];
  for (const r of rows) {
    const done = await challengeCompletionDb.count({ where: { userId, period: r.week, kind: "MISSION" } });
    if (done >= 3) out.push(r.week);
  }
  return out;
}

// --- Série et boucliers ------------------------------------------------------------------------

export interface StreakResult {
  streak: StreakInfo;
  shields: number;
  fragments: number;
  /** Semaines protégées à l'instant (notification). */
  usedNow: number[];
  grantedNow: boolean;
}

/**
 * Série de semaines : dépense automatiquement les boucliers qui sauvent la
 * série, en gagne un toutes les 4 semaines (2 au maximum en réserve).
 */
export async function applyStreakShields(userId: string, posts: PublishedPost[], now: Date): Promise<StreakResult> {
  const currentWeek = weekIndexOf(now);
  const rows = await reussiteItemDb.findMany({ where: { userId }, select: { item: true, qty: true, reason: true } });
  let shields = 0;
  let fragments = 0;
  const covered = new Set(posts.map((p) => weekIndexOf(p.firstAt)));
  for (const r of rows) {
    if (r.item === "shield") shields += r.qty;
    if (r.item === "fragment") fragments += r.qty;
    if (r.reason.startsWith("protect:")) covered.add(Number(r.reason.slice("protect:".length)));
  }
  const usedNow: number[] = [];
  for (const w of shieldsToUse(covered, currentWeek, shields)) {
    try {
      await reussiteItemDb.create({ data: { userId, item: "shield", qty: -1, reason: `protect:${w}` } });
      covered.add(w);
      shields -= 1;
      usedNow.push(w);
    } catch {
      covered.add(w); // déjà protégée par une évaluation concurrente
    }
  }
  let grantedNow = false;
  const grant = shieldToGrant(covered, currentWeek, shields, MAX_SHIELDS);
  if (grant) {
    try {
      await reussiteItemDb.create({ data: { userId, item: "shield", qty: 1, reason: grant } });
      shields += 1;
      grantedNow = true;
    } catch {
      // déjà accordé
    }
  }
  return { streak: streakOf(covered, currentWeek), shields: Math.max(0, shields), fragments: Math.max(0, fragments), usedNow, grantedNow };
}

/** Série en lecture seule (carte de créateur) : rien n'est dépensé ni accordé. */
export async function streakSnapshot(userId: string, posts: PublishedPost[], now: Date = new Date()): Promise<StreakInfo> {
  const rows = await reussiteItemDb.findMany({ where: { userId, reason: { startsWith: "protect:" } }, select: { reason: true } });
  const covered = new Set(posts.map((p) => weekIndexOf(p.firstAt)));
  for (const r of rows) covered.add(Number(r.reason.slice("protect:".length)));
  return streakOf(covered, weekIndexOf(now));
}
