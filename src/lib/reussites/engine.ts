// Moteur des Réussites (25/09/2026, v2 le 26/09/2026) — serveur uniquement.
//
// evaluateReussites(userId) mesure l'activité RÉELLE du compte (publications
// réellement en ligne, statistiques des comptes connectés, forum, page bio,
// parrainage), valide les missions de la semaine et le défi du mois,
// débloque les accomplissements atteints, gère la série et ses boucliers,
// recalcule l'XP et le rang, accorde les récompenses et prévient dans la
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
// notification récapitulative, et seule la carte du rang atteint s'affiche).
// Passage à la v2 (rangs, missions, constellation) d'un compte déjà évalué :
// les paliers et les étoiles déjà mérités sont enregistrés sans carte ni
// notification, avec une seule annonce ; le rang déjà atteint est gardé.
// Le repère « migration:v2 » (accomplissement sans XP) marque ce passage.
//
// Lot B (27/09/2026) : étoiles de la constellation (skills.ts), mesurées
// par skill-metrics.ts, et condition de variété des rangs (gatedRank).
// Lot C : défi collectif du mois (collective.ts), badges de
// saison (seasons.ts), Premier décollage (launch.ts), badge Explorateur,
// ticket « vidéo à la une » du rang Constellation I (featured.ts).
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
  REWARDS,
  STEPS,
  findChallenge,
  findTier,
  monthLabel,
  monthlyChallengeFor,
  rankFor,
  rankKey,
  stepDef,
  tierRewardText,
  type ChallengeDef,
  type ChallengeMetric,
  type FlatTier,
  type LevelProgress,
  type MetricId
} from "./catalog";
import { monthOf, parisDayKey, parisDayNumber, weekIndexOf, weekOf, type Period } from "./periods";
import { publishedPosts, type PublishedPost } from "./posts";
import { applyStreakShields, evaluateWeekMissions, type FreshMission, type StreakResult, type WeekMissions } from "./weekly";
import { MAX_SHIELDS } from "./missions";
import { ALL_STARS, findStar, gatedRank, skillLevels, starProgress, starTitle, type SkillMetrics } from "./skills";
import { computeSkillMetrics } from "./skill-metrics";
import { COLLECTIVE_XP, evaluateCollective, type CollectiveState } from "./collective";
import { SEASON_TARGET, SEASON_XP, seasonById, seasonOfMonth } from "./seasons";
import { launchState, type LaunchState } from "./launch";
import { grantRankTicket } from "./featured";

const DAY = 86_400_000;
const THROTTLE_MS = 5 * 60_000;
/** Repère du passage à la v2 (voir l'en-tête). Jamais affiché, 0 XP. */
export const MIGRATION_KEY = "migration:v2";
const MIN_REPLY_CHARS = 20;
const MIN_VIEWS_FOR_ENGAGEMENT = 200;

// --- Données brutes -----------------------------------------------------------

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
    // Défis de la semaine d'avant la v2 et missions de la semaine.
    challengeCompletionDb.count({ where: { userId, kind: { in: ["WEEKLY", "MISSION"] } } })
  ]);
  const metrics: Metrics = {
    publishedPosts: posts.length,
    publishedVideos: posts.filter((p) => p.type === "VIDEO").length,
    publishedPhotos: posts.filter((p) => p.type === "IMAGE").length,
    maxNetworksOnePost: Math.max(0, ...posts.map((p) => p.networks.size)),
    // Remplacée après l'application des boucliers (semaines protégées comprises).
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
    bioClicks: bio.clicks,
    starFragments: 0,
    // Complétées par evaluateReussites (lot C).
    launchSteps: 0,
    toolsExplored: 0
  };
  return { metrics, posts };
}

// --- Défi du mois -----------------------------------------------------------------

type ChallengeValues = Record<ChallengeMetric, number>;

function monthValues(posts: PublishedPost[], period: Period): ChallengeValues {
  const inPeriod = posts.filter((p) => p.firstAt >= period.start && p.firstAt < period.end);
  const networks = new Set<string>();
  for (const p of inPeriod) p.networks.forEach((n) => networks.add(n));
  return {
    posts: inPeriod.length,
    videos: inPeriod.filter((p) => p.type === "VIDEO").length,
    photos: inPeriod.filter((p) => p.type === "IMAGE").length,
    multiNetworkPosts: inPeriod.filter((p) => p.networks.size >= 2).length,
    distinctDays: new Set(inPeriod.map((p) => parisDayKey(p.firstAt))).size,
    weekendScheduled: 0,
    plannedAhead: 0,
    communityReplies: 0,
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
 * Missions de la semaine et défi du mois, sans rien valider : calcul léger
 * pour le tableau de bord quand l'évaluation complète a déjà eu lieu
 * récemment. null si les missions de la semaine n'existent pas encore.
 */
export async function currentProgress(userId: string, now: Date = new Date()): Promise<{ missions: WeekMissions; monthly: ChallengeState; month: Period } | null> {
  const week = weekOf(now);
  const month = monthOf(now);
  // 5 semaines d'historique : de quoi reconnaître un média republié récemment.
  const since = new Date(Math.min(week.start.getTime() - 35 * DAY, month.start.getTime()));
  const posts = await publishedPosts(userId, since);
  const [weekly, doneRows] = await Promise.all([
    evaluateWeekMissions(userId, posts, now, { record: false }).catch(() => null),
    challengeCompletionDb.findMany({ where: { userId, period: month.id } })
  ]);
  if (!weekly) return null;
  const monthlyDef = monthlyChallengeFor(month.index);
  return {
    missions: weekly.state,
    month,
    monthly: { def: monthlyDef, value: monthValues(posts, month)[monthlyDef.metric], done: doneRows.some((r) => r.challengeKey === monthlyDef.key) }
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
  type: "accomplishment" | "level" | "challenge" | "mission" | "star" | "collective" | "season";
  key: string;
  /** Mission : titre et XP (notification). */
  label?: string;
  xp?: number;
}

export interface EvaluationResult {
  xp: number;
  level: LevelProgress;
  fresh: FreshItem[];
  metrics: Metrics;
  /** Mesures des étoiles (lot B). */
  skillMetrics: SkillMetrics;
  /** Publications en ligne (bilan de la semaine). */
  posts: PublishedPost[];
  /** Défi collectif du mois (lot C). */
  collective: CollectiveState;
  /** Premier décollage (lot C). */
  launch: LaunchState;
  missions: WeekMissions;
  monthly: ChallengeState;
  month: Period;
  streak: StreakResult;
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
    const user = await userReussitesDb.findUnique({
      where: { id: userId },
      select: { reussitesCheckedAt: true, enabledCosmetics: true, creatorXp: true, creatorLevel: true, createdAt: true, toolsExplored: true }
    });
    if (!user) return null;
    if (!opts.force && user.reussitesCheckedAt && now.getTime() - new Date(user.reussitesCheckedAt).getTime() < THROTTLE_MS) return null;
    const firstRun = !user.reussitesCheckedAt;

    const { metrics, posts } = await computeMetrics(userId, now);
    const existing = await achievementUnlockDb.findMany({ where: { userId } });
    const have = new Set(existing.map((u) => u.key));
    const fresh: FreshItem[] = [];
    // Compte déjà évalué avant la v2 : ce qui est déjà mérité est enregistré
    // en silence (une seule annonce), et le rang déjà atteint est gardé.
    const catchUp = !firstRun && !have.has(MIGRATION_KEY);

    // Missions de la semaine (créées à la première évaluation de la semaine).
    const weekly = await evaluateWeekMissions(userId, posts, now, { record: true, celebrated: firstRun });
    for (const f of weekly.fresh) fresh.push(missionFresh(weekly.state.week.id, f));
    metrics.weeklyChallengesDone += weekly.fresh.length;

    // Défi du mois.
    const month = monthOf(now);
    const monthlyDef = monthlyChallengeFor(month.index);
    const doneMonth = await challengeCompletionDb.findFirst({ where: { userId, period: month.id, challengeKey: monthlyDef.key } });
    const monthly: ChallengeState = { def: monthlyDef, value: monthValues(posts, month)[monthlyDef.metric], done: Boolean(doneMonth) };
    if (!monthly.done && monthly.value >= monthlyDef.target && (await tryCreateCompletion(userId, month.id, monthlyDef, false))) {
      monthly.done = true;
      fresh.push({ type: "challenge", key: `${month.id}:${monthlyDef.key}` });
    }

    // Badge de saison (lot C) : 2 défis du mois réussis dans la saison.
    if (monthly.done) {
      const season = seasonOfMonth(month.id);
      const inSeason = await challengeCompletionDb.count({ where: { userId, kind: "MONTHLY", period: { in: season.months } } });
      if (inSeason >= SEASON_TARGET) {
        try {
          await challengeCompletionDb.create({ data: { userId, period: season.id, challengeKey: "season", kind: "SEASON", xp: SEASON_XP, celebratedAt: firstRun ? now : null } });
          fresh.push({ type: "season", key: season.id });
        } catch {
          // déjà gagné
        }
      }
    }

    // Défi collectif du mois (lot C).
    const collective = await evaluateCollective(userId, now, { record: true, celebrated: firstRun });
    for (const c of collective.fresh) fresh.push({ type: "collective", key: c.month, label: `${c.total}:${c.participants}` });

    // Série de semaines : boucliers dépensés ou gagnés, fragments d'étoile filante.
    const streak = await applyStreakShields(userId, posts, now);
    metrics.bestWeekStreak = Math.max(metrics.bestWeekStreak, streak.streak.best);
    metrics.starFragments = streak.fragments;

    // Étoiles de la constellation (lot B) et Premier décollage (lot C) : leurs
    // mesures servent aussi à deux accomplissements (« launch », « explorer »).
    const skillMetrics = await computeSkillMetrics(userId, posts, now, metrics);
    const launch = await launchState(userId, posts, { createdAt: new Date(user.createdAt as unknown as Date), analyticsSynced: skillMetrics.analyticsSynced > 0 }, now);
    metrics.launchSteps = launch.done;
    metrics.toolsExplored = Number(user.toolsExplored) || 0;

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

    // Étoiles de la constellation (lot B).
    for (const star of ALL_STARS) {
      if (have.has(star.key) || !starProgress(star, skillMetrics).done) continue;
      if (await tryCreateUnlock(userId, star.key, star.xp, firstRun || catchUp)) {
        have.add(star.key);
        if (!catchUp) fresh.push({ type: "star", key: star.key });
      }
    }
    if ((firstRun || catchUp) && (await tryCreateUnlock(userId, MIGRATION_KEY, 0, true))) have.add(MIGRATION_KEY);

    // XP et rang (une ligne par palier atteint : jamais de retour en arrière).
    // Condition de variété : les rangs Étoile, Constellation et Nébuleuse
    // demandent aussi des compétences, mais un palier déjà atteint (ou
    // mérité avant la v2) n'est jamais retiré.
    const xp = await computeXp(userId);
    const reached = Math.max(
      Number(user.creatorLevel) || 1,
      ...Array.from(have)
        .filter((k) => k.startsWith("rank-"))
        .map((k) => Number(k.slice(5)) || 1),
      catchUp ? rankFor(Number(user.creatorXp) || 0).level : 1
    );
    const level = gatedRank(xp, skillLevels(have), reached);
    for (const st of STEPS) {
      if (st.step < 2 || st.step > level.level || have.has(rankKey(st.step))) continue;
      // Premier passage : seule la carte du palier atteint s'affiche.
      const celebrated = catchUp || (firstRun && st.step !== level.level);
      if (await tryCreateUnlock(userId, rankKey(st.step), 0, celebrated)) {
        have.add(rankKey(st.step));
        if (!catchUp) fresh.push({ type: "level", key: rankKey(st.step) });
      }
    }

    // Rang Constellation I : un ticket « vidéo à la une » (lot C, une seule fois).
    if (level.level >= 10) await grantRankTicket(userId);

    // Anneaux d'avatar gagnés : activés tout de suite (désactivables dans Paramètres).
    const newKeys = Array.from(have).filter((k) => !existing.some((e) => e.key === k));
    const newRewards = REWARDS.filter((r) => r.autoCosmetic && r.grantedBy.some((k) => newKeys.includes(k)) && !r.grantedBy.some((k) => existing.some((e) => e.key === k)));
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

    await sendNotifications(userId, {
      fresh,
      firstRun,
      catchUp,
      level,
      xp,
      metrics,
      have,
      weekly,
      streak,
      newRewards: newRewards.map((r) => r.label),
      starsLit: ALL_STARS.filter((st) => have.has(st.key)).length
    });

    const [unlocks, completions] = await Promise.all([
      achievementUnlockDb.findMany({ where: { userId } }),
      challengeCompletionDb.findMany({ where: { userId }, orderBy: { completedAt: "desc" } })
    ]);
    return { xp, level, fresh, metrics, skillMetrics, posts, collective: collective.state, launch, missions: weekly.state, monthly, month, streak, unlocks, completions };
  } catch (err) {
    console.error("[reussites] évaluation impossible :", (err as Error).message);
    return null;
  }
}

function missionFresh(weekId: string, f: FreshMission): FreshItem {
  return { type: "mission", key: `${weekId}:${f.slot}`, label: f.title, xp: f.xp };
}

/** Même chose sans attendre le résultat ni jamais lever (après une action). */
export async function refreshReussites(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  await evaluateReussites(userId, { force: true }).catch(() => undefined);
}

// --- Notifications -----------------------------------------------------------------

async function sendNotifications(
  userId: string,
  ctx: {
    fresh: FreshItem[];
    firstRun: boolean;
    catchUp: boolean;
    level: LevelProgress;
    xp: number;
    metrics: Metrics;
    have: Set<string>;
    weekly: { state: WeekMissions; revealedNow: boolean };
    streak: StreakResult;
    newRewards: string[];
    starsLit: number;
  }
): Promise<void> {
  const { fresh, firstRun, level } = ctx;
  const accomplishments = fresh.filter((f) => f.type === "accomplishment").map((f) => findTier(f.key)).filter((t): t is FlatTier => Boolean(t));
  const steps = fresh.filter((f) => f.type === "level").map((f) => Number(f.key.split("-")[1]));
  const challenges = fresh.filter((f) => f.type === "challenge");
  const missions = fresh.filter((f) => f.type === "mission");
  const weekId = ctx.weekly.state.week.id;

  if (firstRun) {
    if (accomplishments.length > 0 || level.level > 1) {
      await notify(userId, {
        kind: "achievement",
        title: "Vos réussites sont arrivées",
        body:
          accomplishments.length > 0
            ? `Votre activité passée compte déjà : ${accomplishments.length} accomplissement${accomplishments.length > 1 ? "s" : ""} débloqué${accomplishments.length > 1 ? "s" : ""}, rang ${level.name}.`
            : `Vous démarrez au rang ${level.name}. Vos 3 missions de la semaine vous attendent.`,
        href: "/reussites",
        actionLabel: "Voir mes réussites",
        dedupeKey: "reussites:welcome"
      });
    }
    return;
  }

  if (ctx.catchUp) {
    const stars = ctx.starsLit > 0 ? ` ${ctx.starsLit} étoile${ctx.starsLit > 1 ? "s" : ""} de votre constellation ${ctx.starsLit > 1 ? "sont" : "est"} déjà allumée${ctx.starsLit > 1 ? "s" : ""}.` : "";
    await notifyOnce(userId, {
      kind: "achievement",
      title: "Nouveau : rangs, missions et constellation",
      body: `Vos XP sont conservés : vous êtes ${level.name}.${ctx.newRewards.length ? ` Vous gagnez : ${ctx.newRewards.join(", ")}.` : ""}${stars} Chaque semaine, 3 missions choisies pour vous et un coffre à ouvrir.`,
      href: "/reussites",
      actionLabel: "Voir mes réussites",
      dedupeKey: "reussites:v2"
    });
  }

  // Étoiles de la constellation (lot B).
  const stars = fresh.filter((f) => f.type === "star").map((f) => findStar(f.key)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (stars.length > 3) {
    await notify(userId, {
      kind: "achievement",
      title: `${stars.length} nouvelles étoiles`,
      body: stars.map((st) => starTitle(st)).join(", "),
      href: "/reussites?focus=constellation",
      actionLabel: "Voir ma constellation",
      dedupeKey: `stars:batch:${stars.map((st) => st.key).join(",")}`.slice(0, 180)
    });
  } else {
    for (const st of stars) {
      await notify(userId, {
        kind: "achievement",
        title: "Nouvelle étoile",
        body: `${starTitle(st)} : ${st.description.charAt(0).toLowerCase()}${st.description.slice(1)}${st.reward ? ` Récompense : ${st.reward}.` : ""} +${st.xp} XP.`,
        href: `/reussites?focus=${encodeURIComponent(st.key)}`,
        actionLabel: st.reward ? "Voir la récompense" : null,
        dedupeKey: `star:${st.key}`
      });
    }
  }

  // Défi collectif réussi, badge de saison (lot C).
  for (const f of fresh.filter((x) => x.type === "collective")) {
    const [total, participants] = (f.label ?? "0:0").split(":").map(Number);
    await notifyOnce(userId, {
      kind: "achievement",
      title: "Défi collectif réussi !",
      body: `${total.toLocaleString("fr-FR")} vidéos mises en ligne par ${participants} créateurs en ${monthLabel(f.key).toLowerCase()}, dont les vôtres : +${COLLECTIVE_XP} XP et le badge collectif du mois.`,
      href: "/reussites?focus=collectif",
      actionLabel: null,
      dedupeKey: `collective:${f.key}`
    });
  }
  for (const f of fresh.filter((x) => x.type === "season")) {
    const season = seasonById(f.key);
    if (!season) continue;
    await notifyOnce(userId, {
      kind: "achievement",
      title: `Badge de saison : ${season.label}`,
      body: `${season.emoji} Deux défis du mois réussis cette saison : +${SEASON_XP} XP. Ce badge ne se gagne que pendant la saison.`,
      href: "/reussites?focus=saisons",
      actionLabel: null,
      dedupeKey: `season:${f.key}`
    });
  }

  // Rang en attente : les XP sont là, il manque des compétences.
  if (level.pending && !ctx.catchUp) {
    await notifyOnce(userId, {
      kind: "achievement",
      title: `Rang ${level.pending.name} en attente`,
      body: `Vos XP suffisent. Pour y entrer : ${level.pending.condition}. Il vous manque ${level.pending.missing[0]}${level.pending.missing.length > 1 ? ` — les plus proches : ${level.pending.missing.slice(1).join(", ")}` : ""}.`,
      href: "/reussites?focus=constellation",
      actionLabel: "Voir ma constellation",
      dedupeKey: `rank-pending:${level.pending.step}`
    });
  }

  if (accomplishments.length > 3) {
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

  for (const n of steps) {
    const def = stepDef(n);
    await notify(userId, {
      kind: "achievement",
      title: `Nouveau rang : ${def.name}`,
      body: def.reward ? `Vous gagnez : ${def.reward}.` : def.tagline,
      href: "/reussites?focus=level",
      actionLabel: "Voir mes réussites",
      dedupeKey: `rank:${n}`
    });
  }

  const allDone = ctx.weekly.state.doneCount === 3 && !ctx.weekly.state.chest.opened;
  for (const m of missions) {
    await notify(userId, {
      kind: "achievement",
      title: "Mission réussie !",
      body: `${m.label} : +${m.xp} XP.${allDone ? " Votre coffre de la semaine est prêt : ouvrez-le dans Réussites." : ""}`,
      href: "/reussites?focus=missions",
      actionLabel: allDone ? "Ouvrir le coffre" : null,
      dedupeKey: `mission:${m.key}`
    });
  }

  // Mission mystère révélée le jeudi (et pas déjà réussie dans la foulée).
  const mystery = ctx.weekly.state.missions.find((m) => m.slot === "mystery");
  if (ctx.weekly.revealedNow && mystery && !mystery.done) {
    await notifyOnce(userId, {
      kind: "achievement",
      title: "Votre mission mystère est révélée",
      body: `${mystery.title} : +${mystery.xp} XP. ${mystery.description}`,
      href: "/reussites?focus=missions",
      actionLabel: null,
      dedupeKey: `mystery:${weekId}`
    });
  }

  for (const c of challenges) {
    const [period, key] = c.key.split(":");
    const def = findChallenge(key);
    if (!def) continue;
    await notify(userId, {
      kind: "achievement",
      title: "Défi du mois réussi !",
      body: `${def.description} : +${def.xp} XP et le badge « ${monthLabel(period)} » dans votre profil.`,
      href: "/reussites?focus=defis",
      actionLabel: null,
      dedupeKey: `challenge:${c.key}`
    });
  }

  // Série : bouclier dépensé ou gagné.
  if (ctx.streak.usedNow.length > 0) {
    const n = ctx.streak.usedNow.length;
    await notifyOnce(userId, {
      kind: "achievement",
      title: n > 1 ? `${n} boucliers ont protégé votre série` : "Un bouclier a protégé votre série",
      body: `Série en cours : ${ctx.streak.streak.current} semaine${ctx.streak.streak.current > 1 ? "s" : ""}. Il vous reste ${ctx.streak.shields} bouclier${ctx.streak.shields > 1 ? "s" : ""}.`,
      href: "/reussites?focus=missions",
      actionLabel: null,
      dedupeKey: `shield-used:${ctx.streak.usedNow.join(",")}`
    });
  }
  if (ctx.streak.grantedNow) {
    await notifyOnce(userId, {
      kind: "achievement",
      title: "Nouveau bouclier de série",
      body: `${ctx.streak.streak.current} semaines d'affilée : un bouclier protégera votre série si une semaine vous échappe (${ctx.streak.shields} sur ${MAX_SHIELDS}).`,
      href: "/reussites?focus=missions",
      actionLabel: null,
      dedupeKey: `shield-won:${weekId}`
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

function formatValue(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

// --- Lecture -------------------------------------------------------------------------

/** Nouveautés (accomplissements, rangs, missions, défis) depuis la dernière visite de Réussites. */
export async function unseenReussites(userId: string, seenAt: Date | null): Promise<number> {
  const since = seenAt ?? new Date(0);
  const [a, c] = await Promise.all([
    achievementUnlockDb.count({ where: { userId, unlockedAt: { gt: since }, NOT: { key: MIGRATION_KEY } } }),
    // Le coffre s'ouvre sur la page elle-même : il n'est pas une nouveauté.
    challengeCompletionDb.count({ where: { userId, completedAt: { gt: since }, kind: { not: "CHEST" } } })
  ]);
  return a + c;
}

/** Rang atteint pour ce total d'XP (compatibilité avec l'ancien nom). */
export { rankFor as levelProgressFor };
