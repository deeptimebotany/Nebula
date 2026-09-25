// Mini-leçons des étoiles (Réussites v2, lot B) : une par étoile de la
// constellation, lisible en 2 minutes — pourquoi c'est utile, comment faire
// dans Nebula, ce qu'il faut éviter. Brouillons du 26/09/2026 (document
// « reussites-mini-lecons » du projet), à relire par Lucas ; ajustés aux
// mesures réelles des étoiles (skills.ts). Aucun chiffre inventé : quand une
// règle dépend du réseau, la leçon le dit plutôt que de promettre un
// résultat. Texte : **gras** autorisé. Importable client et serveur.

export interface Lesson {
  /** Clé de l'étoile (skills.ts). */
  key: string;
  title: string;
  why: string;
  how: { intro?: string; ordered: boolean; items: string[]; outro?: string };
  avoid: string;
}

export const LESSONS: Lesson[] = [
  // --- Régularité ---------------------------------------------------------
  {
    key: "star-regularite-1",
    title: "Programmer plutôt que publier dans l'urgence",
    why: "Une publication préparée à l'avance est presque toujours meilleure qu'une publication faite à la dernière minute : la légende est relue, le visuel choisi, et elle part quand votre audience est là, pas quand vous avez enfin cinq minutes.",
    how: {
      ordered: true,
      items: [
        "Dans Publier, préparez votre publication comme d'habitude.",
        "Au lieu de « Publier maintenant », choisissez une date et une heure.",
        "Retrouvez-la dans le Calendrier : vous pouvez la modifier ou la déplacer jusqu'à sa mise en ligne."
      ],
      outro: "Nebula la publie seul, même si votre ordinateur est éteint."
    },
    avoid: "Tout programmer le même jour. Mieux vaut deux publications sur deux jours différents que deux le même soir."
  },
  {
    key: "star-regularite-2",
    title: "Le rythme minimum qui tient : une publication par semaine",
    why: "Les réseaux mettent en avant les comptes qui reviennent régulièrement, et votre audience prend l'habitude de vous voir. Une publication par semaine, tenue dans la durée, vaut mieux que cinq la première semaine puis rien.",
    how: {
      ordered: true,
      items: [
        "Choisissez un jour fixe (le mardi, par exemple) : c'est votre rendez-vous.",
        "Ce jour-là, programmez au moins une publication pour la semaine.",
        "Une semaine vous échappe ? Pas de panique : l'étoile compte les semaines actives, pas besoin qu'elles se suivent."
      ]
    },
    avoid: "Viser trop haut au début. La mission Habitude est réglée sur votre rythme réel, plus un petit pas : suivez-la plutôt qu'un objectif idéal."
  },
  {
    key: "star-regularite-3",
    title: "Prévoyant : remplir sa semaine en 30 minutes",
    why: "Quand les 7 prochains jours sont déjà prêts, vous n'avez plus à vous demander chaque matin quoi publier. Vous gardez votre énergie pour créer.",
    how: {
      ordered: true,
      items: [
        "Bloquez 30 minutes, une fois par semaine.",
        "Ouvrez le Calendrier et repérez les jours vides.",
        "Pour chaque jour, reprenez une idée, un contenu déjà prêt ou une ancienne vidéo à republier.",
        "Programmez-les d'un coup."
      ]
    },
    avoid: "Remplir pour remplir. Un jour sans publication vaut mieux qu'une publication bâclée : l'étoile se gagne une fois, gardez ensuite le rythme qui vous va."
  },
  {
    key: "star-regularite-4",
    title: "Trois mois de présence : construire un calendrier de 4 semaines",
    why: "Tenir trois mois demande une structure. Avec quelques « piliers » qui reviennent chaque semaine, vous n'avez plus de page blanche.",
    how: {
      ordered: true,
      items: [
        "Choisissez 3 ou 4 piliers qui vous ressemblent : un conseil, les coulisses, une réalisation, une question à votre audience.",
        "Attribuez un pilier à chaque jour où vous publiez.",
        "Dans le Calendrier, préparez 4 semaines à l'avance, même en brouillon."
      ],
      outro: "Il ne reste plus qu'à remplir chaque case."
    },
    avoid: "Changer de piliers chaque semaine. Gardez-les au moins un mois avant de juger ce qui marche."
  },
  {
    key: "star-regularite-5",
    title: "Tenir six mois sans s'épuiser",
    why: "La plupart des créateurs n'arrêtent pas faute d'idées, mais par fatigue. Tenir dans la durée, c'est d'abord se protéger.",
    how: {
      ordered: false,
      items: [
        "**Travaillez par lots** : tournez ou préparez plusieurs contenus d'un coup.",
        "**Recyclez** : une vidéo qui a bien marché il y a deux mois peut repartir. Votre audience a changé depuis.",
        "**Acceptez les semaines douces.** Nebula les prévoit : après deux semaines sans publication, la mission Habitude redescend à une seule publication."
      ]
    },
    avoid: "Culpabiliser d'une pause. Une semaine sans publication ne fait rien perdre : c'est la reprise qui compte."
  },

  // --- Formats vidéo -----------------------------------------------------------
  {
    key: "star-formats-1",
    title: "Premier import : ne plus re-télécharger vos fichiers",
    why: "Vos vidéos et visuels sont souvent déjà quelque part : Canva, Google Drive, Dropbox, OneDrive. Les importer directement évite de passer par votre téléphone ou votre bureau, et de perdre en qualité.",
    how: {
      ordered: true,
      items: [
        "Dans Publier, cliquez sur « Importer un média ».",
        "Choisissez la source (Canva, Drive, Dropbox, OneDrive, ou Unsplash pour des photos libres).",
        "Sélectionnez le fichier : Nebula le récupère et l'ajoute à votre publication."
      ]
    },
    avoid: "Retirer le crédit d'une photo Unsplash. Nebula propose de l'ajouter à la légende : gardez-le, c'est la règle d'Unsplash et une politesse envers le photographe."
  },
  {
    key: "star-formats-2",
    title: "Vertical natif : réussir les 3 premières secondes",
    why: "Reels, Shorts et TikTok se regardent téléphone en main, au format vertical. Sur ces écrans, le début décide de tout : on garde la vidéo ou on passe.",
    how: {
      ordered: true,
      items: [
        "Filmez ou exportez en vertical (9:16), sans bandes noires.",
        "Commencez par l'essentiel : le résultat, la question ou le geste le plus fort, avant toute présentation.",
        "Ajoutez un texte à l'écran dès les premières secondes : beaucoup regardent sans le son."
      ]
    },
    avoid: "Recadrer une vidéo horizontale en vertical au dernier moment : le sujet sort souvent du cadre."
  },
  {
    key: "star-formats-3",
    title: "Recyclage malin : adapter une vidéo à chaque réseau",
    why: "Une même vidéo peut toucher trois publics différents, pour le même effort de création. Mais chaque réseau a ses usages : la même légende partout sonne faux.",
    how: {
      ordered: true,
      items: [
        "Dans Publier, sélectionnez plusieurs réseaux pour la même vidéo.",
        "Personnalisez la légende de chaque réseau : plus courte et directe sur TikTok, plus descriptive sur YouTube, avec une question sur Instagram et Facebook.",
        "Vérifiez la durée : chaque réseau a ses limites."
      ]
    },
    avoid: "Publier partout à la même minute. Décaler d'un jour permet de voir où la vidéo réagit le mieux."
  },
  {
    key: "star-formats-4",
    title: "Une miniature YouTube qui donne envie de cliquer",
    why: "Sur YouTube, la miniature et le titre décident du clic. Une bonne vidéo avec une miniature floue reste souvent invisible.",
    how: {
      ordered: true,
      items: [
        "Un visage ou un sujet net, bien éclairé, en gros plan.",
        "Trois ou quatre mots au maximum, très lisibles, qui complètent le titre sans le répéter.",
        "Des couleurs qui ressortent sur fond blanc comme sur fond sombre.",
        "Dans Publier, choisissez la miniature de votre vidéo : Nebula l'envoie à YouTube avec la vidéo."
      ],
      outro: "YouTube n'accepte les miniatures personnalisées que des chaînes vérifiées par téléphone. En panne d'idées ? L'outil gratuit « Miniatures » de Nebula génère des propositions pour vous inspirer."
    },
    avoid: "Promettre dans la miniature ce que la vidéo ne donne pas : les spectateurs partent vite, et YouTube le remarque."
  },
  {
    key: "star-formats-5",
    title: "Studio : monter une petite chaîne de production",
    why: "Au-delà de 25 vidéos, ce n'est plus l'inspiration qui compte mais l'organisation. Une chaîne simple, toujours la même, fait gagner des heures.",
    how: {
      ordered: true,
      items: [
        "**Idées** : une liste unique où tout arrive.",
        "**Tournage** par lots : plusieurs vidéos d'un coup.",
        "**Montage et export** vers votre dossier Drive, Dropbox ou OneDrive, ou directement depuis Canva.",
        "**Import** dans Nebula, légendes par réseau, programmation."
      ],
      outro: "Toujours dans cet ordre."
    },
    avoid: "Tout refaire à chaque vidéo. Gardez des modèles : générique, texte à l'écran, structure de légende."
  },

  // --- Portée --------------------------------------------------------------------
  {
    key: "star-portee-1",
    title: "Lire vos statistiques sans vous noyer",
    why: "Les statistiques servent à décider quoi refaire, pas à se juger. Il suffit de quelques chiffres, regardés régulièrement.",
    how: {
      ordered: true,
      items: [
        "Dans Analytics, lancez une synchronisation de vos comptes.",
        "Regardez trois choses seulement : l'évolution des abonnés sur le mois, vos trois publications les plus vues, et leur taux d'engagement.",
        "Notez ce qu'elles ont en commun : format, sujet, jour."
      ]
    },
    avoid: "Comparer une journée à la précédente. Les chiffres d'un seul jour varient trop : regardez des semaines."
  },
  {
    key: "star-portee-2",
    title: "Trouver vos meilleurs créneaux",
    why: "Une publication mise en ligne quand votre audience est connectée a plus de chances d'être vue dans les premières heures, qui comptent souvent beaucoup.",
    how: {
      ordered: true,
      items: [
        "Sur la Vue d'ensemble, regardez le « meilleur créneau du jour » de chaque réseau : il vient de vos vrais relevés.",
        "Sans assez de données, l'outil gratuit « Meilleur moment » donne un point de départ.",
        "Programmez vos trois prochaines publications sur ces créneaux, puis comparez dans Engagements."
      ]
    },
    avoid: "Suivre une règle générale trouvée en ligne. Votre audience n'est pas celle d'un autre."
  },
  {
    key: "star-portee-3",
    title: "Envol : ce qui fait vraiment venir des abonnés",
    why: "On s'abonne quand on a envie de voir la suite. Un contenu isolé, même très vu, fait rarement venir des abonnés s'il ne promet rien d'autre.",
    how: {
      ordered: false,
      items: [
        "**Faites des séries** : « partie 1 », un rendez-vous chaque semaine, un défi sur plusieurs jours.",
        "**Dites clairement ce que l'on gagne à s'abonner**, sans le demander à chaque vidéo.",
        "**Soignez votre profil** : photo, description, et lien vers votre page bio."
      ]
    },
    avoid: "Acheter des abonnés ou échanger des abonnements. Ces comptes ne regardent pas vos contenus, et vos statistiques perdent tout leur sens."
  },
  {
    key: "star-portee-4",
    title: "1 000 vues : donner une seconde vie à une vidéo qui marche",
    why: "Une vidéo qui a dépassé vos vues habituelles vous dit quelque chose sur votre audience. C'est le meilleur point de départ pour la suivante.",
    how: {
      ordered: true,
      items: [
        "Repérez-la dans Engagements.",
        "Faites une suite, une variante ou une réponse aux commentaires qu'elle a reçus.",
        "Publiez-la sur un autre réseau, adaptée (la mission « Redonner vie à un ancien contenu » compte aussi).",
        "Épinglez-la ou ajoutez-la à votre page bio."
      ]
    },
    avoid: "Republier exactement la même vidéo, le même jour, sur le même réseau."
  },
  {
    key: "star-portee-5",
    title: "Après un pic : garder les nouveaux venus",
    why: "Une vidéo très vue amène des personnes qui ne vous connaissent pas. Si elles ne trouvent rien d'autre à regarder, elles repartent aussi vite.",
    how: {
      ordered: true,
      items: [
        "Dans les jours qui suivent, publiez un contenu dans la même veine.",
        "Répondez aux commentaires : c'est souvent là que se décide l'abonnement.",
        "Vérifiez que votre profil et votre page bio montrent vos meilleurs contenus."
      ]
    },
    avoid: "Changer complètement de sujet juste après un succès."
  },

  // --- Communauté ------------------------------------------------------------------
  {
    key: "star-communaute-1",
    title: "Répondre au premier commentaire",
    why: "Un commentaire, c'est quelqu'un qui a pris le temps de vous écrire. Y répondre montre qu'il y a une personne derrière le compte, et donne envie aux autres d'écrire aussi.",
    how: {
      ordered: true,
      items: [
        "Dans l'onglet Commentaires, retrouvez les commentaires de tous vos réseaux au même endroit.",
        "Répondez en priorité aux questions, puis aux messages les plus personnels, avec « Répondre sur Instagram » (ou Facebook, YouTube).",
        "Revenez ensuite sur Commentaires et cliquez « Actualiser » : Nebula repère votre réponse."
      ],
      outro: "Une réponse courte et sincère suffit."
    },
    avoid: "Répondre par un simple emoji à une vraie question."
  },
  {
    key: "star-communaute-2",
    title: "Se présenter dans la Communauté Nebula",
    why: "La Communauté réunit d'autres créateurs qui vivent la même chose que vous. Se présenter, c'est le premier pas pour recevoir des conseils, et pour en donner.",
    how: {
      ordered: true,
      items: [
        "Ouvrez la Communauté et créez un sujet.",
        "En quelques lignes : ce que vous créez, sur quels réseaux, ce qui vous bloque en ce moment.",
        "Vous pouvez aussi partager une de vos vidéos déjà publiées (un lien, jamais le fichier)."
      ]
    },
    avoid: "Un message uniquement promotionnel : il reçoit rarement des réponses."
  },
  {
    key: "star-communaute-3",
    title: "Répondre vite sans y passer la soirée : 3 modèles",
    why: "Répondre vite aux commentaires fait vivre vos publications et fidélise votre audience. Mais sans méthode, on y passe des heures.",
    how: {
      intro: "Gardez trois modèles, à personnaliser en une phrase :",
      ordered: true,
      items: [
        "**Merci** : « Merci [prénom] ! Content que [ce qui lui a plu] vous ait aidé. »",
        "**Question** : « Bonne question : [réponse courte]. J'en parle plus en détail dans [vidéo]. »",
        "**Critique** : « Merci pour le retour, je note pour la prochaine. »"
      ],
      outro: "Réservez deux créneaux de 10 minutes par jour plutôt que de répondre en continu."
    },
    avoid: "Copier-coller un modèle sans le personnaliser : ça se voit."
  },
  {
    key: "star-communaute-4",
    title: "Aider un autre créateur (et apprendre en le faisant)",
    why: "Expliquer quelque chose à quelqu'un est l'une des meilleures façons de le comprendre vraiment. Et l'entraide crée des liens qui durent.",
    how: {
      ordered: true,
      items: [
        "Dans la Communauté, parcourez les questions sans réponse.",
        "Répondez à celles où vous avez une expérience, même petite.",
        "Donnez un exemple concret plutôt qu'une règle générale."
      ],
      outro: "Les réponses d'au moins 20 caractères aux sujets des autres comptent pour cette étoile."
    },
    avoid: "Répondre à tout pour le compteur : une réponse utile vaut mieux que dix réponses vides."
  },
  {
    key: "star-communaute-5",
    title: "Mentor : devenir une référence",
    why: "Les créateurs qui aident régulièrement deviennent des repères pour les autres. Cette étoile ajoute la mention « Mentor » à côté de votre nom dans la Communauté.",
    how: {
      ordered: false,
      items: [
        "Revenez chaque semaine sur les nouvelles questions.",
        "Quand une même question revient souvent, proposez un guide complet.",
        "Saluez les bonnes réponses des autres d'une réaction : un Mentor fait grandir le groupe, pas seulement son compteur."
      ]
    },
    avoid: "Répondre à la place de quelqu'un qui connaît mieux le sujet. Orientez plutôt vers lui."
  },

  // --- Stratégie --------------------------------------------------------------------
  {
    key: "star-strategie-1",
    title: "Les 3 chiffres à regarder chaque lundi",
    why: "Sans repère, on ne sait pas si ce qu'on fait marche. Trois chiffres, toujours les mêmes, suffisent à voir la tendance.",
    how: {
      intro: "Le bilan de la semaine, dans Réussites, les rassemble pour la semaine passée :",
      ordered: true,
      items: [
        "le nombre d'abonnés gagnés ;",
        "votre publication la plus vue ;",
        "le nombre de publications mises en ligne."
      ],
      outro: "Au bout d'un mois, vous verrez le lien entre les trois. Pensez à synchroniser vos statistiques dans Analytics avant."
    },
    avoid: "Regarder vos statistiques plusieurs fois par jour : ça stresse sans rien apprendre."
  },
  {
    key: "star-strategie-2",
    title: "Rituel du lundi : un bilan de 10 minutes",
    why: "Un petit bilan, toujours au même moment, transforme vos chiffres en décisions. C'est le rituel des créateurs qui progressent sans s'épuiser.",
    how: {
      ordered: true,
      items: [
        "**Regardez** vos trois chiffres dans le bilan de la semaine.",
        "**Choisissez** une seule chose à refaire cette semaine : c'est votre cap.",
        "**Choisissez** votre mission Progression de la semaine, en lien avec ce cap."
      ]
    },
    avoid: "Changer cinq choses à la fois : vous ne saurez pas laquelle a fait la différence."
  },
  {
    key: "star-strategie-3",
    title: "Une page bio qui convertit",
    why: "Votre page bio est le seul lien que la plupart des réseaux vous laissent. Elle doit mener vers ce qui compte le plus, tout de suite.",
    how: {
      ordered: true,
      items: [
        "Dans Page bio, gardez 3 à 5 liens, pas plus.",
        "Le premier lien est votre priorité du moment (dernière vidéo, offre, prise de rendez-vous).",
        "Donnez des titres clairs à vos liens : « Voir mon dernier tuto », plutôt que « Lien 1 ».",
        "Si vous aviez une page Linktree, Nebula peut en récupérer les liens."
      ]
    },
    avoid: "Une liste de quinze liens : trop de choix, personne ne clique."
  },
  {
    key: "star-strategie-4",
    title: "Faire un test simple, sans outil compliqué",
    why: "« Est-ce que ça marche mieux le soir ? » Pour le savoir, il suffit d'un petit test honnête plutôt que d'une impression.",
    how: {
      ordered: true,
      items: [
        "Choisissez **une seule** chose à tester, par exemple l'heure de publication.",
        "Sur un même réseau, publiez des contenus comparables deux fois le matin et deux fois le soir, dans le même mois.",
        "Comparez les vues et l'engagement dans Engagements, au même délai après la publication (48 h, par exemple)."
      ]
    },
    avoid: "Conclure après une seule publication : un hasard n'est pas une tendance."
  },
  {
    key: "star-strategie-5",
    title: "Stratège : garder, arrêter, doubler",
    why: "Après deux mois de bilans, vous avez assez de recul pour faire des choix. Choisir, c'est aussi arrêter ce qui ne donne rien, pour mettre plus d'énergie ailleurs.",
    how: {
      intro: "Chaque mois, classez vos formats et vos sujets en trois colonnes :",
      ordered: false,
      items: [
        "**Doubler** : ce qui marche nettement mieux que la moyenne.",
        "**Garder** : ce qui marche correctement et vous plaît.",
        "**Arrêter** : ce qui ne donne rien depuis plusieurs semaines."
      ],
      outro: "Puis ajustez vos piliers et votre calendrier en conséquence."
    },
    avoid: "Tout arrêter après une mauvaise semaine. Décidez sur plusieurs semaines, jamais sur un seul jour."
  }
];

export function findLesson(key: string): Lesson | undefined {
  return LESSONS.find((l) => l.key === key);
}
