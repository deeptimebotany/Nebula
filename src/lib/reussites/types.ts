// Formes échangées entre les routes /api/reussites* et l'interface.
import type { LevelProgress, ReussiteCategory, RewardKind } from "./catalog";

export interface ChallengeDTO {
  key: string;
  kind: "WEEKLY" | "MONTHLY";
  title: string;
  description: string;
  target: number;
  value: number;
  xp: number;
  done: boolean;
}

export interface TierDTO {
  key: string;
  rank: number;
  target: number;
  xp: number;
  description: string;
  reward: string | null;
  unlockedAt: string | null;
}

export interface SeriesDTO {
  id: string;
  category: ReussiteCategory;
  emoji: string;
  name: string;
  unit: string;
  note: string | null;
  value: number;
  tiers: TierDTO[];
}

export interface ReussitesPageDTO {
  level: LevelProgress;
  week: { id: string; endsAt: string };
  month: { id: string; endsAt: string; label: string };
  weekly: ChallengeDTO[];
  monthly: ChallengeDTO;
  series: SeriesDTO[];
  unlockedCount: number;
  total: number;
  challengesDone: number;
  monthlyBadges: { period: string; label: string }[];
  rewards: { key: string; label: string; kind: RewardKind; unlocked: boolean }[];
}

export interface ReussitesSummaryDTO {
  level: LevelProgress;
  /** Défi de la semaine non réussi le plus avancé (tableau de bord). */
  focusChallenge: ChallengeDTO | null;
  weeklyDone: number;
  weekEndsAt: string;
  unseen: number;
  /** Badges des défis du mois réussis (profil). */
  monthlyBadges: { period: string; label: string }[];
}

export interface CelebrationDTO {
  id: string;
  kind: "accomplishment" | "level" | "challenge";
  emoji: string;
  label: string;
  title: string;
  reward: string | null;
  /** Élément à mettre en évidence sur /reussites (?focus=…) : clé du palier, « level » ou « defis ». */
  focus?: string;
}
