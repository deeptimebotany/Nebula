// Moteur des Réussites (25/09/2026) — serveur uniquement.
//
// evaluateReussites(userId) mesure l'activité RÉELLE du compte (publications
// réellement en ligne, statistiques des comptes connectés, forum, page bio,
// parrainage), débloque les accomplissements atteints et les défis réussis,
// recalcule l'XP et le niveau, accorde les récompenses et prévient dans la
// cloche. Idempotent : relancer l'évaluation ne débloque jamais deux fois la
// même chose (contraintes uniques en base).
//
// Appelée après une publication (publish.ts), une création de publication,
// un message dans la Communauté, une actualisation des statistiques, la
// publication de la page bio, un palier de parrainage, et à l'ouverture de
// Réussites ou du tableau de bord (au plus une fois toutes les 5 minutes).
//
// Première évaluation d'un compte : tout ce que l'activité passée a déjà
// mérité est débloqué d'un coup, sans avalanche de notifications (une seule
// notification récapitulative, et seule la carte du niveau atteint s'affiche).
import { prisma } from "@/lib/prisma";
import { ownedBy } from "@/lib/brand-access";
import {
  achievementUnlockDb,
  challengeCompletionDb,
  userReussitesDb,
  type AchievementUnlockRow,
  type ChallengeCompletionRow
} from "@/lib/prisma-extra";
import { notify, notifyOnce } from "@/lib/notifications";
import { markEasterEggFound } from "@/lib/easter-eggs/server";
import { getAudienceTotals } from "@/lib/easter-eggs/audience";
import { confirmedReferralCount } from "@/lib/billing/rewards";
import {
  ALL_TIERS,
  EGG_XP,
  LINKED_EGG_KEYS,
  LEVELS,
  REWARDS,
  findChallenge,
  findTier,
  levelFor,
  levelKey,
  monthLabel,
  monthlyChallengeFor,
  tierRewardText,
  weeklyChallengesFor,
  type ChallengeDef,
  type ChallengeMetric,
  type FlatTier,
  type LevelProgress,
  type MetricId
} from "./catalog";
import { monthOf, parisDayKey, parisDayNumber, weekIndexOf, weekOf, weekendOf, type Period } from "./periods";

const DAY = 86_400_000;
const THROTTLE_MS = 5 * 60_000;
const MIN_REPLY_CHARS = 20;
const MIN_VIEWS_FOR_ENGAGEMENT = 200;
const PUBLISHED = "PUBLISHED";

// --- Données brutes -----------------------------------------------------------

interface PublishedPost {
  id: string;
  firstAt: Date;
  networks: Set<string>;
  type: "VIDEO" | "IMAGE" | "TEXT";
  hasFirstComment: boolean;
}

/** Publications de ce compte réellement en ligne (au moins un réseau), éventuellement depuis une date. */
async function publishedPosts(userId: string, since?: Date): Promise<PublishedPost[]> {
  const targets = (await prisma.postTarget.findMany({
    where: { status: PUBLISHED, post: { createdById: userId }, ...(since ? { publishedAt: { gte: since } } : {}) },
    select: {
      postId: true,
      network: true,
      publishedAt: true,
      post: {
        select: {
          createdAt: true,
          firstComment: true,
          media: { select: { mediaAsset: { select: { type: true } } }, orderBy: { order: "asc" }, take: 1 }
        }
      }
    }
  })) as {
    postId: string;
    network: string;
    publishedAt: Date | null;
    post: { createdAt: Date; firstComment: string | null; media: { mediaAsset: { type: string } }[] };
  }[];
  const byPost = new Map<string, PublishedPost>();
  for (const t of targets) {
    const at = t.publishedAt ?? t.post.createdAt;
    const existing = byPost.get(t.postId);
    if (existing) {
      existing.networks.add(t.network);
      if (at < existing.firstAt) existing.firstAt = at;
      continue;
    }
    const mediaType = t.post.media[0]?.mediaAsset.type;
    byPost.set(t.postId, {
      id: t.postId,
      firstAt: at,
      networks: new Set([t.network]),
      type: mediaType === "VIDEO" ? "VIDEO" : mediaType === "IMAGE" ? "IMAGE" : "TEXT",
      hasFirstComment: Boolean(t.post.firstComment?.trim())
    });
  }
  return Array.from(byPost.values());
}

/** Meilleure série de semaines consécutives avec au moins une publication. */
function bestWeekStreak(posts: PublishedPost[]): number {
  const weeks = Array.from(new Set(posts.map((p) => weekIndexOf(p.firstAt)))).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of weeks) {
    run = prev !== null && w === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return best;
}

function bestMonthPosts(posts: PublishedPost[]): number {
  const counts = new Map<string, number>();
  for (const p of posts) {
    const id = monthOf(p.firstAt).id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Math.max(0, ...Array.from(counts.values()));
}

/** Nombre des 7 prochains jours (aujourd'hui compris) ayant une publication programmée. */
async function daysPlannedAhead(userId: string, now: Date): Promise<number> {
  const rows = (await prisma.post.findMany({
    where: { createdById: userId, status: "SCHEDULED", scheduledAt: { gt: now, lt: new Date(now.getTime() + 8 * DAY) } },
    select: { scheduledAt: true }
  })) as { scheduledAt: Date | null }[];
  const today = parisDayNumber(now);
  const days = new Set<number>();
  for (const r of rows) {
    if (!r.scheduledAt) continue;
    const n = parisDayNumber(r.scheduledAt);
    if (n >= today && n < today + 7) days.add(n);
  }
  return days.size;
}

/** Meilleure progression d'abonnés sur 90 jours glissants, sur un même compte. */
async function bestGain90d(userId: string): Promise<number> {
  const snaps = (await prisma.analyticsSnapshot.findMany({
    where: { connection: { brand: ownedBy(userId) } },
    orderBy: [{ connectionId: "asc" }, { capturedAt: "asc" }],
    select: { connectionId: true, capturedAt: true, followers: true }
  })) as { connectionId: string; capturedAt: Date; followers: number }[];
  let best = 0;
  let i = 0;
  while (i < snaps.length) {
    let j = i;
    while (j < snaps.length && snaps[j].connectionId === snaps[i].connectionId) j++;
    // Minimum glissant (file monotone) sur les 90 jours précédant chaque relevé.
    const deque: number[] = [];
    for (let k = i; k < j; k++) {
      const s = snaps[k];
      while (deque.length && snaps[deque[0]].capturedAt.getTime() < s.capturedAt.getTime() - 90 * DAY) deque.shift();
      while (deque.length && snaps[deque[deque.length - 1]].followers >= s.followers) deque.pop();
      deque.push(k);
      best = Math.max(best, s.followers - snaps[deque[0]].followers);
    }
    i = j;
  }
  return best;
}

async function postPerformance(userId: string): Promise<{ bestEngagementPct: number; maxViews: number }> {
  const rows = (await prisma.postMetric.findMany({
    where: { connection: { brand: ownedBy(userId) } },
    select: { views: true, likes: true, comments: true, shares: true }
  })) as { views: number | null; likes: number | null; comments: number | null; shares: number | null }[];
  let bestEngagementPct = 0;
  let maxViews = 0;
  for (const r of rows) {
    const views = r.views ?? 0;
    maxViews = Math.max(maxViews, views);
    if (views >= MIN_VIEWS_FOR_ENGAGEMENT) {
      const pct = (((r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0)) / views) * 100;
      bestEngagementPct = Math.max(bestEngagementPct, pct);
    }
  }
  return { bestEngagementPct: Math.round(bestEngagementPct * 10) / 10, maxViews };
}

async function communityStats(userId: string) {
  const [threads, replies, reactionsReceived] = await Promise.all([
    prisma.forumThread.count({ where: { authorId: userId } }),
    prisma.forumReply.findMany({
      where: { authorId: userId, thread: { authorId: { not: userId } } },
      select: { threadId: true, body: true }
    }) as Promise<{ threadId: string; body: string }[]>,
    prisma.communityReaction.count({
      where: { userId: { not: userId }, OR: [{ thread: { authorId: userId } }, { reply: { authorId: userId } }] }
    })
  ]);
  const repliedThreads = new Set(replies.filter((r) => r.body.trim().length >= MIN_REPLY_CHARS).map((r) => r.threadId)).size;
  return { threads, repliedThreads, reactionsReceived };
}

async function bioStats(userId: string) {
  const [published, clicks] = await Promise.all([
    prisma.linkPage.count({ where: { published: true, brand: ownedBy(userId) } }),
    prisma.linkItem.aggregate({ _sum: { clicks: true }, where: { linkPage: { brand: ownedBy(userId) } } }) as Promise<{ _sum: { clicks: number | null } }>
  ]);
  return { published: published > 0 ? 1 : 0, clicks: clicks._sum.clicks ?? 0 };
}

// --- Mesures ------------------------------------------------------------------

export type Metrics = Record<MetricId, number>;

interface Snapshot {
  metrics: Metrics;
  posts: PublishedPost[];
}

async function computeMetrics(userId: string, now: Date): Promise<Snapshot> {
  const [posts, planned, gain, perf, audience, community, bio, referrals, weeklyDone] = await Promise.all([
    publishedPosts(userId),
    daysPlannedAhead(userId, now),
    bestGain90d(userId),
    postPerformance(userId),
    getAudienceTotals(userId),
    communityStats(userId),
    bioStats(userId),
    confirmedReferralCount(userId).catch(() => 0),
    challengeCompletionDb.count({ where: { userId, kind: "WEEKLY" } })
  ]);
  const metrics: Metrics = {
    publishedPosts: posts.length,
    publishedVideos: posts.filter((p) => p.type === "VIDEO").length,
    publishedPhotos: posts.filter((p) => p.type === "IMAGE").length,
    maxNetworksOnePost: Math.max(0, ...posts.map((p) => p.networks.size)),
    bestWeekStreak: bestWeekStreak(posts),
    daysPlannedAhead: planned,
    bestMonthPosts: bestMonthPosts(posts),
    weeklyChallengesDone: weeklyDone,
    bestGain90d: gain,
    followersTotal: audience.followers,
    likesTotal: audience.likes,
    bestEngagementPct: perf.bestEngagementPct,
    maxViews: perf.maxViews,
    forumThreads: community.threads,
    forumRepliedThreads: community.repliedThreads,
    reactionsReceived: community.reactionsReceived,
    confirmedReferrals: referrals,
    bioPublished: bio.published,
    bioClicks: bio.clicks
  };
  return { metrics, posts };
}

// --- Défis ----------------------------------------------------------------------

type ChallengeValues = Record<ChallengeMetric, number>;

async function challengeValues(userId: string, posts: PublishedPost[], period: Period, weekly: boolean): Promise<ChallengeValues> {
  const inPeriod = posts.filter((p) => p.firstAt >= period.start && p.firstAt < period.end);
  const networks = new Set<string>();
  for (const p of inPeriod) p.networks.forEach((n) => networks.add(n));

  let weekendScheduled = 0;
  let plannedAhead = 0;
  let communityReplies = 0;
  if (weekly) {
    const weekend = weekendOf(period);
    const [created, replies] = await Promise.all([
      prisma.post.findMany({
        where: {
          createdById: userId,
          createdAt: { gte: period.start, lt: period.end },
          status: { in: ["SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIAL"] },
          scheduledAt: { not: null }
        },
        select: { createdAt: true, scheduledAt: true }
      }) as Promise<{ createdAt: Date; scheduledAt: Date | null }[]>,
      prisma.forumReply.findMany({
        where: { authorId: userId, createdAt: { gte: period.start, lt: period.end }, thread: { authorId: { not: userId } } },
        select: { body: true }
      }) as Promise<{ body: string }[]>
    ]);
    for (const p of created) {
      if (!p.scheduledAt) continue;
      const lead = p.scheduledAt.getTime() - p.createdAt.getTime();
      if (p.scheduledAt >= weekend.start && p.scheduledAt < weekend.end && lead >= 3_600_000) weekendScheduled++;
      if (lead >= DAY) plannedAhead++;
    }
    communityReplies = replies.filter((r) => r.body.trim().length >= MIN_REPLY_CHARS).length;
  }

  return {
    posts: inPeriod.length,
    videos: inPeriod.filter((p) => p.type === "VIDEO").length,
    photos: inPeriod.filter((p) => p.type === "IMAGE").length,
    multiNetworkPosts: inPeriod.filter((p) => p.networks.size >= 2).length,
    distinctDays: new Set(inPeriod.map((p) => parisDayKey(p.firstAt))).size,
    weekendScheduled,
    plannedAhead,
    communityReplies,
    firstComments: inPeriod.filter((p) => p.hasFirstComment).length,
    distinctNetworks: networks.size
  };
}

export interface ChallengeState {
  def: ChallengeDef;
  value: number;
  done: boolean;
}

/**
 * Défis en cours (semaine et mois), sans rien débloquer : calcul léger pour
 * le tableau de bord quand l'évaluation complète a déjà eu lieu récemment.
 */
export async function currentChallenges(userId: string, now: Date = new Date()): Promise<{ week: Period; month: Period; weekly: ChallengeState[]; monthly: ChallengeState }> {
  const week = weekOf(now);
  const month = monthOf(now);
  const since = week.start < month.start ? week.start : month.start;
  const posts = await publishedPosts(userId, since);
  const [weekValues, monthValues, doneRows] = await Promise.all([
    challengeValues(userId, posts, week, true),
    challengeValues(userId, posts, month, false),
    challengeCompletionDb.findMany({ where: { userId, period: { in: [week.id, month.id] } } })
  ]);
  const done = new Set(doneRows.map((r) => `${r.period}:${r.challengeKey}`));
  const monthlyDef = monthlyChallengeFor(month.index);
  return {
    week,
    month,
    weekly: weeklyChallengesFor(week.index).map((def) => ({ def, value: weekValues[def.metric], done: done.has(`${week.id}:${def.key}`) })),
    monthly: { def: monthlyDef, value: monthValues[monthlyDef.metric], done: done.has(`${month.id}:${monthlyDef.key}`) }
  };
}

// --- XP ------------------------------------------------------------------------

export async function computeXp(userId: string): Promise<number> {
  const [unlocks, challenges, eggs] = await Promise.all([
    achievementUnlockDb.aggregate({ _sum: { xp: true }, where: { userId } }),
    challengeCompletionDb.aggregate({ _sum: { xp: true }, where: { userId } }),
    prisma.easterEggFound.count({ where: { userId, key: { notIn: LINKED_EGG_KEYS } } })
  ]);
  return (unlocks._sum.xp ?? 0) + (challenges._sum.xp ?? 0) + eggs * EGG_XP;
}

// --- Évaluation ------------------------------------------------------------------

export interface FreshItem {
  type: "accomplishment" | "level" | "challenge";
  key: string;
}

export interface EvaluationResult {
  xp: number;
  level: LevelProgress;
  fresh: FreshItem[];
  metrics: Metrics;
  weekly: ChallengeState[];
  monthly: ChallengeState;
  week: Period;
  month: Period;
  unlocks: AchievementUnlockRow[];
  completions: ChallengeCompletionRow[];
}

async function tryCreateUnlock(userId: string, key: string, xp: number, celebrated: boolean): Promise<boolean> {
  try {
    await achievementUnlockDb.create({ data: { userId, key, xp, celebratedAt: celebrated ? new Date() : null } });
    return true;
  } catch {
    return false; // déjà débloqué (évaluation concurrente)
  }
}

async function tryCreateCompletion(userId: string, period: string, def: ChallengeDef, celebrated: boolean): Promise<boolean> {
  try {
    await challengeCompletionDb.create({ data: { userId, period, challengeKey: def.key, kind: def.kind, xp: def.xp, celebratedAt: celebrated ? new Date() : null } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Évalue les Réussites d'un compte. `force: false` (ouverture d'une page) :
 * ne recalcule pas plus d'une fois toutes les 5 minutes et renvoie null dans
 * ce cas. Ne lève jamais : une réussite est un bonus, jamais une raison de
 * faire échouer l'action qui l'a déclenchée.
 */
export async function evaluateReussites(userId: string, opts: { force?: boolean } = {}): Promise<EvaluationResult | null> {
  try {
    const now = new Date();
    const user = await userReussitesDb.findUnique({ where: { id: userId }, select: { reussitesCheckedAt: true, enabledCosmetics: true } });
    if (!user) return null;
    if (!opts.force && user.reussitesCheckedAt && now.getTime() - new Date(user.reussitesCheckedAt).getTime() < THROTTLE_MS) return null;
    const firstRun = !user.reussitesCheckedAt;

    const { metrics, posts } = await computeMetrics(userId, now);
    const existing = await achievementUnlockDb.findMany({ where: { userId } });
    const have = new Set(existing.map((u) => u.key));
    const fresh: FreshItem[] = [];

    // Défis de la semaine et du mois.
    const week = weekOf(now);
    const month = monthOf(now);
    const weeklyDefs = weeklyChallengesFor(week.index);
    const monthlyDef = monthlyChallengeFor(month.index);
    const [weekValues, monthValues, doneRows] = await Promise.all([
      challengeValues(userId, posts, week, true),
      challengeValues(userId, posts, month, false),
      challengeCompletionDb.findMany({ where: { userId, period: { in: [week.id, month.id] } } })
    ]);
    const done = new Set(doneRows.map((r) => `${r.period}:${r.challengeKey}`));
    const weekly = weeklyDefs.map((def) => ({ def, value: weekValues[def.metric], done: done.has(`${week.id}:${def.key}`) }));
    const monthly = { def: monthlyDef, value: monthValues[monthlyDef.metric], done: done.has(`${month.id}:${monthlyDef.key}`) };
    for (const c of weekly) {
      if (!c.done && c.value >= c.def.target && (await tryCreateCompletion(userId, week.id, c.def, false))) {
        c.done = true;
        metrics.weeklyChallengesDone += 1;
        fresh.push({ type: "challenge", key: `${week.id}:${c.def.key}` });
      }
    }
    if (!monthly.done && monthly.value >= monthly.def.target && (await tryCreateCompletion(userId, month.id, monthly.def, false))) {
      monthly.done = true;
      fresh.push({ type: "challenge", key: `${month.id}:${monthly.def.key}` });
    }

    // Accomplissements.
    for (const tier of ALL_TIERS) {
      if (have.has(tier.key) || metrics[tier.series.metric] < tier.target) continue;
      if (await tryCreateUnlock(userId, tier.key, tier.xp, firstRun)) {
        have.add(tier.key);
        fresh.push({ type: "accomplishment", key: tier.key });
        // Easter egg historique lié (cadre de page bio, badge ambassadeur) :
        // accordé sans notification séparée — celle de l'accomplissement suffit.
        if (tier.linkedEgg) await markEasterEggFound(userId, tier.linkedEgg, { silent: true });
      }
    }

    // XP et niveaux (une ligne par niveau atteint : jamais de retour en arrière).
    const xp = await computeXp(userId);
    const level = levelFor(xp);
    const newLevels: number[] = [];
    for (const l of LEVELS) {
      if (l.level < 2 || l.level > level.level || have.has(levelKey(l.level))) continue;
      // Premier passage : seule la carte du niveau atteint s'affiche.
      if (await tryCreateUnlock(userId, levelKey(l.level), 0, firstRun && l.level !== level.level)) {
        have.add(levelKey(l.level));
        newLevels.push(l.level);
        fresh.push({ type: "level", key: levelKey(l.level) });
      }
    }

    // Anneaux d'avatar gagnés : activés tout de suite (désactivables dans Paramètres).
    const freshKeys = fresh.filter((f) => f.type !== "challenge").map((f) => f.key);
    const newRewards = REWARDS.filter((r) => r.autoCosmetic && r.grantedBy.some((k) => freshKeys.includes(k)) && !r.grantedBy.some((k) => existing.some((e) => e.key === k)));
    const enabled = new Set((user.enabledCosmetics as string[] | undefined) ?? []);
    const toEnable = newRewards.map((r) => r.autoCosmetic as string).filter((k) => !enabled.has(k));

    await userReussitesDb.update({
      where: { id: userId },
      data: {
        creatorXp: xp,
        creatorLevel: level.level,
        reussitesCheckedAt: now,
        ...(toEnable.length ? { enabledCosmetics: { set: [...Array.from(enabled), ...toEnable] } } : {})
      }
    });

    await sendNotifications(userId, { fresh, firstRun, level, xp, metrics, have, week, month });

    const [unlocks, completions] = await Promise.all([
      achievementUnlockDb.findMany({ where: { userId } }),
      challengeCompletionDb.findMany({ where: { userId }, orderBy: { completedAt: "desc" } })
    ]);
    return { xp, level, fresh, metrics, weekly, monthly, week, month, unlocks, completions };
  } catch (err) {
    console.error("[reussites] évaluation impossible :", (err as Error).message);
    return null;
  }
}

/** Même chose sans attendre le résultat ni jamais lever (après une action). */
export async function refreshReussites(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  await evaluateReussites(userId, { force: true }).catch(() => undefined);
}

// --- Notifications -----------------------------------------------------------------

async function sendNotifications(
  userId: string,
  ctx: { fresh: FreshItem[]; firstRun: boolean; level: LevelProgress; xp: number; metrics: Metrics; have: Set<string>; week: Period; month: Period }
): Promise<void> {
  const { fresh, firstRun, level } = ctx;
  const accomplishments = fresh.filter((f) => f.type === "accomplishment").map((f) => findTier(f.key)).filter((t): t is FlatTier => Boolean(t));
  const levels = fresh.filter((f) => f.type === "level").map((f) => Number(f.key.split("-")[1]));
  const challenges = fresh.filter((f) => f.type === "challenge");
  const toNext = level.nextXp !== null ? level.nextXp - ctx.xp : null;

  if (firstRun) {
    if (accomplishments.length > 0 || level.level > 1) {
      await notify(userId, {
        kind: "achievement",
        title: "Vos réussites sont arrivées",
        body:
          accomplishments.length > 0
            ? `Votre activité passée compte déjà : ${accomplishments.length} accomplissement${accomplishments.length > 1 ? "s" : ""} débloqué${accomplishments.length > 1 ? "s" : ""}, niveau ${level.level} · ${level.name}.`
            : `Vous démarrez au niveau ${level.level} · ${level.name}. Vos premiers objectifs vous attendent.`,
        href: "/reussites",
        actionLabel: "Voir mes réussites",
        dedupeKey: "reussites:welcome"
      });
    }
  } else if (accomplishments.length > 3) {
    await notify(userId, {
      kind: "achievement",
      title: `${accomplishments.length} accomplissements débloqués`,
      body: accomplishments.map((t) => `${t.series.emoji} ${t.title}`).join(", "),
      href: "/reussites",
      actionLabel: "Voir mes réussites",
      dedupeKey: `ach:batch:${accomplishments.map((t) => t.key).join(",")}`.slice(0, 180)
    });
  } else {
    for (const t of accomplishments) {
      const reward = tierRewardText(t);
      await notify(userId, {
        kind: "achievement",
        title: "Accomplissement débloqué",
        body: `${t.series.emoji} ${t.title} : ${t.description.charAt(0).toLowerCase()}${t.description.slice(1)}.${reward ? ` Récompense : ${reward}.` : ""} +${t.xp} XP.`,
        // Lien ciblé (24/09/2026) : la page défile jusqu'à ce succès et le
        // met en surbrillance quelques secondes.
        href: `/reussites?focus=${encodeURIComponent(t.key)}`,
        actionLabel: reward ? "Voir la récompense" : null,
        dedupeKey: `ach:${t.key}`
      });
    }
  }

  if (!firstRun) {
    for (const n of levels) {
      const def = LEVELS.find((l) => l.level === n);
      if (!def) continue;
      await notify(userId, {
        kind: "achievement",
        title: `Niveau ${n} atteint : ${def.name}`,
        body: def.reward ? `Vous gagnez : ${def.reward}.` : def.tagline,
        href: "/reussites?focus=level",
        actionLabel: "Voir mes réussites",
        dedupeKey: `level:${n}`
      });
    }
    for (const c of challenges) {
      const [period, key] = c.key.split(":");
      const def = findChallenge(key);
      if (!def) continue;
      const monthly = def.kind === "MONTHLY";
      await notify(userId, {
        kind: "achievement",
        title: monthly ? "Défi du mois réussi !" : "Défi réussi !",
        body: monthly
          ? `${def.description} : +${def.xp} XP et le badge « ${monthLabel(period)} » dans votre profil.`
          : `${def.title} : +${def.xp} XP.${toNext !== null && toNext > 0 ? ` Plus que ${toNext} XP avant le niveau ${level.level + 1}.` : ""}`,
        href: "/reussites?focus=defis",
        actionLabel: null,
        dedupeKey: `challenge:${c.key}`
      });
    }

    // Encouragement : un accomplissement à 80 % ou plus (une seule
    // notification à la fois, jamais deux fois pour le même palier).
    const almost = ALL_TIERS.find((t) => {
      if (ctx.have.has(t.key) || t.target < 5) return false;
      const series = t.series;
      // Seulement le prochain palier non atteint de la série.
      const firstMissing = series.tiers.find((x) => !ctx.have.has(x.key));
      if (firstMissing?.key !== t.key) return false;
      const value = ctx.metrics[series.metric];
      return value >= t.target * 0.8 && value < t.target;
    });
    if (almost) {
      const value = ctx.metrics[almost.series.metric];
      const reward = tierRewardText(almost);
      await notifyOnce(userId, {
        kind: "achievement",
        title: "Vous y êtes presque",
        body: `${almost.series.emoji} ${almost.title} : ${formatValue(value)} / ${formatValue(almost.target)} ${almost.series.unit}.${reward ? ` À la clé : ${reward}.` : " Encore un petit effort !"}`,
        href: `/reussites?focus=${encodeURIComponent(almost.key)}`,
        actionLabel: null,
        dedupeKey: `almost:${almost.key}`
      });
    }
  }
}

function formatValue(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

// --- Lecture -------------------------------------------------------------------------

/** Nouveautés (accomplissements, niveaux, défis) depuis la dernière visite de Réussites. */
export async function unseenReussites(userId: string, seenAt: Date | null): Promise<number> {
  const since = seenAt ?? new Date(0);
  const [a, c] = await Promise.all([
    achievementUnlockDb.count({ where: { userId, unlockedAt: { gt: since } } }),
    challengeCompletionDb.count({ where: { userId, completedAt: { gt: since } } })
  ]);
  return a + c;
}
