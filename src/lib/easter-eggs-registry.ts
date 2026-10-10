// Registre central des easter eggs du site — SEULE source de vérité pour
// leurs clés stables (utilisées en base via EasterEggFound.key), leur ordre
// d'affichage et leur texte. Importable côté client ET côté serveur (aucune
// dépendance à Prisma ici) : la page /succes s'en sert pour l'affichage, les
// routes API pour valider une clé reçue.
//
// Ajouter un nouvel easter egg au site ? Il suffit d'ajouter une entrée ici,
// dans le bon bloc (voir plus bas : collection, à récompense ou devenu un
// accomplissement ; le numéro se calcule tout seul) — clé unique, jamais
// renommée ensuite, elle est stockée en base — puis
// d'appeler reportEasterEggFound("ma-cle") côté client, ou
// markEasterEggFound(userId, "ma-cle") côté serveur, au moment où on le
// détecte.

export interface EasterEggDef {
  key: string;
  /** Place dans la liste (1, 2, 3…), calculée : jamais écrite à la main. */
  number: number;
  emoji: string;
  title: string;
  // Révélé uniquement une fois l'easter egg trouvé — jamais envoyé au client
  // pour les entrées non trouvées (voir /api/easter-eggs), pour ne pas
  // vendre la mèche.
  hint: string;
  // Présent UNIQUEMENT quand trouver cet easter egg débloque quelque chose
  // de concret (un thème, un cosmétique...) plutôt qu'une simple ligne dans
  // la liste des succès. Contrairement au titre/indice, le NOM de la
  // récompense est révélé même avant d'avoir trouvé l'egg (voir
  // /api/easter-eggs et la page /succes) : ça donne un objectif clair sans
  // dévoiler comment l'obtenir. Ces entrées sont affichées à part, sans
  // numéro, à la fin de la collection (bloc REWARD_EGGS ci-dessous).
  reward?: string;
  // Succès TOTALEMENT caché : même le nom de la récompense n'est révélé
  // qu'une fois trouvé (voir /api/easter-eggs). Avant, il s'affiche comme
  // n'importe quel easter egg numéroté, en « ? ».
  secret?: boolean;
  // Déclenché UNIQUEMENT par le serveur (seuils d'audience calculés depuis
  // la base, voir src/lib/easter-eggs/audience.ts) : refusé par
  // POST /api/easter-eggs/found, pour qu'on ne puisse pas se l'attribuer
  // depuis le navigateur.
  serverOnly?: boolean;
}

// Numéros SANS TROU (10/10/2026, demande de Lucas) : le numéro d'un easter
// egg n'est plus écrit à la main, il vient de sa place dans la liste
// (1, 2, 3…). Retirer ou ajouter une entrée ne peut donc jamais laisser de
// trou. Le numéro ne sert qu'à l'affichage (« Easter egg #12 ») : seule la
// CLÉ est enregistrée en base. Trois blocs, dans cet ordre, pour que chaque
// liste affichée se suive :
//  1. COLLECTION : la grille numérotée de la collection (/reussites/collection),
//     dans l'ordre d'affichage — easter eggs sans récompense, plus les deux
//     cadres ultimes secrets (affichés en « ? » comme les autres) ;
//  2. REWARD_EGGS : les easter eggs à récompense, affichés à part sans numéro
//     (le nom de la récompense est visible avant d'être trouvé) ;
//  3. ACHIEVEMENT_EGGS : ceux devenus des accomplissements de Réussites
//     (cadres d'audience, paliers ambassadeur — LINKED_EGG_KEYS de
//     reussites/catalog.ts), absents de la collection.
// tests/quality/easter-eggs-concurrence.test.ts vérifie que chaque entrée est
// dans le bon bloc.
//
// Retirés le 10/10/2026 (demande de Lucas) : « Qui es-tu ? », « Inbox zero »,
// « Banane », « Le sens de la vie » et « Merci beaucoup ». Leurs clés ne sont
// plus valides : les lignes déjà en base ne comptent plus nulle part
// (COLLECTION_EGG_KEYS dans reussites/catalog.ts).
type EggEntry = Omit<EasterEggDef, "number">;

/** 1. Grille numérotée de la collection, dans l'ordre d'affichage. */
const COLLECTION: EggEntry[] = [
  { key: "konami", emoji: "🕹️", title: "Code Konami", hint: "↑ ↑ ↓ ↓ ← → ← → B A, n'importe où sur le site." },
  { key: "nebula-word", emoji: "🌌", title: "Le mot secret", hint: "Tapez « nebula » au clavier, sans cliquer dans un champ de texte." },
  { key: "console-signature", emoji: "🖥️", title: "Message dans la console", hint: "Ouvrez la console de votre navigateur (F12) sur le tableau de bord et suivez l'indice." },
  { key: "logo-spin", emoji: "🌀", title: "Logo en surchauffe", hint: "Restez appuyé 3 secondes sur le logo, dans le menu latéral." },
  { key: "midnight-stars", emoji: "🌠", title: "Étoiles filantes", hint: "Ouvrez Nebula pile à minuit." },
  { key: "constellation", emoji: "🔭", title: "Constellation", hint: "Maj + clic sur le fond, une fois le thème étoilé activé." },
  { key: "lost-in-space", emoji: "🛰️", title: "Perdu dans l'espace", hint: "Tombez sur une page qui n'existe pas." },
  { key: "publish-milestone", emoji: "🎉", title: "Jalon de publications", hint: "Soyez présent·e quand Nebula franchit un cap de publications envoyées." },
  { key: "support-heartbeat", emoji: "💓", title: "Cœur qui s'emballe", hint: "Cliquez 5 fois d'affilée sur le cœur de la page Soutenir Nebula." },
  { key: "followers-1000", emoji: "🎖️", title: "Cap des 1000", hint: "Faites franchir les 1 000 abonnés à l'un de vos comptes connectés." },
  { key: "friday-13", emoji: "🐈‍⬛", title: "Vendredi 13", hint: "Utilisez Nebula un vendredi 13." },
  { key: "anniversary", emoji: "🎂", title: "Anniversaire", hint: "Utilisez Nebula le jour de l'anniversaire du site." },
  { key: "loading-minigame", emoji: "👾", title: "Petit jeu d'attente", hint: "Tombez sur le mini-jeu qui apparaît pendant un chargement un peu long." },
  { key: "theme-toggle-10x", emoji: "🌗", title: "Indécis·e", hint: "Basculez sombre/clair 10 fois de suite, rapidement." },
  { key: "hidden-comment", emoji: "📜", title: "Vu dans le code source", hint: "Ouvrez le code source d'une page qui en cache un (Ctrl/Cmd+U) et suivez l'indice." },
  { key: "command-palette-loop", emoji: "🎛️", title: "Palette compulsive", hint: "Ouvrez la palette de commandes (Cmd/Ctrl+K) 3 fois de suite en moins de 10 secondes." },
  { key: "early-bird-post", emoji: "🌙", title: "Lève-tôt malgré lui", hint: "Mettez une publication en ligne entre 3 h et 5 h du matin (heure du serveur)." },
  { key: "marathon-session", emoji: "⏳", title: "Marathon", hint: "Restez connecté·e en continu plus de 4 heures sur une même session." },
  { key: "avatar-double-tap", emoji: "❤️", title: "Double-tap", hint: "Double-cliquez rapidement sur votre avatar, dans le menu du profil (en haut à droite)." },
  { key: "cursor-statue", emoji: "🖱️", title: "Statue", hint: "Laissez le curseur totalement immobile pendant 60 secondes sur le dashboard." },
  { key: "extreme-zoom", emoji: "🔍", title: "Zoom extrême", hint: "Zoomez le navigateur à 400% ou plus." },
  { key: "composer-disabled-clicks", emoji: "🚫", title: "Le bouton qui résiste", hint: "Cliquez 20 fois sur le bouton « Publier » de la page Publier alors qu'il est grisé (rien sélectionné)." },
  { key: "posts-100", emoji: "💯", title: "Centenaire", hint: "Mettez en ligne votre 100ᵉ publication avec Nebula (sur au moins un réseau)." },
  { key: "all-networks-connected", emoji: "🌐", title: "Tout connecté", hint: "Connectez les 6 réseaux disponibles en même temps sur une marque." },
  { key: "hashtag-nebula", emoji: "#️⃣", title: "Auto-référence", hint: "Mettez en ligne une publication dont la légende contient « #nebula »." },
  { key: "version-click", emoji: "🔢", title: "Auto-clic", hint: "Cliquez 5 fois sur le numéro de version, en bas du menu du profil." },
  { key: "keyboard-nav", emoji: "⌨️", title: "Navigation au clavier", hint: "Parcourez tout le menu latéral uniquement avec la touche Tab, sans souris, jusqu'au dernier bouton (« Réduire le menu »)." },
  { key: "multi-tab", emoji: "🪟", title: "Multi-fenêtres", hint: "Ouvrez Nebula dans 5 onglets du navigateur en même temps." },
  { key: "tab-switch-loop", emoji: "🔄", title: "Va-et-vient", hint: "Basculez entre deux onglets/fenêtres Nebula au moins 10 fois en 30 secondes." },
  { key: "meteor-shower-unlock", emoji: "☄️", title: "Pluie d'étincelles", hint: "Mettez en ligne 3 publications le même jour." },
  { key: "frame-ultime-nacre", emoji: "🦪", title: "Le million de cœurs", hint: "Cumulez 1 000 000 de j'aime sur l'ensemble de vos publications.", reward: "Cadre ultime « Nacre » (page bio)", secret: true, serverOnly: true },
  { key: "frame-ultime-prisme", emoji: "💎", title: "Le million", hint: "Cumulez 1 000 000 d'abonnés sur l'ensemble de vos comptes connectés.", reward: "Cadre ultime « Prisme » (page bio) et thème « Prisme »", secret: true, serverOnly: true }
];

/** 2. Easter eggs à récompense (thème, cosmétique, titre…), affichés à part. */
const REWARD_EGGS: EggEntry[] = [
  { key: "starfield-theme", emoji: "✨", title: "Ciel étoilé", hint: "Activez le thème étoilé animé dans Paramètres (palier Pro ou Agence).", reward: "Thème étoilé animé" },
  { key: "referral-crown", emoji: "👑", title: "Couronne du parrainage", hint: "Prenez la 1ʳᵉ place du classement des parrainages (filleuls abonnés).", reward: "Cadre « La couronne » (page bio)" },
  { key: "nova-theme", emoji: "🌟", title: "Thème Nova", hint: "Tapez « nova » dans Paramètres, sans cliquer dans un champ de texte.", reward: "Thème Nova" },
  { key: "followers-10k", emoji: "🥇", title: "Cap des 10K", hint: "Faites franchir les 10 000 abonnés à l'un de vos comptes connectés.", reward: "Badge doré « Cap des 10K »" },
  { key: "supernova-impressions", emoji: "💫", title: "Supernova analytique", hint: "Dépassez 1 million d'impressions cumulées (dernier relevé de chaque compte) sur une marque.", reward: "Fond de carte « Supernova » (Analytics)" },
  { key: "referral-crown-30d", emoji: "👑", title: "Couronne permanente", hint: "Restez en 1ʳᵉ place du classement de parrainage 30 jours consécutifs.", reward: "Cadre doré « Couronne permanente »" },
  { key: "original-20-found", emoji: "🏅", title: "Chasseur d'étoiles", hint: "Débloquez les 18 easter eggs d'origine du site.", reward: "Titre « Chasseur d'étoiles ⭐ »" },
  { key: "all-eggs-100pct", emoji: "🏆", title: "Complétion totale", hint: "Débloquez 100% des easter eggs existants.", reward: "Thème caché « Golden Nebula »" },
  { key: "zen-absolute", emoji: "🧘", title: "Zen absolu", hint: "Laissez le mini-jeu de chargement apparaître sans jamais sauter, jusqu'au premier game over.", reward: "Titre « Zen absolu 🧘 »" },
  { key: "publish-sound-unlock", emoji: "🚀", title: "Son Décollage", hint: "Mettez en ligne votre 10ᵉ publication, tout de suite ou programmée.", reward: "Décollage" },
  { key: "greeting-unlock", emoji: "👋", title: "Toujours à l'heure", hint: "Connectez-vous à peu près à la même heure, 3 jours consécutifs.", reward: "Cosmétique « Message d'accueil personnalisé »" },
  { key: "golden-glow-unlock", emoji: "🥇", title: "Éclat mérité", hint: "Faites franchir les 10 000 abonnés à l'un de vos comptes connectés.", reward: "Cosmétique « Éclat doré » (statistiques)" },
  {
    key: "sidebar-menu-mash-unlock",
    emoji: "🌌",
    title: "Poussière retrouvée",
    hint: "Ouvrez le menu latéral (☰) 7 fois de suite, en moins de 10 secondes.",
    reward: "Cosmétique « Poussière d'étoiles » (menu latéral)"
  }
];

/** 3. Devenus des accomplissements de Réussites (hors collection). */
const ACHIEVEMENT_EGGS: EggEntry[] = [
  { key: "frame-or-comete", emoji: "☄️", title: "Mille cœurs", hint: "Cumulez 1 000 j'aime sur l'ensemble de vos publications.", reward: "Cadre « Comète » dorée (page bio)", secret: true, serverOnly: true },
  { key: "frame-or-orbites", emoji: "💛", title: "Dix mille cœurs", hint: "Cumulez 10 000 j'aime sur l'ensemble de vos publications.", reward: "Cadre « Orbites » dorées (page bio)", secret: true, serverOnly: true },
  { key: "frame-or-metal", emoji: "🏵️", title: "Cent mille cœurs", hint: "Cumulez 100 000 j'aime sur l'ensemble de vos publications.", reward: "Cadre « Feuille d'or » (page bio)", secret: true, serverOnly: true },
  { key: "frame-eclipse-comete", emoji: "🌑", title: "Premier cercle", hint: "Cumulez 1 000 abonnés sur l'ensemble de vos comptes connectés.", reward: "Cadre « Comète » Éclipse (page bio)", secret: true, serverOnly: true },
  { key: "frame-eclipse-orbites", emoji: "🪐", title: "Gravitation", hint: "Cumulez 10 000 abonnés sur l'ensemble de vos comptes connectés.", reward: "Cadre « Orbites » Éclipse (page bio)", secret: true, serverOnly: true },
  { key: "frame-eclipse-metal", emoji: "⚫", title: "Masse critique", hint: "Cumulez 100 000 abonnés sur l'ensemble de vos comptes connectés.", reward: "Cadre « Acier noir » Éclipse (page bio)", secret: true, serverOnly: true },
  { key: "ambassador-bronze", emoji: "🥉", title: "Ambassadeur bronze", hint: "Faites abonner 5 personnes avec votre lien de parrainage.", reward: "Badge « Ambassadeur bronze » (profil)", serverOnly: true },
  { key: "ambassador-silver", emoji: "🥈", title: "Ambassadeur argent", hint: "Faites abonner 10 personnes avec votre lien de parrainage.", reward: "Badge « Ambassadeur argent » (profil)", serverOnly: true },
  { key: "ambassador-gold", emoji: "🥇", title: "Ambassadeur or", hint: "Faites abonner 25 personnes avec votre lien de parrainage.", reward: "Badge « Ambassadeur or » (profil)", serverOnly: true },
  { key: "ambassador-legend", emoji: "🌠", title: "Ambassadeur légendaire", hint: "Faites abonner 50 personnes avec votre lien de parrainage.", reward: "Badge « Ambassadeur légendaire » (profil)", serverOnly: true }
];

export const EASTER_EGGS: EasterEggDef[] = [...COLLECTION, ...REWARD_EGGS, ...ACHIEVEMENT_EGGS].map((e, i) => ({ ...e, number: i + 1 }));

/** Vrai si l'easter egg a sa place numérotée dans la grille de la collection (sinon : bloc « à récompense » ou Réussites). */
export function isNumberedEgg(e: Pick<EasterEggDef, "reward" | "secret">): boolean {
  return !e.reward || Boolean(e.secret);
}

export const EASTER_EGG_KEYS = EASTER_EGGS.map((e) => e.key);

// Les easter eggs d'origine du site encore présents (voir succès "Chasseur
// d'étoiles" ci-dessus) : les 20 premiers, moins « Qui es-tu ? » et « Inbox
// zero » retirés le 10/10/2026 — 18 clés, écrites en toutes lettres pour ne
// jamais dépendre de l'ordre du tableau.
export const ORIGINAL_TWENTY_KEYS = [
  "konami",
  "nebula-word",
  "console-signature",
  "logo-spin",
  "midnight-stars",
  "starfield-theme",
  "constellation",
  "lost-in-space",
  "publish-milestone",
  "referral-crown",
  "support-heartbeat",
  "followers-1000",
  "friday-13",
  "nova-theme",
  "anniversary",
  "loading-minigame",
  "theme-toggle-10x",
  "hidden-comment"
];

// Succès "méta" : ils récompensent l'obtention d'autres succès plutôt qu'une
// action précise (voir markEasterEggFound dans easter-eggs/server.ts) — on
// les exclut du calcul de la "complétion à 100%" pour éviter un paradoxe
// (il faudrait les avoir trouvés pour... les avoir trouvés).
export const META_ACHIEVEMENT_KEYS = ["original-20-found", "all-eggs-100pct"];

// Succès d'audience (sixième vague) : ils dépendent de la taille des
// comptes, pas de la curiosité — exclus de « Complétion totale » pour que
// ce succès reste atteignable par tout le monde.
export const AUDIENCE_ACHIEVEMENT_KEYS = [
  "frame-or-comete",
  "frame-or-orbites",
  "frame-or-metal",
  "frame-eclipse-comete",
  "frame-eclipse-orbites",
  "frame-eclipse-metal",
  "frame-ultime-nacre",
  "frame-ultime-prisme"
];

// Paliers ambassadeur (septième vague) : dépendent du nombre de filleuls
// abonnés, exclus de « Complétion totale » comme les succès d'audience.
export const REFERRAL_TIER_KEYS = ["ambassador-bronze", "ambassador-silver", "ambassador-gold", "ambassador-legend"];

export function isValidEasterEggKey(key: string): boolean {
  return EASTER_EGG_KEYS.includes(key);
}

export function findEasterEgg(key: string): EasterEggDef | undefined {
  return EASTER_EGGS.find((e) => e.key === key);
}

/**
 * Easter eggs « à lire » (corrigés le 30/09/2026) : « Vu dans le code
 * source » et « Message dans la console » étaient accordés dès l'affichage
 * de la page — impossible de savoir si le code source ou la console avaient
 * été ouverts —, donc à toute personne tombant sur une adresse inexistante
 * ou ouvrant le tableau de bord (constaté juste après une inscription).
 * Le commentaire caché et le message de la console donnent maintenant un
 * code à taper dans la palette (Ctrl/Cmd+K) : il faut vraiment les lire.
 */
export const SECRET_PHRASES = {
  "hidden-comment": "poussière d'étoiles",
  "console-signature": "hyperespace"
} as const;
export type SecretEggKey = keyof typeof SECRET_PHRASES;
export const SOURCE_SECRET_PHRASE = SECRET_PHRASES["hidden-comment"];

/** Texte tapé réduit à ses lettres (sans accent, espace ni ponctuation). */
export function normalizeSecret(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Easter egg débloqué par ce texte tapé dans la palette, ou null. */
export function secretEggFor(text: string): SecretEggKey | null {
  const typed = normalizeSecret(text);
  if (!typed) return null;
  for (const [key, phrase] of Object.entries(SECRET_PHRASES) as [SecretEggKey, string][]) if (normalizeSecret(phrase) === typed) return key;
  return null;
}

/** Commentaire HTML caché dans le code source (page 404, page Soutenir). */
export function sourceSecretComment(intro: string): string {
  return `<!-- ${intro} Code secret : tapez « ${SECRET_PHRASES["hidden-comment"]} » dans la palette de commandes (Ctrl/Cmd+K) pour débloquer l'easter egg « Vu dans le code source ». -->`;
}
