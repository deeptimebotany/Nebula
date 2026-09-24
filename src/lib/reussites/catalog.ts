// Catalogue des Réussites (25/09/2026) : niveaux de créateur,
// accomplissements, défis de la semaine et du mois, récompenses. Importable
// côté client ET serveur (aucune dépendance à Prisma). Le calcul réel des
// progrès vit dans engine.ts (serveur uniquement).
//
// Règles posées avec Lucas : seules les vraies données comptent
// (publications réellement en ligne, statistiques des comptes connectés,
// forum, page bio) ; rien ne se perd (pas de niveau qui baisse, pas de
// série punitive : c'est la meilleure série qui compte) ; les défis sont les
// mêmes pour tout le monde.
//
// Les clés (accomplissements, récompenses) sont stockées en base : ne
// jamais les renommer. Ajouter un palier = ajouter une entrée.

export type ReussiteCategory = "publication" | "regularite" | "croissance" | "communaute" | "bio";

export const CATEGORIES: { id: ReussiteCategory; label: string; emoji: string }[] = [
  { id: "publication", label: "Publication", emoji: "🚀" },
  { id: "regularite", label: "Régularité", emoji: "🔥" },
  { id: "croissance", label: "Croissance", emoji: "📈" },
  { id: "communaute", label: "Communauté", emoji: "💬" },
  { id: "bio", label: "Page bio", emoji: "🔗" }
];

// --- Niveaux --------------------------------------------------------------

export interface LevelDef {
  level: number;
  name: string;
  minXp: number;
  /** Phrase d'encouragement du bandeau. */
  tagline: string;
  /** Récompense affichée (texte) ; la clé correspondante est dans REWARDS. */
  reward: string | null;
  /** Titre affiché sous le prénom dans la Communauté, à partir de ce niveau. */
  title?: string;
}

export const LEVELS: LevelDef[] = [
  { level: 1, name: "Débutant", minXp: 0, tagline: "Chaque créateur commence ici. Votre première publication vous fera décoller.", reward: null },
  { level: 2, name: "Lancé", minXp: 100, tagline: "Vous êtes lancé·e : gardez le rythme, les prochains paliers arrivent vite.", reward: "Titre « Créateur lancé »", title: "Créateur lancé" },
  { level: 3, name: "Actif", minXp: 300, tagline: "Vous publiez, vous progressez : c'est comme ça qu'une audience se construit.", reward: "Fond « Première lumière »" },
  { level: 4, name: "Régulier", minXp: 600, tagline: "Vous publiez chaque semaine depuis un moment. Continuez comme ça !", reward: "Titre « Créateur régulier »", title: "Créateur régulier" },
  { level: 5, name: "Confirmé", minXp: 1000, tagline: "Un vrai rythme de créateur confirmé : votre régularité paie.", reward: "Anneau d'avatar argent" },
  { level: 6, name: "Étoile montante", minXp: 1800, tagline: "On commence à vous remarquer. Visez les accomplissements de croissance.", reward: "Titre « Étoile montante »", title: "Étoile montante" },
  { level: 7, name: "Astre", minXp: 3000, tagline: "Votre présence brille sur vos réseaux. Le dernier niveau est en vue.", reward: "Cadre de page bio « Astre »" },
  { level: 8, name: "Légende", minXp: 5000, tagline: "Niveau maximum : une vraie légende de Nebula.", reward: "Anneau stellaire animé", title: "Légende" }
];

export const MAX_LEVEL = LEVELS.length;

export interface LevelProgress {
  level: number;
  name: string;
  xp: number;
  /** XP du début du niveau actuel. */
  levelXp: number;
  /** XP du niveau suivant (null au niveau maximum). */
  nextXp: number | null;
  nextName: string | null;
  nextReward: string | null;
  /** Progression vers le niveau suivant (XP ÷ XP du niveau suivant), 0–100. */
  pct: number;
  tagline: string;
  /** Titre le plus élevé atteint (Communauté). */
  title: string | null;
}

export function levelFor(xp: number): LevelProgress {
  const safe = Math.max(0, Math.floor(xp));
  let current = LEVELS[0];
  for (const l of LEVELS) if (safe >= l.minXp) current = l;
  const next = LEVELS.find((l) => l.level === current.level + 1) ?? null;
  // Comme sur la maquette validée : part de l'XP totale dans l'XP du niveau
  // suivant (620 / 1 000 XP → 62 %).
  const pct = next ? Math.min(99, Math.floor((safe / next.minXp) * 100)) : 100;
  const title = [...LEVELS].reverse().find((l) => l.level <= current.level && l.title)?.title ?? null;
  return {
    level: current.level,
    name: current.name,
    xp: safe,
    levelXp: current.minXp,
    nextXp: next?.minXp ?? null,
    nextName: next?.name ?? null,
    nextReward: next?.reward ?? null,
    pct,
    tagline: current.tagline,
    title
  };
}

export function levelName(level: number): string {
  return LEVELS.find((l) => l.level === level)?.name ?? LEVELS[0].name;
}

export const levelKey = (level: number) => `level-${level}`;

// --- Accomplissements ------------------------------------------------------

/** Mesures calculées côté serveur (voir engine.ts → computeMetrics). */
export type MetricId =
  | "publishedPosts"
  | "publishedVideos"
  | "publishedPhotos"
  | "maxNetworksOnePost"
  | "bestWeekStreak"
  | "daysPlannedAhead"
  | "bestMonthPosts"
  | "weeklyChallengesDone"
  | "bestGain90d"
  | "followersTotal"
  | "likesTotal"
  | "bestEngagementPct"
  | "maxViews"
  | "forumThreads"
  | "forumRepliedThreads"
  | "reactionsReceived"
  | "confirmedReferrals"
  | "bioPublished"
  | "bioClicks";

export interface TierDef {
  /** Clé stable stockée en base (AchievementUnlock.key). */
  key: string;
  target: number;
  xp: number;
  description: string;
  /** Récompense : clé de REWARDS (déblocage cosmétique Réussites). */
  reward?: string;
  /** Easter egg existant accordé avec ce palier (cadres de la page bio, badges ambassadeur). */
  linkedEgg?: string;
  /** Texte de récompense quand elle vient d'un easter egg lié. */
  rewardText?: string;
}

export interface SeriesDef {
  id: string;
  category: ReussiteCategory;
  emoji: string;
  name: string;
  metric: MetricId;
  /** Unité affichée dans la progression (« 14 / 25 vidéos »). */
  unit: string;
  /** Précision affichée sous la barre (ex. « sur n'importe lequel de vos comptes »). */
  note?: string;
  tiers: TierDef[];
}

export const SERIES: SeriesDef[] = [
  // Publication (12)
  {
    id: "first-post",
    category: "publication",
    emoji: "🚀",
    name: "Premier décollage",
    metric: "publishedPosts",
    unit: "publication",
    tiers: [{ key: "first-post", target: 1, xp: 50, description: "Publier votre première publication" }]
  },
  {
    id: "posts",
    category: "publication",
    emoji: "📣",
    name: "Publications",
    metric: "publishedPosts",
    unit: "publications",
    tiers: [
      { key: "posts-10", target: 10, xp: 60, description: "Publier 10 publications", reward: "ach:bg-premiere-lumiere" },
      { key: "posts-50", target: 50, xp: 100, description: "Publier 50 publications" },
      { key: "posts-100", target: 100, xp: 150, description: "Publier 100 publications", reward: "ach:ring-or" },
      { key: "posts-250", target: 250, xp: 200, description: "Publier 250 publications" },
      { key: "posts-500", target: 500, xp: 250, description: "Publier 500 publications" }
    ]
  },
  {
    id: "videos",
    category: "publication",
    emoji: "🎬",
    name: "Réalisateur",
    metric: "publishedVideos",
    unit: "vidéos",
    tiers: [
      { key: "videos-5", target: 5, xp: 60, description: "Publier 5 vidéos" },
      { key: "videos-25", target: 25, xp: 100, description: "Publier 25 vidéos", reward: "ach:bg-constellation" },
      { key: "videos-100", target: 100, xp: 180, description: "Publier 100 vidéos" }
    ]
  },
  {
    id: "photos",
    category: "publication",
    emoji: "📸",
    name: "Photographe",
    metric: "publishedPhotos",
    unit: "photos ou carrousels",
    tiers: [
      { key: "photos-5", target: 5, xp: 60, description: "Publier 5 photos ou carrousels" },
      { key: "photos-25", target: 25, xp: 100, description: "Publier 25 photos ou carrousels" }
    ]
  },
  {
    id: "multi-network",
    category: "publication",
    emoji: "🌐",
    name: "Multi-réseaux",
    metric: "maxNetworksOnePost",
    unit: "réseaux",
    tiers: [{ key: "multi-network", target: 3, xp: 80, description: "Mettre une même publication en ligne sur 3 réseaux" }]
  },

  // Régularité (8)
  {
    id: "streak",
    category: "regularite",
    emoji: "🔥",
    name: "Rythme de croisière",
    metric: "bestWeekStreak",
    unit: "semaines",
    note: "Votre meilleure série compte : une semaine sans publication ne vous fait rien perdre.",
    tiers: [
      { key: "streak-4", target: 4, xp: 80, description: "Publier au moins une fois par semaine, 4 semaines d'affilée" },
      { key: "streak-8", target: 8, xp: 120, description: "Publier au moins une fois par semaine, 8 semaines d'affilée", reward: "ach:bg-galaxie-spirale" },
      { key: "streak-26", target: 26, xp: 200, description: "Publier au moins une fois par semaine, 26 semaines d'affilée" },
      { key: "streak-52", target: 52, xp: 300, description: "Publier au moins une fois par semaine, un an sans interruption" }
    ]
  },
  {
    id: "planner",
    category: "regularite",
    emoji: "🗓️",
    name: "Prévoyant",
    metric: "daysPlannedAhead",
    unit: "jours",
    note: "Des publications programmées sur chacun des 7 prochains jours.",
    tiers: [{ key: "planner", target: 7, xp: 100, description: "Avoir une publication programmée sur chacun des 7 prochains jours" }]
  },
  {
    id: "full-month",
    category: "regularite",
    emoji: "📆",
    name: "Mois complet",
    metric: "bestMonthPosts",
    unit: "publications",
    tiers: [{ key: "full-month", target: 12, xp: 120, description: "Mettre en ligne 12 publications dans un même mois" }]
  },
  {
    id: "challenges",
    category: "regularite",
    emoji: "⚡",
    name: "Défis",
    metric: "weeklyChallengesDone",
    unit: "défis",
    tiers: [
      { key: "challenges-10", target: 10, xp: 100, description: "Réussir 10 défis de la semaine" },
      { key: "challenges-30", target: 30, xp: 200, description: "Réussir 30 défis de la semaine" }
    ]
  },

  // Croissance (10)
  {
    id: "envol",
    category: "croissance",
    emoji: "📈",
    name: "Envol",
    metric: "bestGain90d",
    unit: "abonnés",
    note: "Meilleure progression sur 90 jours, sur un de vos comptes.",
    tiers: [{ key: "envol", target: 100, xp: 150, description: "Gagner 100 abonnés en moins de 90 jours sur un de vos comptes", reward: "ach:ring-bronze" }]
  },
  {
    id: "vertical",
    category: "croissance",
    emoji: "🛫",
    name: "Décollage vertical",
    metric: "bestGain90d",
    unit: "abonnés",
    note: "Meilleure progression sur 90 jours, sur un de vos comptes.",
    tiers: [{ key: "vertical", target: 1000, xp: 250, description: "Gagner 1 000 abonnés en moins de 90 jours sur un de vos comptes" }]
  },
  {
    id: "followers",
    category: "croissance",
    emoji: "👥",
    name: "Abonnés cumulés",
    metric: "followersTotal",
    unit: "abonnés",
    note: "Total de vos comptes connectés, au dernier relevé.",
    tiers: [
      { key: "followers-1k", target: 1_000, xp: 100, description: "Cumuler 1 000 abonnés sur vos comptes connectés", linkedEgg: "frame-eclipse-comete", rewardText: "Cadre « Comète » Éclipse (page bio)" },
      { key: "followers-10k", target: 10_000, xp: 200, description: "Cumuler 10 000 abonnés sur vos comptes connectés", linkedEgg: "frame-eclipse-orbites", rewardText: "Cadre « Orbites » Éclipse (page bio)" },
      { key: "followers-100k", target: 100_000, xp: 300, description: "Cumuler 100 000 abonnés sur vos comptes connectés", linkedEgg: "frame-eclipse-metal", rewardText: "Cadre « Acier noir » Éclipse (page bio)" }
    ]
  },
  {
    id: "likes",
    category: "croissance",
    emoji: "❤️",
    name: "J'aime cumulés",
    metric: "likesTotal",
    unit: "j'aime",
    note: "Sur l'ensemble de vos publications suivies dans Engagements.",
    tiers: [
      { key: "likes-1k", target: 1_000, xp: 100, description: "Cumuler 1 000 j'aime sur vos publications", linkedEgg: "frame-or-comete", rewardText: "Cadre « Comète » dorée (page bio)" },
      { key: "likes-10k", target: 10_000, xp: 200, description: "Cumuler 10 000 j'aime sur vos publications", linkedEgg: "frame-or-orbites", rewardText: "Cadre « Orbites » dorées (page bio)" },
      { key: "likes-100k", target: 100_000, xp: 300, description: "Cumuler 100 000 j'aime sur vos publications", linkedEgg: "frame-or-metal", rewardText: "Cadre « Feuille d'or » (page bio)" }
    ]
  },
  {
    id: "coup-de-coeur",
    category: "croissance",
    emoji: "💘",
    name: "Coup de cœur",
    metric: "bestEngagementPct",
    unit: "% d'engagement",
    note: "Meilleure publication vue au moins 200 fois : (j'aime + commentaires + partages) ÷ vues.",
    tiers: [{ key: "coup-de-coeur", target: 5, xp: 120, description: "Une publication à plus de 5 % d'engagement" }]
  },
  {
    id: "viral",
    category: "croissance",
    emoji: "👀",
    name: "Viral",
    metric: "maxViews",
    unit: "vues",
    note: "Votre publication la plus vue.",
    tiers: [{ key: "viral", target: 10_000, xp: 150, description: "Une publication vue 10 000 fois" }]
  },

  // Communauté (8)
  {
    id: "first-thread",
    category: "communaute",
    emoji: "💬",
    name: "Première prise de parole",
    metric: "forumThreads",
    unit: "sujet",
    tiers: [{ key: "first-thread", target: 1, xp: 50, description: "Ouvrir un sujet dans le forum de la Communauté" }]
  },
  {
    id: "voice",
    category: "communaute",
    emoji: "🗣️",
    name: "Voix de la communauté",
    metric: "forumRepliedThreads",
    unit: "sujets",
    note: "Réponses d'au moins 20 caractères, aux sujets des autres.",
    tiers: [
      { key: "voice-10", target: 10, xp: 60, description: "Répondre à 10 sujets du forum" },
      { key: "voice-50", target: 50, xp: 150, description: "Répondre à 50 sujets du forum" }
    ]
  },
  {
    id: "appreciated",
    category: "communaute",
    emoji: "🌟",
    name: "Apprécié",
    metric: "reactionsReceived",
    unit: "réactions",
    note: "Réactions des autres membres sur vos sujets et réponses.",
    tiers: [{ key: "appreciated", target: 25, xp: 100, description: "Recevoir 25 réactions sur vos messages" }]
  },
  {
    id: "ambassador",
    category: "communaute",
    emoji: "🤝",
    name: "Ambassadeur",
    metric: "confirmedReferrals",
    unit: "filleuls abonnés",
    note: "Personnes abonnées grâce à votre lien de parrainage (comptées 30 jours après leur premier paiement).",
    tiers: [
      { key: "ambassador-5", target: 5, xp: 100, description: "Faire abonner 5 personnes avec votre lien", linkedEgg: "ambassador-bronze", rewardText: "Badge « Ambassadeur bronze » (profil)" },
      { key: "ambassador-10", target: 10, xp: 150, description: "Faire abonner 10 personnes avec votre lien", linkedEgg: "ambassador-silver", rewardText: "Badge « Ambassadeur argent » (profil)" },
      { key: "ambassador-25", target: 25, xp: 250, description: "Faire abonner 25 personnes avec votre lien", linkedEgg: "ambassador-gold", rewardText: "Badge « Ambassadeur or » (profil)" },
      { key: "ambassador-50", target: 50, xp: 400, description: "Faire abonner 50 personnes avec votre lien", linkedEgg: "ambassador-legend", rewardText: "Badge « Ambassadeur légendaire » (profil)" }
    ]
  },

  // Page bio (4)
  {
    id: "bio-live",
    category: "bio",
    emoji: "🔗",
    name: "Vitrine",
    metric: "bioPublished",
    unit: "page publiée",
    tiers: [{ key: "bio-live", target: 1, xp: 50, description: "Publier votre page bio" }]
  },
  {
    id: "bio-clicks",
    category: "bio",
    emoji: "🧭",
    name: "Carrefour",
    metric: "bioClicks",
    unit: "clics",
    note: "Clics sur les liens de vos pages bio.",
    tiers: [
      { key: "bio-clicks-100", target: 100, xp: 80, description: "Atteindre 100 clics sur votre page bio" },
      { key: "bio-clicks-1000", target: 1_000, xp: 150, description: "Atteindre 1 000 clics sur votre page bio", reward: "ach:frame-carrefour" },
      { key: "bio-clicks-10000", target: 10_000, xp: 300, description: "Atteindre 10 000 clics sur votre page bio" }
    ]
  }
];

export interface FlatTier extends TierDef {
  series: SeriesDef;
  /** Rang du palier dans sa série (1…n). */
  rank: number;
  title: string;
}

export const ALL_TIERS: FlatTier[] = SERIES.flatMap((s) =>
  s.tiers.map((t, i) => ({ ...t, series: s, rank: i + 1, title: s.tiers.length > 1 ? `${s.name} · palier ${i + 1}` : s.name }))
);

export const TOTAL_ACCOMPLISHMENTS = ALL_TIERS.length;

export function findTier(key: string): FlatTier | undefined {
  return ALL_TIERS.find((t) => t.key === key);
}

/** Easter eggs devenus des accomplissements (hors XP des easter eggs, hors liste Succès). */
export const LINKED_EGG_KEYS: string[] = ALL_TIERS.map((t) => t.linkedEgg).filter((k): k is string => Boolean(k));

/** XP d'un easter egg trouvé (bonus). */
export const EGG_XP = 10;

// --- Récompenses -------------------------------------------------------------

export type RewardKind = "ring" | "background" | "frame";

export interface RewardDef {
  /** Clé de déblocage, utilisée comme requiresEgg dans cosmetics.ts, backgrounds.ts et bio-frames.ts. */
  key: string;
  label: string;
  kind: RewardKind;
  /** Déblocages (accomplissements ou niveaux) qui l'accordent — un seul suffit. */
  grantedBy: string[];
  /** Cosmétique activé automatiquement au déblocage (anneaux). */
  autoCosmetic?: string;
}

export const REWARDS: RewardDef[] = [
  { key: "ach:ring-bronze", label: "Anneau d'avatar bronze", kind: "ring", grantedBy: ["envol"], autoCosmetic: "anneau-bronze-avatar" },
  { key: "ach:ring-argent", label: "Anneau d'avatar argent", kind: "ring", grantedBy: [levelKey(5)], autoCosmetic: "anneau-argent-avatar" },
  { key: "ach:ring-or", label: "Anneau d'avatar or", kind: "ring", grantedBy: ["posts-100"], autoCosmetic: "anneau-or-avatar" },
  { key: "ach:ring-stellaire", label: "Anneau stellaire animé", kind: "ring", grantedBy: [levelKey(8)], autoCosmetic: "anneau-stellaire-avatar" },
  { key: "ach:bg-premiere-lumiere", label: "Fond « Première lumière »", kind: "background", grantedBy: ["posts-10", levelKey(3)] },
  { key: "ach:bg-constellation", label: "Fond « Constellation »", kind: "background", grantedBy: ["videos-25"] },
  { key: "ach:bg-galaxie-spirale", label: "Fond « Galaxie spirale »", kind: "background", grantedBy: ["streak-8"] },
  { key: "ach:frame-carrefour", label: "Cadre de page bio « Carrefour »", kind: "frame", grantedBy: ["bio-clicks-1000"] },
  { key: "ach:frame-astre", label: "Cadre de page bio « Astre »", kind: "frame", grantedBy: [levelKey(7)] }
];

export const ALL_REWARD_KEYS = REWARDS.map((r) => r.key);

export function isReussiteRewardKey(key: string | null | undefined): boolean {
  return Boolean(key && key.startsWith("ach:"));
}

export function findReward(key: string): RewardDef | undefined {
  return REWARDS.find((r) => r.key === key);
}

/** Récompenses accordées par un ensemble de déblocages (clés AchievementUnlock). */
export function rewardKeysFromUnlocks(unlocked: Iterable<string>): string[] {
  const set = new Set(unlocked);
  return REWARDS.filter((r) => r.grantedBy.some((k) => set.has(k))).map((r) => r.key);
}

/** Texte de récompense d'un palier (récompense Réussites ou easter egg lié). */
export function tierRewardText(t: TierDef): string | null {
  if (t.reward) return findReward(t.reward)?.label ?? null;
  return t.rewardText ?? null;
}

// Anneaux d'avatar : du plus modeste au plus prestigieux (le plus haut
// activé s'affiche).
export const RING_COSMETICS = ["anneau-bronze-avatar", "anneau-argent-avatar", "anneau-or-avatar", "anneau-stellaire-avatar"] as const;
export type RingCosmetic = (typeof RING_COSMETICS)[number];
export type RingStyle = "bronze" | "argent" | "or" | "stellaire";

export function ringFromCosmetics(enabled: Iterable<string>): RingStyle | null {
  const set = new Set(enabled);
  const best = [...RING_COSMETICS].reverse().find((k) => set.has(k));
  return best ? (best.replace("anneau-", "").replace("-avatar", "") as RingStyle) : null;
}

// --- Défis ------------------------------------------------------------------

export type ChallengeMetric =
  | "posts"
  | "videos"
  | "photos"
  | "multiNetworkPosts"
  | "distinctDays"
  | "weekendScheduled"
  | "plannedAhead"
  | "communityReplies"
  | "firstComments"
  | "distinctNetworks";

export interface ChallengeDef {
  key: string;
  kind: "WEEKLY" | "MONTHLY";
  title: string;
  description: string;
  metric: ChallengeMetric;
  target: number;
  xp: number;
}

export const WEEKLY_CHALLENGES: ChallengeDef[] = [
  { key: "publish-3", kind: "WEEKLY", title: "Publier 3 fois cette semaine", description: "Sur n'importe quel réseau", metric: "posts", target: 3, xp: 50 },
  { key: "publish-video", kind: "WEEKLY", title: "Publier une vidéo", description: "Reel, Short, TikTok ou vidéo YouTube", metric: "videos", target: 1, xp: 30 },
  { key: "schedule-weekend", kind: "WEEKLY", title: "Programmer une publication pour le week-end", description: "Préparez à l'avance, profitez de votre samedi", metric: "weekendScheduled", target: 1, xp: 30 },
  { key: "publish-photo", kind: "WEEKLY", title: "Publier une photo ou un carrousel", description: "Une image vaut mille mots", metric: "photos", target: 1, xp: 30 },
  { key: "two-networks", kind: "WEEKLY", title: "Publier sur 2 réseaux à la fois", description: "Une même publication en ligne sur 2 réseaux", metric: "multiNetworkPosts", target: 1, xp: 40 },
  { key: "two-days", kind: "WEEKLY", title: "Publier sur 2 jours différents", description: "La régularité avant la quantité", metric: "distinctDays", target: 2, xp: 40 },
  { key: "plan-ahead", kind: "WEEKLY", title: "Programmer 3 publications d'avance", description: "Au moins 24 h avant leur mise en ligne", metric: "plannedAhead", target: 3, xp: 40 },
  { key: "community-reply", kind: "WEEKLY", title: "Aider quelqu'un dans la Communauté", description: "Répondre à un sujet du forum", metric: "communityReplies", target: 1, xp: 30 },
  { key: "first-comment", kind: "WEEKLY", title: "Lancer la conversation", description: "Publier avec un premier commentaire", metric: "firstComments", target: 1, xp: 30 }
];

// Trois défis par semaine, en rotation fixe (les mêmes pour tout le monde) :
// toujours un défi de publication, un de format, un d'organisation ou de
// communauté.
const WEEKLY_ROTATION: [string, string, string][] = [
  ["publish-3", "publish-video", "schedule-weekend"],
  ["two-days", "publish-photo", "community-reply"],
  ["publish-3", "two-networks", "plan-ahead"],
  ["two-days", "publish-video", "first-comment"],
  ["publish-3", "publish-photo", "schedule-weekend"],
  ["two-days", "two-networks", "community-reply"],
  ["publish-3", "publish-video", "plan-ahead"],
  ["two-days", "first-comment", "publish-photo"]
];

export const MONTHLY_CHALLENGES: ChallengeDef[] = [
  { key: "month-12", kind: "MONTHLY", title: "12 publications", description: "Mettre en ligne 12 publications ce mois-ci", metric: "posts", target: 12, xp: 120 },
  { key: "month-8-days", kind: "MONTHLY", title: "8 jours de publication", description: "Publier sur 8 jours différents ce mois-ci", metric: "distinctDays", target: 8, xp: 120 },
  { key: "month-4-videos", kind: "MONTHLY", title: "4 vidéos", description: "Mettre en ligne 4 vidéos ce mois-ci", metric: "videos", target: 4, xp: 120 },
  { key: "month-3-networks", kind: "MONTHLY", title: "3 réseaux", description: "Publier sur 3 réseaux différents ce mois-ci", metric: "distinctNetworks", target: 3, xp: 120 }
];

export function findChallenge(key: string): ChallengeDef | undefined {
  return [...WEEKLY_CHALLENGES, ...MONTHLY_CHALLENGES].find((c) => c.key === key);
}

/** Défis de la semaine n° weekIndex (semaines comptées depuis le lundi 5 janvier 1970). */
export function weeklyChallengesFor(weekIndex: number): ChallengeDef[] {
  const keys = WEEKLY_ROTATION[((weekIndex % WEEKLY_ROTATION.length) + WEEKLY_ROTATION.length) % WEEKLY_ROTATION.length];
  return keys.map((k) => WEEKLY_CHALLENGES.find((c) => c.key === k)!);
}

/** Défi du mois (monthIndex = année × 12 + mois 0–11). */
export function monthlyChallengeFor(monthIndex: number): ChallengeDef {
  return MONTHLY_CHALLENGES[((monthIndex % MONTHLY_CHALLENGES.length) + MONTHLY_CHALLENGES.length) % MONTHLY_CHALLENGES.length];
}

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « Septembre 2026 » à partir de « 2026-09 ». */
export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const name = MONTHS_FR[(m || 1) - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

/** « de septembre » / « d'août » / « d'octobre » (défi du mois). */
export function monthOfLabel(period: string): string {
  const m = Number(period.split("-")[1]) || 1;
  const name = MONTHS_FR[m - 1];
  return /^[aeiouéè]/i.test(name) ? `d'${name}` : `de ${name}`;
}
