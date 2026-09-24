// Construction des réponses des routes /api/reussites* (serveur).
import { challengeCompletionDb, achievementUnlockDb, userReussitesDb, type AchievementUnlockRow } from "@/lib/prisma-extra";
import { SERIES, REWARDS, TOTAL_ACCOMPLISHMENTS, levelFor, monthLabel, rewardKeysFromUnlocks, tierRewardText, findTier, findChallenge, LEVELS } from "./catalog";
import { currentChallenges, evaluateReussites, unseenReussites, type ChallengeState, type Metrics } from "./engine";
import type { CelebrationDTO, ChallengeDTO, ReussitesPageDTO, ReussitesSummaryDTO } from "./types";

export function challengeDTO(c: ChallengeState): ChallengeDTO {
  return { key: c.def.key, kind: c.def.kind, title: c.def.title, description: c.def.description, target: c.def.target, value: Math.min(c.value, c.def.target), xp: c.def.xp, done: c.done };
}

export async function buildPage(userId: string): Promise<ReussitesPageDTO | null> {
  const r = await evaluateReussites(userId, { force: true });
  if (!r) return null;
  const unlockedAt = new Map<string, Date>(r.unlocks.map((u: AchievementUnlockRow) => [u.key, u.unlockedAt]));
  const metrics: Metrics = r.metrics;
  const series = SERIES.map((s) => ({
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
      unlockedAt: unlockedAt.get(t.key)?.toISOString() ?? null
    }))
  }));
  const unlockedCount = series.reduce((n, s) => n + s.tiers.filter((t) => t.unlockedAt).length, 0);
  const rewardKeys = new Set(rewardKeysFromUnlocks(r.unlocks.map((u) => u.key)));
  const monthlyBadges = r.completions
    .filter((c) => c.kind === "MONTHLY")
    .map((c) => ({ period: c.period, label: monthLabel(c.period) }));
  await userReussitesDb.update({ where: { id: userId }, data: { reussitesSeenAt: new Date() } });
  return {
    level: r.level,
    week: { id: r.week.id, endsAt: r.week.end.toISOString() },
    month: { id: r.month.id, endsAt: r.month.end.toISOString(), label: monthLabel(r.month.id) },
    weekly: r.weekly.map(challengeDTO),
    monthly: challengeDTO(r.monthly),
    series,
    unlockedCount,
    total: TOTAL_ACCOMPLISHMENTS,
    challengesDone: r.completions.filter((c) => c.kind === "WEEKLY").length,
    monthlyBadges,
    rewards: REWARDS.map((w) => ({ key: w.key, label: w.label, kind: w.kind, unlocked: rewardKeys.has(w.key) }))
  };
}

export async function buildSummary(userId: string): Promise<ReussitesSummaryDTO> {
  // Évaluation complète au plus toutes les 5 minutes (clics de page bio,
  // statistiques…) ; sinon, simple lecture.
  const evaluated = await evaluateReussites(userId, { force: false });
  const user = await userReussitesDb.findUnique({ where: { id: userId }, select: { creatorXp: true, reussitesSeenAt: true } });
  const level = evaluated?.level ?? levelFor(user?.creatorXp ?? 0);
  const challenges = evaluated ? { weekly: evaluated.weekly, week: evaluated.week } : await currentChallenges(userId);
  const pending = challenges.weekly.filter((c) => !c.done);
  const focus = pending.sort((a, b) => b.value / b.def.target - a.value / a.def.target)[0] ?? null;
  const monthly = await challengeCompletionDb.findMany({ where: { userId, kind: "MONTHLY" }, orderBy: { completedAt: "desc" }, take: 24 });
  return {
    level,
    monthlyBadges: monthly.map((c) => ({ period: c.period, label: monthLabel(c.period) })),
    focusChallenge: focus ? challengeDTO(focus) : null,
    weeklyDone: challenges.weekly.filter((c) => c.done).length,
    weekEndsAt: challenges.week.end.toISOString(),
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
  const out: CelebrationDTO[] = [];
  for (const c of completions) {
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
    if (u.key.startsWith("level-")) {
      const n = Number(u.key.slice(6));
      const def = LEVELS.find((l) => l.level === n);
      if (!def) continue;
      out.push({ id: u.id, kind: "level", emoji: "⭐", label: `Niveau ${n} atteint`, title: def.name, reward: def.reward, focus: "level" });
      continue;
    }
    const tier = findTier(u.key);
    if (!tier) continue;
    out.push({ id: u.id, kind: "accomplishment", emoji: tier.series.emoji, label: "Accomplissement débloqué", title: tier.title, reward: tierRewardText(tier) ?? `+${tier.xp} XP`, focus: tier.key });
  }
  return out;
}


