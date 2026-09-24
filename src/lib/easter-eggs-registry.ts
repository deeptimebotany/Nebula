// Registre central des 20 easter eggs du site — SEULE source de vérité pour
// leurs clés stables (utilisées en base via EasterEggFound.key), leur ordre
// d'affichage et leur texte. Importable côté client ET côté serveur (aucune
// dépendance à Prisma ici) : la page /succes s'en sert pour l'affichage, les
// routes API pour valider une clé reçue.
//
// Ajouter un nouvel easter egg au site ? Il suffit d'ajouter une entrée ici
// (clé unique, jamais renommée ensuite — elle est stockée en base) puis
// d'appeler reportEasterEggFound("ma-cle") côté client, ou
// markEasterEggFound(userId, "ma-cle") côté serveur, au moment où on le
// détecte.

export interface EasterEggDef {
  key: string;
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
  // numéro, à la fin de la page /succes.
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

export const EASTER_EGGS: EasterEggDef[] = [
  { key: "konami", number: 1, emoji: "🕹️", title: "Code Konami", hint: "↑ ↑ ↓ ↓ ← → ← → B A, n'importe où sur le site." },
  { key: "nebula-word", number: 2, emoji: "🌌", title: "Le mot secret", hint: "Tapez « nebula » au clavier, sans cliquer dans un champ de texte." },
  { key: "console-signature", number: 3, emoji: "🖥️", title: "Message dans la console", hint: "Ouvrez la console de votre navigateur (F12) sur n'importe quelle page." },
  { key: "logo-spin", number: 4, emoji: "🌀", title: "Logo en surchauffe", hint: "Restez appuyé 3 secondes sur le logo, dans le menu latéral." },
  { key: "midnight-stars", number: 5, emoji: "🌠", title: "Étoiles filantes", hint: "Ouvrez Nebula pile à minuit." },
  { key: "starfield-theme", number: 6, emoji: "✨", title: "Ciel étoilé", hint: "Activez le thème étoilé animé dans Paramètres (palier Pro ou Agence).", reward: "Thème étoilé animé" },
  { key: "constellation", number: 7, emoji: "🔭", title: "Constellation", hint: "Maj + clic sur le fond, une fois le thème étoilé activé." },
  { key: "lost-in-space", number: 8, emoji: "🛰️", title: "Perdu dans l'espace", hint: "Tombez sur une page qui n'existe pas." },
  { key: "ai-identity", number: 9, emoji: "🤖", title: "Qui es-tu ?", hint: "Demandez à l'assistant IA qui il est." },
  { key: "publish-milestone", number: 10, emoji: "🎉", title: "Jalon de publications", hint: "Soyez présent·e quand Nebula franchit un cap de publications envoyées." },
  { key: "referral-crown", number: 11, emoji: "👑", title: "Couronne du parrainage", hint: "Prenez la 1ʳᵉ place du classement des parrainages.", reward: "Cadre « La couronne » (page bio)" },
  { key: "support-heartbeat", number: 12, emoji: "💓", title: "Cœur qui s'emballe", hint: "Cliquez 5 fois d'affilée sur le cœur de la page Soutenir Nebula." },
  { key: "followers-1000", number: 13, emoji: "🎖️", title: "Cap des 1000", hint: "Faites franchir les 1 000 abonnés à l'un de vos comptes connectés." },
  { key: "friday-13", number: 14, emoji: "🐈‍⬛", title: "Vendredi 13", hint: "Utilisez Nebula un vendredi 13." },
  { key: "inbox-zero", number: 15, emoji: "📭", title: "Inbox zero", hint: "Traitez tous les commentaires reçus sur un compte." },
  { key: "nova-theme", number: 16, emoji: "🌟", title: "Thème Nova", hint: "Tapez « nova » dans Paramètres, sans cliquer dans un champ de texte.", reward: "Thème Nova" },
  { key: "anniversary", number: 17, emoji: "🎂", title: "Anniversaire", hint: "Utilisez Nebula le jour de l'anniversaire du site." },
  { key: "loading-minigame", number: 18, emoji: "👾", title: "Petit jeu d'attente", hint: "Tombez sur le mini-jeu qui apparaît pendant un chargement un peu long." },
  { key: "theme-toggle-10x", number: 19, emoji: "🌗", title: "Indécis·e", hint: "Basculez sombre/clair 10 fois de suite, rapidement." },
  { key: "hidden-comment", number: 20, emoji: "📜", title: "Vu dans le code source", hint: "Ouvrez le code source d'une page qui en cache un (Ctrl/Cmd+U)." },

  // --- Deuxième vague (choisie le 22/09/2026 sur une liste de 50
  // propositions détaillées) — voir src/lib/easter-eggs/server.ts pour les
  // deux succès "méta" (original-20-found, all-eggs-100pct), calculés
  // automatiquement plutôt que déclenchés depuis un composant.
  { key: "banana-word", number: 21, emoji: "🍌", title: "Banane", hint: "Tapez « banana » au clavier, sans cliquer dans un champ de texte." },
  { key: "ai-answer-42", number: 22, emoji: "🧮", title: "Le sens de la vie", hint: "Demandez à l'assistant IA un calcul contenant deux fois « 42 » (ex : « combien font 42 fois 42 »)." },
  { key: "support-thanks", number: 23, emoji: "🙏", title: "Merci beaucoup", hint: "Écrivez « merci » au moins 5 fois dans un même message à l'assistant IA." },
  { key: "command-palette-loop", number: 24, emoji: "🎛️", title: "Palette compulsive", hint: "Ouvrez la palette de commandes (Cmd/Ctrl+K) 3 fois de suite en moins de 10 secondes." },
  { key: "early-bird-post", number: 25, emoji: "🌙", title: "Lève-tôt malgré lui", hint: "Publiez un post entre 3h et 5h du matin (heure du serveur)." },
  { key: "marathon-session", number: 26, emoji: "⏳", title: "Marathon", hint: "Restez connecté·e en continu plus de 4 heures sur une même session." },
  { key: "avatar-double-tap", number: 27, emoji: "❤️", title: "Double-tap", hint: "Double-cliquez rapidement sur la pastille de marque active, dans la barre du haut." },
  { key: "cursor-statue", number: 28, emoji: "🖱️", title: "Statue", hint: "Laissez le curseur totalement immobile pendant 60 secondes sur le dashboard." },
  { key: "extreme-zoom", number: 29, emoji: "🔍", title: "Zoom extrême", hint: "Zoomez le navigateur à 400% ou plus." },
  { key: "composer-disabled-clicks", number: 30, emoji: "🚫", title: "Le bouton qui résiste", hint: "Cliquez 20 fois sur le bouton « Publier » de la page Publier alors qu'il est grisé (rien sélectionné)." },
  { key: "followers-10k", number: 31, emoji: "🥇", title: "Cap des 10K", hint: "Faites franchir les 10 000 abonnés à l'un de vos comptes connectés.", reward: "Badge doré « Cap des 10K »" },
  { key: "posts-100", number: 32, emoji: "💯", title: "Centenaire", hint: "Publiez votre 100ᵉ post personnel." },
  { key: "all-networks-connected", number: 33, emoji: "🌐", title: "Tout connecté", hint: "Connectez les 6 réseaux disponibles en même temps sur une marque." },
  { key: "supernova-impressions", number: 34, emoji: "💫", title: "Supernova analytique", hint: "Dépassez 1 million d'impressions cumulées (dernier relevé de chaque compte) sur une marque.", reward: "Fond de carte « Supernova » (Analytics)" },
  { key: "hashtag-nebula", number: 35, emoji: "#️⃣", title: "Auto-référence", hint: "Publiez un post dont la légende contient « #nebula »." },
  { key: "referral-crown-30d", number: 36, emoji: "👑", title: "Couronne permanente", hint: "Restez en 1ʳᵉ place du classement de parrainage 30 jours consécutifs.", reward: "Cadre doré « Couronne permanente »" },
  { key: "original-20-found", number: 37, emoji: "🏅", title: "Chasseur d'étoiles", hint: "Débloquez les 20 easter eggs d'origine du site.", reward: "Titre « Chasseur d'étoiles ⭐ »" },
  { key: "all-eggs-100pct", number: 38, emoji: "🏆", title: "Complétion totale", hint: "Débloquez 100% des easter eggs existants.", reward: "Thème caché « Golden Nebula »" },
  { key: "version-click", number: 39, emoji: "🔢", title: "Auto-clic", hint: "Cliquez 5 fois sur le numéro de version en pied de page." },
  { key: "keyboard-nav", number: 40, emoji: "⌨️", title: "Navigation au clavier", hint: "Parcourez tout le menu latéral uniquement avec la touche Tab, sans souris, jusqu'au dernier lien." },
  { key: "multi-tab", number: 41, emoji: "🪟", title: "Multi-fenêtres", hint: "Ouvrez Nebula dans 5 onglets du navigateur en même temps." },
  { key: "tab-switch-loop", number: 42, emoji: "🔄", title: "Va-et-vient", hint: "Basculez entre deux onglets/fenêtres Nebula au moins 10 fois en 30 secondes." },
  { key: "zen-absolute", number: 43, emoji: "🧘", title: "Zen absolu", hint: "Laissez le mini-jeu de chargement apparaître sans jamais sauter, jusqu'au premier game over.", reward: "Titre « Zen absolu 🧘 »" },

  // --- Troisième vague (22/09/2026) — sur les 25 idées sélectionnées cette
  // fois, un seul reste un vrai easter egg : les 24 autres sont devenues des
  // cosmétiques de palier ou des améliorations offertes à tout le monde (voir
  // src/lib/cosmetics.ts, login-form.tsx, milestone-celebration.tsx) plutôt
  // que des succès à débloquer, sur demande explicite.
  { key: "publish-sound-unlock", number: 44, emoji: "🚀", title: "Son Décollage", hint: "Publiez votre 10ᵉ post personnel, immédiat ou programmé.", reward: "Décollage" },

  // --- Quatrième vague (22/09/2026) — 4 cosmétiques de la troisième vague
  // repassent en easter eggs (déclencheur caché + récompense), à la demande
  // explicite : ils ne sont plus réservés par palier, voir src/lib/cosmetics.ts
  // et src/lib/backgrounds.ts (requiresEgg plutôt que requiresPlan).
  { key: "meteor-shower-unlock", number: 45, emoji: "☄️", title: "Pluie d'étincelles", hint: "Publiez 3 posts personnels le même jour.", reward: "Fond animé « Pluie de météores »" },
  { key: "greeting-unlock", number: 46, emoji: "👋", title: "Toujours à l'heure", hint: "Connectez-vous à peu près à la même heure, 3 jours consécutifs.", reward: "Cosmétique « Message d'accueil personnalisé »" },
  { key: "golden-glow-unlock", number: 47, emoji: "🥇", title: "Éclat mérité", hint: "Faites franchir les 10 000 abonnés à l'un de vos comptes connectés.", reward: "Cosmétique « Éclat doré » (statistiques)" },

  // --- Cinquième vague (22/09/2026) — "Icône rétro" (ex #46, "Fidélité
  // rétro") a été retirée entièrement à la demande explicite : le
  // cosmétique ET son easter egg. "Poussière d'étoiles (menu latéral)",
  // jusque-là offert à tout le monde, redevient à l'inverse un easter egg à
  // débloquer.
  {
    key: "sidebar-menu-mash-unlock",
    number: 48,
    emoji: "🌌",
    title: "Poussière retrouvée",
    hint: "Ouvrez le menu latéral (☰) 7 fois de suite, en moins de 10 secondes.",
    reward: "Cosmétique « Poussière d'étoiles » (menu latéral)"
  },

  // --- Sixième vague (24/09/2026) — cadres animés de la page bio (voir
  // src/lib/bio-frames.ts). Succès cachés, débloqués par des seuils
  // d'audience calculés côté serveur (src/lib/easter-eggs/audience.ts) :
  // j'aime cumulés sur toutes vos publications pour l'Or, abonnés cumulés
  // de tous vos comptes pour l'Éclipse, et le million pour les deux cadres
  // ultimes. Exclus du calcul de « Complétion totale » (voir
  // AUDIENCE_ACHIEVEMENT_KEYS).
  { key: "frame-or-comete", number: 49, emoji: "☄️", title: "Mille cœurs", hint: "Cumulez 1 000 j'aime sur l'ensemble de vos publications.", reward: "Cadre « Comète » dorée (page bio)", secret: true, serverOnly: true },
  { key: "frame-or-orbites", number: 50, emoji: "💛", title: "Dix mille cœurs", hint: "Cumulez 10 000 j'aime sur l'ensemble de vos publications.", reward: "Cadre « Orbites » dorées (page bio)", secret: true, serverOnly: true },
  { key: "frame-or-metal", number: 51, emoji: "🏵️", title: "Cent mille cœurs", hint: "Cumulez 100 000 j'aime sur l'ensemble de vos publications.", reward: "Cadre « Feuille d'or » (page bio)", secret: true, serverOnly: true },
  { key: "frame-eclipse-comete", number: 52, emoji: "🌑", title: "Premier cercle", hint: "Cumulez 1 000 abonnés sur l'ensemble de vos comptes connectés.", reward: "Cadre « Comète » Éclipse (page bio)", secret: true, serverOnly: true },
  { key: "frame-eclipse-orbites", number: 53, emoji: "🪐", title: "Gravitation", hint: "Cumulez 10 000 abonnés sur l'ensemble de vos comptes connectés.", reward: "Cadre « Orbites » Éclipse (page bio)", secret: true, serverOnly: true },
  { key: "frame-eclipse-metal", number: 54, emoji: "⚫", title: "Masse critique", hint: "Cumulez 100 000 abonnés sur l'ensemble de vos comptes connectés.", reward: "Cadre « Acier noir » Éclipse (page bio)", secret: true, serverOnly: true },
  { key: "frame-ultime-nacre", number: 55, emoji: "🦪", title: "Le million de cœurs", hint: "Cumulez 1 000 000 de j'aime sur l'ensemble de vos publications.", reward: "Cadre ultime « Nacre » (page bio)", secret: true, serverOnly: true },
  { key: "frame-ultime-prisme", number: 56, emoji: "💎", title: "Le million", hint: "Cumulez 1 000 000 d'abonnés sur l'ensemble de vos comptes connectés.", reward: "Cadre ultime « Prisme » (page bio) et thème « Prisme »", secret: true, serverOnly: true }
];

export const EASTER_EGG_KEYS = EASTER_EGGS.map((e) => e.key);

// Les 20 tout premiers easter eggs du site (voir succès "Chasseur
// d'étoiles" ci-dessus) — figés ici plutôt que recalculés dynamiquement,
// pour ne jamais bouger même si l'ORDRE du tableau EASTER_EGGS changeait un
// jour.
export const ORIGINAL_TWENTY_KEYS = EASTER_EGGS.slice(0, 20).map((e) => e.key);

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

export function isValidEasterEggKey(key: string): boolean {
  return EASTER_EGG_KEYS.includes(key);
}

export function findEasterEgg(key: string): EasterEggDef | undefined {
  return EASTER_EGGS.find((e) => e.key === key);
}
