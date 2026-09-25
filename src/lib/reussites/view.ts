// Construction des réponses des routes /api/reussites* (serveur).
import { challengeCompletionDb, achievementUnlockDb, userReussitesDb, weeklyMissionsDb, type AchievementUnlockRow } from "@/lib/prisma-extra";
import {
  LEGACY_LEVEL_NAMES,
  RANKS,
  SERIES,
  REWARDS,
  findChallenge,
  findTier,
  monthLabel,
  rewardKeysFromUnlocks,
  stepDef,
  tierRewardText,
  type RewardDef
} from "./catalog";
import { currentProgress, evaluateReussites, unseenReussites, type ChallengeState, type Metrics } from "./engine";
import { focusOptions, isReviewFocus, reviewFigures, weekRangeLabel } from "./review";
import { findLesson } from "./lessons";
import { rarityMap, type RarityTier } from "./rarity";
import { COLLECTIVE_XP } from "./collective";
import { SEASON_TARGET, SEASON_XP, seasonById, seasonOfMonth } from "./seasons";
import { featureTickets, featuredOf } from "./featured";
import { prisma } from "@/lib/prisma";
import {
  ALL_STARS,
  MAX_SHOWCASE,
  RANK_CONDITIONS,
  SKILLS,
  findSkill,
  findStar,
  gatedRank,
  rankConditionText,
  showcaseBadge,
  skillLevels,
  starProgress,
  starTitle,
  type ShowcaseBadge,
  type SkillMetrics
} from "./skills";
import { CHEST_BONUS_XP, CHEST_TABLE, CHEST_XP, MAX_SHIELDS, MAX_SWAPS, SLOT_LABEL, chestItemLabel, findMission, missionTitle } from "./missions";
import { pendingChests, progressChoices, revealTime, type MissionState, type WeekMissions } from "./weekly";
import type { CelebrationDTO, ChallengeDTO, ConstellationDTO, MissionDTO, NearDTO, NextActionDTO, RarityDTO, ReussitesPageDTO, ReussitesSummaryDTO, SeriesDTO, ShowcaseDTO } from "./types";

type RarityLookup = Map<string, { share: number; tier: RarityTier | null }>;

/**
 * Rareté affichée d'un badge. Rien pour un badge que personne n'a encore
 * (« Légendaire · 0 % » sur chaque badge verrouillé ne dirait rien). Sous
 * 10 %, une décimale arrondie vers le bas : 4,76 % s'affiche « 4,7 % »
 * (Épique), jamais « 5 % », le seuil du palier Rare.
 */
export function rarityOf(rarity: RarityLookup, key: string): RarityDTO | null {
  const r = rarity.get(key);
  if (!r?.tier || !(r.share > 0)) return null;
  const pct = r.share < 0.1 ? Math.max(0.1, Math.floor(r.share * 1000) / 10) : Math.round(r.share * 100);
  return { tier: r.tier, pct };
}

export function challengeDTO(c: ChallengeState): ChallengeDTO {
  return { key: c.def.key, kind: c.def.kind, title: c.def.title, description: c.def.description, target: c.def.target, value: Math.min(c.value, c.def.target), xp: c.def.xp, done: c.done };
}

export function missionDTO(m: MissionState): MissionDTO {
  if (!m.revealed) {
    return {
      slot: m.slot,
      key: "mystery",
      title: "Mission mystère",
      description: "Elle se révèle quand les deux autres missions sont réussies, ou jeudi au plus tard.",
      skill: "",
      target: 1,
      value: 0,
      xp: 0,
      done: false,
      revealed: false,
      href: null,
      action: null
    };
  }
  return { slot: m.slot, key: m.key, title: m.title, description: m.description, skill: m.skill, target: m.target, value: m.value, xp: m.xp, done: m.done, revealed: true, href: m.href, action: m.action };
}

/** Mission non réussie la plus avancée (à égalité : Habitude, puis Progression, puis Mystère). */
function focusMission(missions: MissionState[]): MissionState | null {
  const open = missions.filter((m) => m.revealed && !m.done);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => b.value / b.target - a.value / a.target)[0];
}

/**
 * Étoile à viser : celle qui débloque un rang en attente, sinon la plus
 * avancée de toute la constellation.
 */
function starAction(constellation: ConstellationDTO, pendingRank: { name: string; step: number } | null): NextActionDTO | null {
  const needed = pendingRank ? (RANK_CONDITIONS[stepDef(pendingRank.step).rank]?.level ?? 0) : 0;
  const candidates = constellation.skills
    .map((sk) => ({ sk, next: sk.stars.find((st) => !st.unlockedAt) }))
    .filter((x): x is { sk: ConstellationDTO["skills"][number]; next: ConstellationDTO["skills"][number]["stars"][number] } => Boolean(x.next))
    .filter((x) => !pendingRank || x.sk.level < needed);
  if (candidates.length === 0) return null;
  // Rang en attente : la compétence la plus avancée parmi celles qui manquent.
  const pick = pendingRank ? [...candidates].sort((a, b) => b.sk.level - a.sk.level || b.next.pct - a.next.pct)[0] : [...candidates].sort((a, b) => b.next.pct - a.next.pct)[0];
  const { sk, next } = pick;
  return {
    title: `${sk.name} ★${next.n} : ${next.name}`,
    meta: `${pendingRank ? `Pour entrer dans le rang ${pendingRank.name}. ` : ""}${next.description} +${next.xp} XP.`,
    href: next.href,
    action: next.action
  };
}

function nextActionFor(state: WeekMissions, pending: string[], near: NearDTO[], star: NextActionDTO | null): NextActionDTO | null {
  if (state.chest.ready && !state.chest.opened) {
    return { title: "Ouvrir votre coffre de la semaine", meta: `3 missions sur 3 : ${CHEST_XP} XP et un objet vous attendent.`, href: "#coffre", action: "Ouvrir le coffre" };
  }
  if (pending.length > 0) {
    return { title: "Un coffre vous attend", meta: `Missions réussies la semaine ${pending[0].split("-W")[1]} : le coffre n'expire jamais.`, href: "#coffre", action: "Ouvrir le coffre" };
  }
  const m = focusMission(state.missions);
  if (m) {
    const progress = m.value > 0 ? ` · ${m.value} / ${m.target}` : "";
    return { title: m.title, meta: `+${m.xp} XP · mission ${SLOT_LABEL[m.slot]}${progress}. ${m.description}`, href: m.href, action: m.action };
  }
  if (star) return star;
  const n = near[0];
  if (n) {
    return {
      title: `Presque là : ${n.name}`,
      meta: `${n.value.toLocaleString("fr-FR")} / ${n.target.toLocaleString("fr-FR")} ${n.unit}${n.reward ? ` · récompense : ${n.reward}` : ""}.`,
      href: "#album",
      action: "Voir l'accomplissement"
    };
  }
  return null;
}

function nearFrom(series: SeriesDTO[]): NearDTO[] {
  const out: NearDTO[] = [];
  for (const s of series) {
    const next = s.tiers.find((t) => !t.unlockedAt);
    if (!next || next.target <= 0) continue;
    const pct = Math.floor((s.value / next.target) * 100);
    if (pct < 70 || pct >= 100) continue;
    out.push({ seriesId: s.id, key: next.key, emoji: s.emoji, name: s.tiers.length > 1 ? `${s.name} · palier ${next.rank}` : s.name, value: s.value, target: next.target, unit: s.unit, pct, reward: next.reward });
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, 3);
}

/** Comment se gagne une récompense (texte) et où l'utiliser. */
function rewardHow(r: RewardDef): string {
  const sources = r.grantedBy
    .map((k) => {
      if (k.startsWith("rank-")) return `rang ${stepDef(Number(k.slice(5))).name}`;
      if (k.startsWith("level-")) return null;
      const star = findStar(k);
      if (star) return `étoile ${starTitle(star)}`;
      const tier = findTier(k);
      return tier ? `« ${tier.title} »` : null;
    })
    .filter((x): x is string => Boolean(x));
  return sources.length ? sources.join(" ou ") : "";
}

function rewardHref(r: RewardDef): string {
  return r.kind === "frame" ? "/link-in-bio" : "/settings";
}

export function constellationDTO(metrics: SkillMetrics, unlockedAt: Map<string, Date>, rarity: RarityLookup = new Map()): ConstellationDTO {
  const levels = skillLevels(unlockedAt.keys());
  return {
    skills: SKILLS.map((sk) => ({
      id: sk.id,
      name: sk.name,
      emoji: sk.emoji,
      color: sk.color,
      why: sk.why,
      level: levels[sk.id],
      stars: sk.stars.map((st) => {
        const p = starProgress(st, metrics);
        const at = unlockedAt.get(st.key);
        return {
          key: st.key,
          n: st.n,
          name: st.name,
          description: st.description,
          xp: st.xp,
          note: st.note ?? null,
          href: st.href,
          action: st.action,
          reward: st.reward ?? null,
          lessonTitle: findLesson(st.key)?.title ?? st.name,
          requirements: st.requirements.map((r, i) => ({ unit: r.unit, target: r.target, value: Math.min(p.values[i], r.target) })),
          pct: at ? 100 : p.pct,
          unlockedAt: at?.toISOString() ?? null,
          rarity: rarityOf(rarity, st.key)
        };
      })
    })),
    lit: ALL_STARS.filter((st) => unlockedAt.has(st.key)).length,
    total: ALL_STARS.length,
    conditions: Object.keys(RANK_CONDITIONS).map((k) => {
      const rank = Number(k);
      const c = RANK_CONDITIONS[rank];
      return {
        rank,
        name: RANKS[rank - 1].name,
        text: rankConditionText(rank) ?? "",
        met: Object.values(levels).filter((l) => l >= c.level).length >= c.skills
      };
    })
  };
}

function showcaseDTO(selectedKeys: string[], unlockedKeys: string[]): ShowcaseDTO {
  const owned = new Set(unlockedKeys);
  const badges = (keys: string[]) => keys.map((k) => showcaseBadge(k)).filter((b): b is ShowcaseBadge => Boolean(b));
  // Étoiles d'abord (compétences), puis accomplissements, dans l'ordre du catalogue.
  const candidates = badges([...ALL_STARS.map((st) => st.key), ...SERIES.flatMap((x) => x.tiers.map((t) => t.key))].filter((k) => owned.has(k)));
  return { selected: badges(selectedKeys.filter((k) => owned.has(k))).slice(0, MAX_SHOWCASE), candidates, max: MAX_SHOWCASE };
}

export async function buildPage(userId: string): Promise<ReussitesPageDTO | null> {
  const r = await evaluateReussites(userId, { force: true });
  if (!r) return null;
  const unlockedAt = new Map<string, Date>(r.unlocks.map((u: AchievementUnlockRow) => [u.key, u.unlockedAt]));
  const metrics: Metrics = r.metrics;
  const rarity = await rarityMap().catch(() => new Map() as RarityLookup);
  // Séries qui ne se gagnent plus après coup (Explorateur) : absentes tant qu'elles ne sont pas gagnées.
  const visibleSeries = SERIES.filter((s) => !s.hiddenUntilUnlocked || s.tiers.some((t) => unlockedAt.has(t.key)));
  const series: SeriesDTO[] = visibleSeries.map((s) => ({
    id: s.id,
    category: s.category,
    emoji: s.emoji,
    name: s.name,
    unit: s.unit,
    note: s.note ?? null,
    value: metrics[s.metric],
    tiers: s.tiers.map((t, i) => ({
      key: t.key,
      rank: i + 1,
      target: t.target,
      xp: t.xp,
      description: t.description,
      reward: tierRewardText(t),
      unlockedAt: unlockedAt.get(t.key)?.toISOString() ?? null,
      rarity: rarityOf(rarity, t.key)
    }))
  }));
  const unlockedCount = series.reduce((n, s) => n + s.tiers.filter((t) => t.unlockedAt).length, 0);
  const rewardKeys = new Set(rewardKeysFromUnlocks(r.unlocks.map((u) => u.key)));
  const monthlyBadges = r.completions.filter((c) => c.kind === "MONTHLY").map((c) => ({ period: c.period, label: monthLabel(c.period) }));
  const state = r.missions;
  const [pending, , figures, userRow, tickets, mine, shared] = await Promise.all([
    pendingChests(userId, state.week.id),
    userReussitesDb.update({ where: { id: userId }, data: { reussitesSeenAt: new Date() } }),
    reviewFigures(userId, r.posts),
    userReussitesDb.findUnique({ where: { id: userId }, select: { showcase: true, featureConsent: true } }),
    featureTickets(userId),
    featuredOf(userId),
    prisma.sharedVideo.findMany({ where: { authorId: userId }, select: { id: true, title: true, network: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 })
  ]);
  const focus = isReviewFocus(state.row.reviewFocus) ? state.row.reviewFocus : null;
  const constellation = constellationDTO(r.skillMetrics, unlockedAt, rarity);
  const season = seasonOfMonth(r.month.id);
  const monthlyDone = new Set(r.completions.filter((c) => c.kind === "MONTHLY").map((c) => c.period));
  const featuredIds = new Set(mine.map((f) => f.sharedVideoId));
  const near = nearFrom(series);
  const progressDone = state.missions.find((m) => m.slot === "progress")?.done ?? false;
  return {
    level: r.level,
    week: { id: state.week.id, endsAt: state.week.end.toISOString(), revealAt: revealTime(state.week).toISOString() },
    missions: state.missions.map(missionDTO),
    choices: progressChoices(state.row),
    swapsLeft: progressDone ? 0 : Math.max(0, MAX_SWAPS - state.row.swapsUsed),
    chest: {
      week: state.week.id,
      ready: state.chest.ready,
      opened: state.chest.opened,
      item: state.chest.item,
      itemLabel: state.chest.item ? chestItemLabel(state.chest.item) : null,
      xp: CHEST_XP,
      bonusXp: CHEST_BONUS_XP,
      chances: CHEST_TABLE.map((c) => ({ label: c.label, chance: c.chance }))
    },
    pendingChests: pending,
    streak: { current: r.streak.streak.current, best: r.streak.streak.best, shields: r.streak.shields, maxShields: MAX_SHIELDS },
    nextAction: nextActionFor(state, pending, near, starAction(constellation, r.level.pending)),
    month: { id: r.month.id, endsAt: r.month.end.toISOString(), label: monthLabel(r.month.id) },
    monthly: challengeDTO(r.monthly),
    near,
    series,
    unlockedCount,
    total: series.reduce((n, x) => n + x.tiers.length, 0),
    challengesDone: r.completions.filter((c) => c.kind === "WEEKLY" || c.kind === "MISSION").length,
    monthlyBadges,
    rewards: REWARDS.map((w) => ({ key: w.key, label: w.label, kind: w.kind, unlocked: rewardKeys.has(w.key), how: rewardHow(w), href: rewardHref(w) })),
    constellation,
    review: {
      weekLabel: weekRangeLabel(figures.week),
      posts: figures.posts,
      days: figures.days,
      followersGained: figures.followersGained,
      top: figures.top,
      options: focusOptions(figures),
      done: Boolean(state.row.reviewedAt),
      focus
    },
    showcase: showcaseDTO((userRow?.showcase as string[] | undefined) ?? [], r.unlocks.map((u) => u.key)),
    collective: {
      month: r.collective.month,
      label: monthLabel(r.collective.month),
      target: r.collective.target,
      total: r.collective.total,
      participants: r.collective.participants,
      mine: r.collective.mine,
      reached: Boolean(r.collective.reachedAt),
      earned: r.collective.earned,
      endsAt: r.month.end.toISOString(),
      xp: COLLECTIVE_XP
    },
    seasons: {
      current: {
        id: season.id,
        label: season.label,
        emoji: season.emoji,
        months: season.months.map((m) => ({ id: m, label: monthLabel(m), done: monthlyDone.has(m) })),
        target: SEASON_TARGET,
        earned: r.completions.some((c) => c.kind === "SEASON" && c.period === season.id),
        xp: SEASON_XP
      },
      badges: r.completions
        .filter((c) => c.kind === "SEASON")
        .map((c) => seasonById(c.period))
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .map((x) => ({ id: x.id, label: x.label, emoji: x.emoji })),
      collective: r.completions.filter((c) => c.kind === "COLLECTIVE").map((c) => ({ month: c.period, label: monthLabel(c.period) }))
    },
    launch: { active: r.launch.active, steps: r.launch.steps, done: r.launch.done, pct: r.launch.pct, endsAt: r.launch.endsAt },
    featured: {
      consent: Boolean(userRow?.featureConsent),
      tickets,
      mine: mine.map((f) => ({ id: f.id, title: f.title, network: f.network, externalUrl: f.externalUrl, startsAt: f.startsAt, endsAt: f.endsAt, live: f.live })),
      shared: (shared as { id: string; title: string; network: string; createdAt: Date }[]).map((v) => ({
        id: v.id,
        title: v.title,
        network: v.network,
        createdAt: new Date(v.createdAt).toISOString(),
        featured: featuredIds.has(v.id)
      }))
    }
  };
}

function focusDTO(m: MissionState | null): ChallengeDTO | null {
  if (!m) return null;
  return { key: m.slot, kind: "WEEKLY", title: m.title, description: m.description, target: m.target, value: m.value, xp: m.xp, done: m.done };
}

export async function buildSummary(userId: string): Promise<ReussitesSummaryDTO> {
  // Évaluation complète au plus toutes les 5 minutes (clics de page bio,
  // statistiques…) ; sinon, simple lecture.
  const evaluated = await evaluateReussites(userId, { force: false });
  const user = await userReussitesDb.findUnique({ where: { id: userId }, select: { creatorXp: true, creatorLevel: true, reussitesSeenAt: true } });
  // Sans nouvelle évaluation : palier enregistré, avec le « rang en attente »
  // éventuel (compétences d'après les étoiles déjà allumées).
  const level =
    evaluated?.level ??
    gatedRank(user?.creatorXp ?? 0, skillLevels((await achievementUnlockDb.findMany({ where: { userId }, select: { key: true } })).map((u) => u.key)), user?.creatorLevel ?? 1);
  const state = evaluated ? evaluated.missions : ((await currentProgress(userId).catch(() => null))?.missions ?? null);
  const monthly = await challengeCompletionDb.findMany({ where: { userId, kind: "MONTHLY" }, orderBy: { completedAt: "desc" }, take: 24 });
  return {
    level,
    monthlyBadges: monthly.map((c) => ({ period: c.period, label: monthLabel(c.period) })),
    focusChallenge: state ? focusDTO(focusMission(state.missions)) : null,
    weeklyDone: state?.doneCount ?? 0,
    weekEndsAt: (state?.week.end ?? new Date()).toISOString(),
    chestReady: Boolean(state && state.chest.ready && !state.chest.opened),
    unseen: await unseenReussites(userId, user?.reussitesSeenAt ? new Date(user.reussitesSeenAt) : null)
  };
}

/** Célébrations à afficher (déblocages des dernières 24 h pas encore montrés), puis marquées comme vues. */
export async function takeCelebrations(userId: string): Promise<CelebrationDTO[]> {
  const since = new Date(Date.now() - 86_400_000);
  const [unlocks, completions] = await Promise.all([
    achievementUnlockDb.findMany({ where: { userId, celebratedAt: null, unlockedAt: { gte: since } }, orderBy: { unlockedAt: "asc" }, take: 6 }),
    challengeCompletionDb.findMany({ where: { userId, celebratedAt: null, completedAt: { gte: since } }, orderBy: { completedAt: "asc" }, take: 4 })
  ]);
  if (unlocks.length === 0 && completions.length === 0) return [];
  const now = new Date();
  await Promise.all([
    unlocks.length ? achievementUnlockDb.updateMany({ where: { id: { in: unlocks.map((u) => u.id) }, celebratedAt: null }, data: { celebratedAt: now } }) : null,
    completions.length ? challengeCompletionDb.updateMany({ where: { id: { in: completions.map((c) => c.id) }, celebratedAt: null }, data: { celebratedAt: now } }) : null
  ]);
  // Missions : leur titre dépend des missions de la semaine du compte.
  const weeks = Array.from(new Set(completions.filter((c) => c.kind === "MISSION").map((c) => c.period)));
  const rows = weeks.length ? await weeklyMissionsDb.findMany({ where: { userId, week: { in: weeks } } }) : [];
  const out: CelebrationDTO[] = [];
  for (const c of completions) {
    if (c.kind === "MISSION") {
      const row = rows.find((w) => w.week === c.period);
      const slot = c.challengeKey.replace("mission-", "");
      const key = slot === "habit" ? row?.habitKey : slot === "progress" ? row?.progressKey : row?.mysteryKey;
      const def = key ? findMission(key) : undefined;
      if (!def) continue;
      out.push({
        id: c.id,
        kind: "challenge",
        focus: "missions",
        emoji: "⚡",
        label: "Mission réussie",
        title: missionTitle(def.key, slot === "habit" ? (row?.habitTarget ?? def.target) : def.target),
        reward: `+${c.xp} XP`
      });
      continue;
    }
    if (c.kind === "COLLECTIVE") {
      out.push({ id: c.id, kind: "challenge", focus: "collectif", emoji: "🤝", label: "Défi collectif réussi", title: monthLabel(c.period), reward: `+${c.xp} XP et le badge collectif` });
      continue;
    }
    if (c.kind === "SEASON") {
      const season = seasonById(c.period);
      if (season) out.push({ id: c.id, kind: "challenge", focus: "saisons", emoji: season.emoji, label: "Badge de saison", title: season.label, reward: `+${c.xp} XP` });
      continue;
    }
    const def = findChallenge(c.challengeKey);
    if (!def) continue;
    out.push({
      id: c.id,
      kind: "challenge",
      focus: "defis",
      emoji: def.kind === "MONTHLY" ? "🌙" : "⚡",
      label: def.kind === "MONTHLY" ? "Défi du mois réussi" : "Défi réussi",
      title: def.kind === "MONTHLY" ? `${monthLabel(c.period)} : ${def.title}` : def.title,
      reward: def.kind === "MONTHLY" ? `+${def.xp} XP et le badge « ${monthLabel(c.period)} »` : `+${def.xp} XP`
    });
  }
  for (const u of unlocks) {
    if (u.key.startsWith("rank-")) {
      const step = stepDef(Number(u.key.slice(5)));
      out.push({ id: u.id, kind: "level", emoji: "⭐", label: "Nouveau rang", title: step.name, reward: step.reward, focus: "level" });
      continue;
    }
    if (u.key.startsWith("level-")) {
      const name = LEGACY_LEVEL_NAMES[Number(u.key.slice(6))];
      if (name) out.push({ id: u.id, kind: "level", emoji: "⭐", label: "Niveau atteint", title: name, reward: null, focus: "level" });
      continue;
    }
    const star = findStar(u.key);
    if (star) {
      out.push({
        id: u.id,
        kind: "accomplishment",
        emoji: findSkill(star.skill)?.emoji ?? "⭐",
        label: "Nouvelle étoile",
        title: starTitle(star),
        reward: star.reward ? `${star.reward} · +${star.xp} XP` : `+${star.xp} XP`,
        focus: star.key
      });
      continue;
    }
    const tier = findTier(u.key);
    if (!tier) continue;
    out.push({ id: u.id, kind: "accomplishment", emoji: tier.series.emoji, label: "Accomplissement débloqué", title: tier.title, reward: tierRewardText(tier) ?? `+${tier.xp} XP`, focus: tier.key });
  }
  return out;
}
