// Formes échangées entre les routes /api/reussites* et l'interface.
import type { LevelProgress, ReussiteCategory, RewardKind } from "./catalog";
import type { MissionSlot } from "./missions";
import type { ReviewFocus } from "./review";
import type { ShowcaseBadge, SkillId } from "./skills";
import type { RarityTier } from "./rarity";
import type { LaunchStep } from "./launch";

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

/** Rareté réelle d'un badge (lot C) : null tant qu'il y a moins de 20 créateurs. */
export interface RarityDTO {
  tier: RarityTier;
  /** Part des créateurs qui l'ont, 0–100 (arrondie). */
  pct: number;
}

export interface TierDTO {
  key: string;
  rank: number;
  target: number;
  xp: number;
  description: string;
  reward: string | null;
  unlockedAt: string | null;
  rarity: RarityDTO | null;
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

/** Mission de la semaine (Réussites v2). Mystère non révélée : rien n'en est montré. */
export interface MissionDTO {
  slot: MissionSlot;
  key: string;
  title: string;
  description: string;
  skill: string;
  target: number;
  value: number;
  xp: number;
  done: boolean;
  revealed: boolean;
  href: string | null;
  action: string | null;
}

export interface ProgressChoiceDTO {
  key: string;
  title: string;
  xp: number;
  skill: string;
  chosen: boolean;
}

export interface ChestDTO {
  week: string;
  ready: boolean;
  opened: boolean;
  item: string | null;
  itemLabel: string | null;
  xp: number;
  bonusXp: number;
  chances: { label: string; chance: number }[];
}

export interface StreakDTO {
  current: number;
  best: number;
  shields: number;
  maxShields: number;
}

export interface NextActionDTO {
  title: string;
  meta: string;
  /** Lien interne, ou « #coffre » / « #album » (sur la page). */
  href: string;
  action: string;
}

/** Accomplissement à 70 % ou plus (« Presque là »). */
export interface NearDTO {
  seriesId: string;
  key: string;
  emoji: string;
  name: string;
  value: number;
  target: number;
  unit: string;
  pct: number;
  reward: string | null;
}

/** Étoile de la constellation (lot B). */
export interface StarDTO {
  key: string;
  n: number;
  name: string;
  description: string;
  xp: number;
  note: string | null;
  href: string;
  action: string;
  reward: string | null;
  /** Titre de la mini-leçon (le contenu se charge à l'ouverture). */
  lessonTitle: string;
  requirements: { unit: string; target: number; value: number }[];
  pct: number;
  unlockedAt: string | null;
  rarity: RarityDTO | null;
}

export interface SkillDTO {
  id: SkillId;
  name: string;
  emoji: string;
  color: string;
  why: string;
  /** Étoiles allumées, 0 à 5. */
  level: number;
  stars: StarDTO[];
}

export interface ConstellationDTO {
  skills: SkillDTO[];
  lit: number;
  total: number;
  /** Condition de chaque rang (3 à 5) : « 2 compétences au niveau 2 ». */
  conditions: { rank: number; name: string; text: string; met: boolean }[];
}

/** Bilan de la semaine (lot B). */
export interface ReviewDTO {
  /** « du 21 au 27 septembre ». */
  weekLabel: string;
  posts: number;
  days: number;
  followersGained: number | null;
  top: { title: string; views: number; network: string; permalink: string | null; hour: number | null } | null;
  options: { key: ReviewFocus; label: string }[];
  done: boolean;
  focus: ReviewFocus | null;
}

/** Défi collectif du mois (lot C). */
export interface CollectiveDTO {
  month: string;
  /** « Septembre 2026 ». */
  label: string;
  target: number;
  total: number;
  participants: number;
  mine: number;
  reached: boolean;
  earned: boolean;
  endsAt: string;
  xp: number;
}

/** Saisons (lot C) : la saison en cours et les badges gagnés. */
export interface SeasonsDTO {
  current: { id: string; label: string; emoji: string; months: { id: string; label: string; done: boolean }[]; target: number; earned: boolean; xp: number };
  badges: { id: string; label: string; emoji: string }[];
  collective: { month: string; label: string }[];
}

/** Premier décollage (lot C). */
export interface LaunchDTO {
  active: boolean;
  steps: LaunchStep[];
  done: number;
  pct: number;
  endsAt: string;
}

/** Vidéo à la une (lot C) : accord, tickets, mises à la une du créateur. */
export interface FeaturedDTO {
  consent: boolean;
  tickets: number;
  mine: { id: string; title: string; network: string; externalUrl: string; startsAt: string; endsAt: string; live: boolean }[];
  shared: { id: string; title: string; network: string; createdAt: string; featured: boolean }[];
}

export interface ShowcaseDTO {
  selected: ShowcaseBadge[];
  /** Badges gagnés, pouvant aller dans la vitrine. */
  candidates: ShowcaseBadge[];
  max: number;
}

export interface ReussitesPageDTO {
  level: LevelProgress;
  week: { id: string; endsAt: string; revealAt: string };
  missions: MissionDTO[];
  choices: ProgressChoiceDTO[];
  swapsLeft: number;
  chest: ChestDTO;
  /** Semaines passées dont le coffre attend d'être ouvert. */
  pendingChests: string[];
  streak: StreakDTO;
  nextAction: NextActionDTO | null;
  month: { id: string; endsAt: string; label: string };
  monthly: ChallengeDTO;
  near: NearDTO[];
  series: SeriesDTO[];
  unlockedCount: number;
  total: number;
  challengesDone: number;
  monthlyBadges: { period: string; label: string }[];
  rewards: { key: string; label: string; kind: RewardKind; unlocked: boolean; how: string; href: string }[];
  constellation: ConstellationDTO;
  review: ReviewDTO;
  showcase: ShowcaseDTO;
  collective: CollectiveDTO;
  seasons: SeasonsDTO;
  launch: LaunchDTO;
  featured: FeaturedDTO;
}

export interface ReussitesSummaryDTO {
  level: LevelProgress;
  /** Mission de la semaine non réussie la plus avancée (tableau de bord). */
  focusChallenge: ChallengeDTO | null;
  weeklyDone: number;
  weekEndsAt: string;
  /** Coffre de la semaine prêt à être ouvert. */
  chestReady: boolean;
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
  /** Élément à mettre en évidence sur /reussites (?focus=…) : clé du palier, « level », « missions » ou « defis ». */
  focus?: string;
}
