// Constellation de compétences (Réussites v2, lot B, 27/09/2026) :
// 5 compétences de créateur, 5 étoiles chacune. Chaque étoile est une vraie
// habitude, mesurée sur les données réelles du compte (publications en
// ligne, statistiques, commentaires, Communauté, bilans), avec une
// mini-leçon de 2 minutes (lessons.ts) et un bouton « Essayer maintenant ».
// Importable côté client ET serveur (aucune dépendance à Prisma) ; les
// mesures sont calculées par skill-metrics.ts (serveur).
//
// Les étoiles sont enregistrées comme des accomplissements (AchievementUnlock,
// clé « star-<compétence>-<n> ») : ne jamais renommer une clé.
//
// Condition de variété des rangs : pour entrer dans les rangs Étoile,
// Constellation et Nébuleuse, il faut aussi plusieurs compétences au bon
// niveau. Elle ne s'applique qu'aux passages à venir : un rang déjà atteint
// n'est jamais retiré.
import { MAX_STEP, STEPS, findTier, rankAt, rankFor, stepDef, type LevelProgress, type PendingRank } from "./catalog";

export type SkillId = "regularite" | "formats" | "portee" | "communaute" | "strategie";

/** Mesures des étoiles (voir skill-metrics.ts → computeSkillMetrics). */
export type SkillMetric =
  | "scheduledPublished"
  | "activeWeeks"
  | "daysPlannedAhead"
  | "importedMedia"
  | "verticalVideos"
  | "videoMaxNetworks"
  | "youtubeThumbnails"
  | "publishedVideos"
  | "importedVideos"
  | "analyticsSynced"
  | "bestSlotPosts"
  | "bestGain90d"
  | "maxViews"
  | "commentReplies"
  | "communityMessages"
  | "forumRepliedThreads"
  | "helpfulReplies"
  | "weeklyReviews"
  | "reviewStreak"
  | "bioReady"
  | "slotTestMorning"
  | "slotTestEvening";

export type SkillMetrics = Record<SkillMetric, number>;

export interface StarRequirement {
  metric: SkillMetric;
  target: number;
  /** Unité affichée : « 3 / 5 vidéos ». */
  unit: string;
}

export interface StarDef {
  /** Clé stable stockée en base (AchievementUnlock.key). */
  key: string;
  skill: SkillId;
  /** 1 à 5 dans la compétence. */
  n: number;
  name: string;
  description: string;
  /** Toutes doivent être atteintes. */
  requirements: StarRequirement[];
  xp: number;
  /** Précision affichée sous la progression. */
  note?: string;
  /** « Essayer maintenant » : écran à ouvrir (« #bilan » = sur la page). */
  href: string;
  action: string;
  /** Récompense en plus des XP (texte ; clé REWARDS éventuelle dans catalog.ts). */
  reward?: string;
}

export interface SkillDef {
  id: SkillId;
  name: string;
  emoji: string;
  /** Couleur de la branche (maquette « Réussites v2 »). */
  color: string;
  why: string;
  stars: StarDef[];
}

/** XP d'une étoile selon son rang dans la compétence. */
export const STAR_XP = [40, 60, 80, 120, 150] as const;

const starKey = (skill: SkillId, n: number) => `star-${skill}-${n}`;

type RawStar = Omit<StarDef, "key" | "skill" | "n" | "xp">;

function skill(id: SkillId, name: string, emoji: string, color: string, why: string, stars: RawStar[]): SkillDef {
  return { id, name, emoji, color, why, stars: stars.map((s, i) => ({ ...s, key: starKey(id, i + 1), skill: id, n: i + 1, xp: STAR_XP[i] })) };
}

export const SKILLS: SkillDef[] = [
  skill("regularite", "Régularité", "📅", "#7a95ff", "Les réseaux et votre audience récompensent la constance plus que le volume.", [
    {
      name: "Programmer à l'avance",
      description: "Mettre en ligne une publication programmée au moins 1 h à l'avance.",
      requirements: [{ metric: "scheduledPublished", target: 1, unit: "publication programmée" }],
      href: "/composer",
      action: "Programmer une publication"
    },
    {
      name: "4 semaines actives",
      description: "Publier dans 4 semaines différentes. Pas besoin qu'elles se suivent.",
      requirements: [{ metric: "activeWeeks", target: 4, unit: "semaines" }],
      href: "/composer",
      action: "Publier cette semaine"
    },
    {
      name: "Prévoyant",
      description: "Avoir une publication programmée sur chacun des 7 prochains jours.",
      requirements: [{ metric: "daysPlannedAhead", target: 7, unit: "jours couverts" }],
      href: "/calendar",
      action: "Remplir ma semaine"
    },
    {
      name: "12 semaines actives",
      description: "Publier dans 12 semaines différentes : trois mois de présence.",
      requirements: [{ metric: "activeWeeks", target: 12, unit: "semaines" }],
      href: "/calendar",
      action: "Préparer mes 4 semaines"
    },
    {
      name: "26 semaines actives",
      description: "Publier dans 26 semaines différentes : six mois de présence.",
      requirements: [{ metric: "activeWeeks", target: 26, unit: "semaines" }],
      href: "/calendar",
      action: "Ouvrir le calendrier"
    }
  ]),
  skill("formats", "Formats vidéo", "🎬", "#f062d0", "Une vidéo bien adaptée touche plusieurs publics pour le même effort.", [
    {
      name: "Premier import",
      description: "Importer un média depuis Canva, Google Drive, Dropbox, OneDrive ou Unsplash.",
      requirements: [{ metric: "importedMedia", target: 1, unit: "import" }],
      href: "/composer",
      action: "Importer un média"
    },
    {
      name: "Vertical natif",
      description: "Mettre en ligne 3 vidéos verticales (plus hautes que larges).",
      requirements: [{ metric: "verticalVideos", target: 3, unit: "vidéos verticales" }],
      note: "Le format est reconnu dans l'aperçu de Publier.",
      href: "/composer",
      action: "Publier une vidéo verticale"
    },
    {
      name: "Recyclage malin",
      description: "Mettre en ligne une même vidéo sur 3 réseaux.",
      requirements: [{ metric: "videoMaxNetworks", target: 3, unit: "réseaux" }],
      href: "/composer",
      action: "Publier sur 3 réseaux"
    },
    {
      name: "Miniature soignée",
      description: "Mettre en ligne 5 vidéos YouTube avec une miniature choisie dans Nebula.",
      requirements: [{ metric: "youtubeThumbnails", target: 5, unit: "miniatures appliquées" }],
      note: "YouTube n'accepte les miniatures personnalisées que des chaînes vérifiées par téléphone.",
      href: "/composer",
      action: "Choisir une miniature"
    },
    {
      name: "Studio",
      description: "Mettre en ligne 25 vidéos, dont 5 avec un média importé.",
      requirements: [
        { metric: "publishedVideos", target: 25, unit: "vidéos" },
        { metric: "importedVideos", target: 5, unit: "vidéos importées" }
      ],
      href: "/composer",
      action: "Publier une vidéo"
    }
  ]),
  skill("portee", "Portée", "📡", "#5fe0f0", "Publier quand votre audience est là multiplie les premières vues.", [
    {
      name: "Premier relevé",
      description: "Synchroniser les statistiques d'un compte connecté.",
      requirements: [{ metric: "analyticsSynced", target: 1, unit: "relevé" }],
      href: "/analytics",
      action: "Ouvrir Analytics"
    },
    {
      name: "Au bon moment",
      description: "Mettre en ligne 3 publications à l'heure de votre meilleur créneau (à une heure près).",
      requirements: [{ metric: "bestSlotPosts", target: 3, unit: "publications" }],
      note: "Créneau calculé sur vos propres statistiques, compte par compte (5 relevés au moins).",
      href: "/dashboard",
      action: "Voir mon meilleur créneau"
    },
    {
      name: "Envol",
      description: "Gagner 100 abonnés en moins de 90 jours sur un de vos comptes.",
      requirements: [{ metric: "bestGain90d", target: 100, unit: "abonnés" }],
      href: "/analytics",
      action: "Suivre ma croissance"
    },
    {
      name: "1 000 vues",
      description: "Une publication vue 1 000 fois.",
      requirements: [{ metric: "maxViews", target: 1_000, unit: "vues" }],
      href: "/engagements",
      action: "Voir mes publications"
    },
    {
      name: "Viral",
      description: "Une publication vue 10 000 fois.",
      requirements: [{ metric: "maxViews", target: 10_000, unit: "vues" }],
      href: "/engagements",
      action: "Voir mes publications"
    }
  ]),
  skill("communaute", "Communauté", "💬", "#f2cf6b", "Répondre fait vivre vos publications et fidélise votre audience.", [
    {
      name: "Première réponse",
      description: "Répondre à un commentaire reçu sur une de vos publications.",
      requirements: [{ metric: "commentReplies", target: 1, unit: "réponse" }],
      note: "Vos réponses sont repérées quand vous actualisez l'onglet Commentaires (Instagram, Facebook, YouTube).",
      href: "/comments",
      action: "Ouvrir les commentaires"
    },
    {
      name: "Premier message",
      description: "Écrire dans la Communauté Nebula : un sujet ou une réponse.",
      requirements: [{ metric: "communityMessages", target: 1, unit: "message" }],
      href: "/community",
      action: "Ouvrir la Communauté"
    },
    {
      name: "Conversation",
      description: "Répondre à 20 commentaires reçus.",
      requirements: [{ metric: "commentReplies", target: 20, unit: "réponses" }],
      note: "Vos réponses sont repérées quand vous actualisez l'onglet Commentaires (Instagram, Facebook, YouTube).",
      href: "/comments",
      action: "Répondre aux commentaires",
      reward: "Cadre de page bio « Halo »"
    },
    {
      name: "Coup de main",
      description: "Répondre à 5 sujets d'autres créateurs dans la Communauté.",
      requirements: [{ metric: "forumRepliedThreads", target: 5, unit: "sujets" }],
      note: "Réponses d'au moins 20 caractères.",
      href: "/community",
      action: "Aider un créateur"
    },
    {
      name: "Mentor",
      description: "Répondre à 25 sujets d'autres créateurs, dont 5 réponses saluées par une réaction.",
      requirements: [
        { metric: "forumRepliedThreads", target: 25, unit: "sujets" },
        { metric: "helpfulReplies", target: 5, unit: "réponses saluées" }
      ],
      href: "/community",
      action: "Aider un créateur",
      reward: "Mention « Mentor » à côté de votre nom dans la Communauté"
    }
  ]),
  skill("strategie", "Stratégie", "🧭", "#a066ff", "Refaire ce qui a marché : la façon la plus sûre de progresser.", [
    {
      name: "Premier bilan",
      description: "Faire le bilan de la semaine dans Réussites et choisir votre cap.",
      requirements: [{ metric: "weeklyReviews", target: 1, unit: "bilan" }],
      href: "#bilan",
      action: "Faire mon bilan"
    },
    {
      name: "Rituel du lundi",
      description: "Faire le bilan de la semaine 3 semaines d'affilée.",
      requirements: [{ metric: "reviewStreak", target: 3, unit: "semaines d'affilée" }],
      href: "#bilan",
      action: "Faire mon bilan"
    },
    {
      name: "Page bio qui convertit",
      description: "Publier votre page bio avec au moins 3 liens actifs.",
      requirements: [{ metric: "bioReady", target: 1, unit: "page prête" }],
      href: "/link-in-bio",
      action: "Ouvrir ma page bio"
    },
    {
      name: "Deux créneaux testés",
      description: "Sur un même réseau, en 30 jours : 2 publications le matin (avant 12 h) et 2 le soir (à partir de 18 h).",
      requirements: [
        { metric: "slotTestMorning", target: 2, unit: "le matin" },
        { metric: "slotTestEvening", target: 2, unit: "le soir" }
      ],
      note: "Comparez ensuite leurs vues dans Engagements.",
      href: "/calendar",
      action: "Programmer le test"
    },
    {
      name: "Stratège",
      description: "Faire 8 bilans de la semaine.",
      requirements: [{ metric: "weeklyReviews", target: 8, unit: "bilans" }],
      href: "#bilan",
      action: "Faire mon bilan"
    }
  ])
];

export const ALL_STARS: StarDef[] = SKILLS.flatMap((s) => s.stars);
export const TOTAL_STARS = ALL_STARS.length;
/** Étoile qui donne la mention « Mentor » dans la Communauté. */
export const MENTOR_STAR = starKey("communaute", 5);

export function findStar(key: string): StarDef | undefined {
  return ALL_STARS.find((s) => s.key === key);
}

export function findSkill(id: string): SkillDef | undefined {
  return SKILLS.find((s) => s.id === id);
}

/** Nom affiché : « Formats vidéo ★3 · Recyclage malin ». */
export function starTitle(star: StarDef): string {
  return `${findSkill(star.skill)?.name ?? ""} ★${star.n} · ${star.name}`;
}

/** Compétence d'une mission (missions.ts garde le nom affiché). */
export function skillIdFromName(name: string): SkillId | null {
  return SKILLS.find((s) => s.name === name)?.id ?? null;
}

// --- Progression -----------------------------------------------------------------

export interface StarProgress {
  values: number[];
  /** Avancement de l'exigence la moins avancée, 0–100. */
  pct: number;
  done: boolean;
}

export function starProgress(star: StarDef, metrics: Partial<SkillMetrics>): StarProgress {
  const values = star.requirements.map((r) => Math.max(0, metrics[r.metric] ?? 0));
  const ratios = star.requirements.map((r, i) => (r.target > 0 ? Math.min(1, values[i] / r.target) : 1));
  const done = ratios.every((r) => r >= 1);
  return { values, pct: done ? 100 : Math.min(99, Math.floor(Math.min(...ratios) * 100)), done };
}

/** Niveau (0 à 5) de chaque compétence : nombre d'étoiles allumées. */
export function skillLevels(unlocked: Iterable<string>): Record<SkillId, number> {
  const set = new Set(unlocked);
  const out = { regularite: 0, formats: 0, portee: 0, communaute: 0, strategie: 0 } as Record<SkillId, number>;
  for (const s of ALL_STARS) if (set.has(s.key)) out[s.skill] += 1;
  return out;
}

// --- Condition de variété des rangs ---------------------------------------------------

/** Pour entrer dans un rang : `skills` compétences au niveau `level` au moins. */
export const RANK_CONDITIONS: Record<number, { skills: number; level: number }> = {
  3: { skills: 2, level: 2 },
  4: { skills: 3, level: 3 },
  5: { skills: 4, level: 4 }
};

export function rankConditionText(rank: number): string | null {
  const c = RANK_CONDITIONS[rank];
  return c ? `${c.skills} compétences au niveau ${c.level}` : null;
}

function conditionMet(rank: number, levels: Record<SkillId, number>): boolean {
  const c = RANK_CONDITIONS[rank];
  if (!c) return true;
  return Object.values(levels).filter((l) => l >= c.level).length >= c.skills;
}

/** Palier le plus haut que la variété des compétences permet d'atteindre. */
export function maxStepAllowed(levels: Record<SkillId, number>): number {
  if (!conditionMet(3, levels)) return 6;
  if (!conditionMet(4, levels)) return 9;
  if (!conditionMet(5, levels)) return 12;
  return MAX_STEP;
}

/** Ce qui manque pour entrer dans un rang (compétences les plus proches d'abord). */
export function missingForRank(rank: number, levels: Record<SkillId, number>): string[] {
  const c = RANK_CONDITIONS[rank];
  if (!c || conditionMet(rank, levels)) return [];
  const ok = SKILLS.filter((s) => levels[s.id] >= c.level).length;
  const need = c.skills - ok;
  const closest = SKILLS.filter((s) => levels[s.id] < c.level)
    .sort((a, b) => levels[b.id] - levels[a.id])
    .slice(0, need)
    .map((s) => `${s.name} (${levels[s.id]}/${c.level})`);
  return [`${need} compétence${need > 1 ? "s" : ""} de plus au niveau ${c.level}`, ...closest];
}

/**
 * Rang affiché et enregistré : celui des XP, retenu par la condition de
 * variété, mais jamais sous un palier déjà atteint (`floorStep`). Quand les
 * XP suffisent pour le palier suivant mais pas les compétences, `pending`
 * dit ce qui manque (« Rang en attente »).
 */
export function gatedRank(xp: number, levels: Record<SkillId, number>, floorStep = 1): LevelProgress {
  const byXp = rankFor(xp).level;
  const step = Math.max(Math.min(floorStep, byXp), Math.min(byXp, maxStepAllowed(levels)));
  let pending: PendingRank | null = null;
  const next = STEPS.find((s) => s.step === step + 1);
  if (next && byXp > step) {
    const missing = missingForRank(next.rank, levels);
    if (missing.length > 0) pending = { step: next.step, name: next.name, condition: rankConditionText(next.rank) ?? "", missing };
  }
  return rankAt(xp, step, pending);
}

/** Condition d'entrée de chaque rang (liste des rangs, carte). */
export function rankRequirement(step: number): string | null {
  const def = stepDef(step);
  return def.tier === 1 ? rankConditionText(def.rank) : null;
}

// --- Vitrine -------------------------------------------------------------------------

/** Badges montrés dans la vitrine (Communauté, carte de créateur). */
export const MAX_SHOWCASE = 3;

export interface ShowcaseBadge {
  key: string;
  emoji: string;
  label: string;
  kind: "accomplishment" | "star";
}

/** Badge de vitrine d'une clé d'accomplissement ou d'étoile (null si inconnue). */
export function showcaseBadge(key: string): ShowcaseBadge | null {
  const star = findStar(key);
  if (star) {
    const sk = findSkill(star.skill);
    return { key, emoji: sk?.emoji ?? "⭐", label: `${sk?.name ?? ""} ★${star.n} · ${star.name}`, kind: "star" };
  }
  const tier = findTier(key);
  if (tier) return { key, emoji: tier.series.emoji, label: tier.title, kind: "accomplishment" };
  return null;
}
