// Missions de la semaine (Réussites v2, 26/09/2026) — catalogue et règles de
// choix. Importable côté client ET serveur (aucune dépendance à Prisma) ; la
// mesure sur les vraies données vit dans engine.ts.
//
// Chaque semaine (lundi 00:00 → dimanche, heure de Paris), chaque compte
// reçoit 3 missions, figées pour la semaine :
//  - Habitude : publier, avec un objectif réglé sur SON rythme (médiane des
//    4 dernières semaines + 1, « semaine douce » après 2 semaines vides) ;
//  - Progression : au choix parmi 3 propositions, un changement permis ;
//  - Mystère : révélée quand les deux autres sont réussies, ou le jeudi.
// Jamais de mission impossible : seulement les réseaux connectés, les
// sources d'import configurées, et ce qui n'est pas déjà fait.
// Les clés sont stockées en base : ne jamais les renommer.

export type MissionSlot = "habit" | "progress" | "mystery";

/** Mesures d'une semaine (voir engine.ts → missionValues). */
export type MissionMetric =
  | "posts"
  | "days"
  | "earlyPost"
  | "videos"
  | "photos"
  | "multi2"
  | "multi3"
  | "plannedAhead"
  | "weekendScheduled"
  | "next3Days"
  | "importedPosts"
  | "reusedPosts"
  | "firstComments"
  | "communityReplies"
  | "sharedVideos"
  | "bioReady";

/** Ce que l'on sait du compte au moment de choisir ses missions. */
export interface MissionContext {
  /** Réseaux connectés (toutes marques du compte). */
  networks: string[];
  /** Au moins une source d'import configurée (Drive, Dropbox, OneDrive, Unsplash, Canva). */
  importSources: boolean;
  /** Un média publié il y a plus de 30 jours (republication possible). */
  hasOldMedia: boolean;
  /** Page bio déjà publiée avec 3 liens ou plus. */
  bioReady: boolean;
}

export interface MissionDef {
  key: string;
  slot: MissionSlot;
  metric: MissionMetric;
  /** Objectif fixe ; pour les missions Habitude, calculé chaque semaine. */
  target: number;
  xp: number;
  title: (target: number) => string;
  description: string;
  /** Compétence travaillée (affichage ; la constellation arrive au lot B). */
  skill: "Régularité" | "Formats vidéo" | "Portée" | "Communauté" | "Stratégie";
  href: string;
  action: string;
  eligible?: (ctx: MissionContext) => boolean;
}

const IMAGE_NETWORKS = ["INSTAGRAM", "FACEBOOK", "PINTEREST", "THREADS", "LINKEDIN", "BLUESKY"];
const FIRST_COMMENT_NETWORKS = ["INSTAGRAM", "FACEBOOK", "THREADS", "LINKEDIN", "BLUESKY"];
const distinct = (ctx: MissionContext) => new Set(ctx.networks).size;

export const MISSIONS: MissionDef[] = [
  // Habitude (objectif réglé chaque semaine).
  {
    key: "habit-posts",
    slot: "habit",
    metric: "posts",
    target: 1,
    xp: 30,
    title: (n) => `Publier ${n} fois cette semaine`,
    description: "Réglé sur votre rythme habituel, plus un petit pas. Au plus 2 publications comptées par jour.",
    skill: "Régularité",
    href: "/composer",
    action: "Publier"
  },
  {
    key: "habit-days",
    slot: "habit",
    metric: "days",
    target: 2,
    xp: 30,
    title: (n) => `Publier sur ${n} jours différents`,
    description: "La régularité avant la quantité : étalez vos publications dans la semaine.",
    skill: "Régularité",
    href: "/calendar",
    action: "Ouvrir le calendrier"
  },
  {
    key: "habit-early",
    slot: "habit",
    metric: "earlyPost",
    target: 1,
    xp: 30,
    title: () => "Publier avant mercredi",
    description: "Une publication lundi ou mardi : la semaine est lancée.",
    skill: "Régularité",
    href: "/composer",
    action: "Publier"
  },

  // Progression (au choix parmi 3).
  {
    key: "prog-multi3",
    slot: "progress",
    metric: "multi3",
    target: 1,
    xp: 80,
    title: () => "Publier une même publication sur 3 réseaux",
    description: "Une vidéo bien adaptée touche trois publics pour le même effort.",
    skill: "Formats vidéo",
    href: "/composer",
    action: "Publier",
    eligible: (ctx) => distinct(ctx) >= 3
  },
  {
    key: "prog-multi2",
    slot: "progress",
    metric: "multi2",
    target: 1,
    xp: 60,
    title: () => "Publier une même publication sur 2 réseaux",
    description: "Réutilisez votre meilleur contenu au lieu de repartir de zéro.",
    skill: "Formats vidéo",
    href: "/composer",
    action: "Publier",
    eligible: (ctx) => distinct(ctx) === 2
  },
  {
    key: "prog-videos",
    slot: "progress",
    metric: "videos",
    target: 2,
    xp: 60,
    title: () => "Publier 2 vidéos",
    description: "Reels, Shorts, TikTok ou vidéos YouTube : la vidéo reste le format le plus vu.",
    skill: "Formats vidéo",
    href: "/composer",
    action: "Publier une vidéo",
    eligible: (ctx) => ctx.networks.length > 0
  },
  {
    key: "prog-import",
    slot: "progress",
    metric: "importedPosts",
    target: 1,
    xp: 80,
    title: () => "Publier un média importé",
    description: "Importez une vidéo ou une image depuis Canva, Google Drive, Dropbox, OneDrive ou Unsplash, puis publiez-la.",
    skill: "Formats vidéo",
    href: "/composer",
    action: "Importer un média",
    eligible: (ctx) => ctx.importSources && ctx.networks.length > 0
  },
  {
    key: "prog-plan3",
    slot: "progress",
    metric: "plannedAhead",
    target: 3,
    xp: 60,
    title: () => "Programmer 3 publications à l'avance",
    description: "Au moins 24 h avant leur mise en ligne : votre semaine tourne sans vous.",
    skill: "Régularité",
    href: "/calendar",
    action: "Programmer"
  },
  {
    key: "prog-next3",
    slot: "progress",
    metric: "next3Days",
    target: 3,
    xp: 60,
    title: () => "Couvrir vos 3 prochains jours",
    description: "Une publication programmée sur chacun des 3 prochains jours.",
    skill: "Régularité",
    href: "/calendar",
    action: "Ouvrir le calendrier"
  },
  {
    key: "prog-reuse",
    slot: "progress",
    metric: "reusedPosts",
    target: 1,
    xp: 70,
    title: () => "Redonner vie à un ancien contenu",
    description: "Republiez un média déjà publié il y a plus d'un mois : votre audience a changé depuis.",
    skill: "Stratégie",
    href: "/publications",
    action: "Choisir un contenu",
    eligible: (ctx) => ctx.hasOldMedia && ctx.networks.length > 0
  },
  {
    key: "prog-photos",
    slot: "progress",
    metric: "photos",
    target: 2,
    xp: 60,
    title: () => "Publier 2 photos ou carrousels",
    description: "Les images se partagent et s'enregistrent : parfaites entre deux vidéos.",
    skill: "Formats vidéo",
    href: "/composer",
    action: "Publier",
    eligible: (ctx) => ctx.networks.some((n) => IMAGE_NETWORKS.includes(n))
  },

  // Mystère (révélée au bon moment).
  {
    key: "mys-first-comment",
    slot: "mystery",
    metric: "firstComments",
    target: 1,
    xp: 40,
    title: () => "Lancer la conversation",
    description: "Publiez avec un premier commentaire (une question à votre audience, par exemple).",
    skill: "Communauté",
    href: "/composer",
    action: "Publier",
    eligible: (ctx) => ctx.networks.some((n) => FIRST_COMMENT_NETWORKS.includes(n))
  },
  {
    key: "mys-community",
    slot: "mystery",
    metric: "communityReplies",
    target: 1,
    xp: 60,
    title: () => "Aider un autre créateur",
    description: "Répondez à un sujet de la Communauté (au moins 20 caractères).",
    skill: "Communauté",
    href: "/community",
    action: "Ouvrir la Communauté"
  },
  {
    key: "mys-share",
    slot: "mystery",
    metric: "sharedVideos",
    target: 1,
    xp: 50,
    title: () => "Montrer votre travail",
    description: "Partagez une de vos vidéos déjà publiées dans la Communauté.",
    skill: "Communauté",
    href: "/community",
    action: "Partager une vidéo",
    eligible: (ctx) => ctx.networks.length > 0
  },
  {
    key: "mys-weekend",
    slot: "mystery",
    metric: "weekendScheduled",
    target: 1,
    xp: 40,
    title: () => "Préparer le week-end",
    description: "Programmez une publication pour samedi ou dimanche, et profitez de votre week-end.",
    skill: "Régularité",
    href: "/calendar",
    action: "Programmer"
  },
  {
    key: "mys-bio",
    slot: "mystery",
    metric: "bioReady",
    target: 1,
    xp: 80,
    title: () => "Publier votre page bio",
    description: "Une page bio publiée avec au moins 3 liens : tous vos contenus à un seul endroit.",
    skill: "Stratégie",
    href: "/link-in-bio",
    action: "Ouvrir la page bio",
    eligible: (ctx) => !ctx.bioReady
  },
  {
    key: "mys-import",
    slot: "mystery",
    metric: "importedPosts",
    target: 1,
    xp: 60,
    title: () => "Essayer l'import",
    description: "Publiez une vidéo ou une image importée depuis Canva, Google Drive, Dropbox, OneDrive ou Unsplash.",
    skill: "Formats vidéo",
    href: "/composer",
    action: "Importer un média",
    eligible: (ctx) => ctx.importSources && ctx.networks.length > 0
  }
];

export function findMission(key: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.key === key);
}

/** Titre d'une mission avec son objectif de la semaine. */
export function missionTitle(key: string, target: number): string {
  const def = findMission(key);
  return def ? def.title(target) : "Mission";
}

export const MAX_SWAPS = 1;
export const SLOT_ORDER: MissionSlot[] = ["habit", "progress", "mystery"];
export const SLOT_LABEL: Record<MissionSlot, string> = { habit: "Habitude", progress: "Progression", mystery: "Mystère" };
export const missionCompletionKey = (slot: MissionSlot) => `mission-${slot}`;

// --- Objectif Habitude ------------------------------------------------------------

/**
 * Objectif de la mission Habitude à partir des publications des 4 dernières
 * semaines terminées (au plus 2 comptées par jour), de la plus ancienne à la
 * plus récente. Médiane + 1, entre 1 et le plafond du palier (Gratuit : 4 par
 * semaine, 20 publications programmées par mois ; payant : 7). « Semaine
 * douce » (objectif 1) après 2 semaines sans publication.
 */
export function habitTargetFor(lastWeeks: number[], plan: string): { target: number; gentle: boolean } {
  const cap = plan === "FREE" ? 4 : 7;
  const weeks = lastWeeks.slice(-4);
  if (weeks.length === 0 || weeks.every((n) => n === 0)) return { target: 1, gentle: weeks.length > 0 };
  const lastTwo = weeks.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((n) => n === 0)) return { target: 1, gentle: true };
  const sorted = [...weeks].sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  const median = sorted.length % 2 === 0 ? Math.floor((sorted[mid] + sorted[mid + 1]) / 2) : sorted[mid];
  return { target: Math.max(1, Math.min(cap, median + 1)), gentle: false };
}

// --- Choix de la semaine ----------------------------------------------------------

/** Petit générateur pseudo-aléatoire reproductible (même compte + même semaine = même tirage). */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface WeeklyPick {
  habitKey: string;
  habitTarget: number;
  choices: string[];
  progressKey: string;
  mysteryKey: string;
}

/**
 * Missions d'une semaine pour un compte. Reproductible (même entrée = même
 * résultat). La progression choisie la semaine précédente n'est pas
 * reproposée si d'autres missions sont possibles ; les 3 propositions
 * couvrent des compétences différentes quand c'est possible.
 */
export function pickWeeklyMissions(input: {
  userId: string;
  weekId: string;
  weekIndex: number;
  ctx: MissionContext;
  habitTarget: number;
  /** Jours restants dans la semaine, aujourd'hui compris (7 le lundi, 1 le dimanche). */
  daysLeft?: number;
  previousProgressKey?: string | null;
  previousMysteryKey?: string | null;
}): WeeklyPick {
  const rand = seeded(`${input.userId}:${input.weekId}`);
  const ok = (m: MissionDef) => !m.eligible || m.eligible(input.ctx);

  // Habitude : alterne d'une semaine à l'autre pour varier, et reste
  // faisable quand la semaine commence tard (première visite un jeudi…) :
  // « avant mercredi » seulement le lundi ou le mardi, au plus un jour de
  // publication par jour restant, au plus 2 publications comptées par jour.
  const odd = Math.abs(input.weekIndex) % 2 === 1;
  const daysLeft = Math.max(1, Math.min(7, input.daysLeft ?? 7));
  const n = input.habitTarget;
  let habitKey = n <= 1 ? (odd ? "habit-early" : "habit-posts") : odd ? "habit-days" : "habit-posts";
  if (habitKey === "habit-early" && daysLeft < 6) habitKey = "habit-posts";
  if (habitKey === "habit-days" && daysLeft < 2) habitKey = "habit-posts";
  const habitTarget = habitKey === "habit-early" ? 1 : habitKey === "habit-days" ? Math.min(n, 5, daysLeft) : Math.max(1, Math.min(n, 2 * daysLeft));

  // Progression : 3 propositions, compétences variées.
  let pool = MISSIONS.filter((m) => m.slot === "progress" && ok(m));
  if (pool.length > 3 && input.previousProgressKey) pool = pool.filter((m) => m.key !== input.previousProgressKey);
  const ordered = shuffled(pool, rand);
  const choices: MissionDef[] = [];
  for (const m of ordered) if (choices.length < 3 && !choices.some((c) => c.skill === m.skill)) choices.push(m);
  for (const m of ordered) if (choices.length < 3 && !choices.includes(m)) choices.push(m);

  // Mystère : jamais la même que la semaine dernière, jamais un doublon de
  // la progression proposée (même mesure).
  let mysteries = MISSIONS.filter((m) => m.slot === "mystery" && ok(m) && !choices.some((c) => c.metric === m.metric));
  if (mysteries.length > 1 && input.previousMysteryKey) mysteries = mysteries.filter((m) => m.key !== input.previousMysteryKey);
  const mystery = shuffled(mysteries, rand)[0] ?? MISSIONS.find((m) => m.key === "mys-weekend")!;

  return {
    habitKey,
    habitTarget,
    choices: choices.map((c) => c.key),
    progressKey: choices[0]?.key ?? "prog-plan3",
    mysteryKey: mystery.key
  };
}

// --- Coffre ------------------------------------------------------------------------

export const CHEST_XP = 40;
export const CHEST_BONUS_XP = 60;
export const MAX_SHIELDS = 2;

export type ChestItem = "shield" | "fragment" | "bonus" | "feature";
/** Objet réellement reçu : un bouclier devient des XP si la réserve est pleine. */
export type ChestResult = ChestItem | "shield-converted";

/** Chances affichées sous le coffre (total 100). Rien ne s'achète. */
// Lot C : « Vidéo à la une 7 jours » (5 %), un ticket à utiliser sur une
// vidéo partagée dans la Communauté (avec l'accord du créateur).
export const CHEST_TABLE: { item: ChestItem; label: string; chance: number }[] = [
  { item: "shield", label: "Bouclier de série", chance: 38 },
  { item: "fragment", label: "Fragment d'étoile filante", chance: 42 },
  { item: "bonus", label: `${CHEST_BONUS_XP} XP en plus`, chance: 15 },
  { item: "feature", label: "Vidéo à la une 7 jours", chance: 5 }
];

/** Objet correspondant à un tirage de 0 à 99. */
export function chestItemFromRoll(roll: number): ChestItem {
  let acc = 0;
  for (const row of CHEST_TABLE) {
    acc += row.chance;
    if (roll < acc) return row.item;
  }
  return "bonus";
}

export function chestItemLabel(item: string | null | undefined): string {
  if (item === "shield-converted") return `${CHEST_BONUS_XP} XP en plus (boucliers déjà au maximum)`;
  return CHEST_TABLE.find((r) => r.item === item)?.label ?? "Objet";
}
