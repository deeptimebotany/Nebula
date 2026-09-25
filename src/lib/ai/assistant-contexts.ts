// Catalogue des CONTEXTES de l'assistant « Demander à Nebula » — la partie
// visible côté navigateur : pour chaque onglet de l'application, le message
// d'accueil et la réserve de suggestions cliquables. Aucune donnée serveur,
// aucun appel API : tout ce qui est affiché à l'ouverture du tiroir vient
// d'ici, instantanément et gratuitement (le quota Gemini n'est consommé QUE
// quand l'utilisateur envoie vraiment une question).
//
// Le pendant serveur (instructions système injectées dans Gemini pour
// chaque clé) vit dans assistant-prompts.ts — même liste de clés, mais ce
// fichier-là n'est jamais envoyé au navigateur. Les deux sont reliés par le
// type AssistantContextKey : ajouter un onglet = ajouter une clé ici (accueil
// + suggestions), puis son module dans assistant-prompts.ts.
//
// Ce fichier est importé côté client (tiroir, en-tête) ET côté serveur
// (validation de la clé reçue par /api/ai/chat) : il ne doit donc importer
// ni Prisma, ni "server-only", ni rien qui touche au serveur.

export const ASSISTANT_CONTEXT_KEYS = [
  "overview",
  "composer",
  "thumbnails",
  "publications",
  "post",
  "calendar",
  "analytics",
  "accounts",
  "comments",
  "engagements",
  "link-in-bio",
  "reports",
  "calendar-share",
  "retention",
  "studio",
  "media-kit",
  "community",
  "billing",
  "settings",
  "support",
  "generic"
] as const;

export type AssistantContextKey = (typeof ASSISTANT_CONTEXT_KEYS)[number];

export function isAssistantContextKey(value: unknown): value is AssistantContextKey {
  return typeof value === "string" && (ASSISTANT_CONTEXT_KEYS as readonly string[]).includes(value);
}

export interface AssistantContextDef {
  /** Nom court affiché dans la puce « Contexte : … » de l'en-tête du tiroir. */
  label: string;
  /** Phrase d'accueil sous « Bonjour {prénom} » — dit ce que l'assistant sait
   *  faire ICI, pour que l'utilisateur comprenne d'un coup d'œil pourquoi les
   *  suggestions ont changé en changeant d'onglet. */
  welcome: string;
  /** Réserve de suggestions cliquables. Le tiroir en affiche un lot de
   *  SUGGESTION_BATCH_SIZE et « Autres suggestions › » fait défiler le reste,
   *  en boucle. Écrites à la main : 0 appel API, jamais d'échec, réponse
   *  immédiate. Formulées comme l'utilisateur les taperait (à la 1re personne
   *  ou à l'impératif), courtes, une idée par ligne. */
  suggestions: string[];
}

/** Nombre de suggestions visibles à la fois à l'accueil du tiroir. */
export const SUGGESTION_BATCH_SIZE = 4;

export const ASSISTANT_CONTEXTS: Record<AssistantContextKey, AssistantContextDef> = {
  overview: {
    label: "Vue d'ensemble",
    welcome: "Vous êtes sur la vue d'ensemble. Je peux résumer où en est votre marque cette semaine, vous dire quoi publier ensuite, ou vous guider dans Nebula.",
    suggestions: [
      "Résume l'état de ma marque cette semaine",
      "Qu'est-ce que je devrais publier ensuite ?",
      "Quel réseau mérite le plus mon attention en ce moment ?",
      "Explique-moi les chiffres affichés sur cette page",
      "Donne-moi 3 idées de publications pour cette semaine",
      "Comment programmer une publication récurrente ?",
      "Par quoi commencer quand on débute sur Nebula ?",
      "Quelles sont les prochaines publications prévues ?"
    ]
  },
  composer: {
    label: "Publier",
    welcome: "Vous préparez une publication. Je peux trouver un titre qui accroche, écrire ou raccourcir la description, choisir les bons hashtags ou le bon réseau.",
    suggestions: [
      "Propose 5 titres accrocheurs pour ma vidéo",
      "Écris une description courte et engageante",
      "Quels hashtags utiliser pour toucher plus de monde ?",
      "À quelle heure publier pour un maximum de vues ?",
      "Adapte le même contenu pour Instagram, TikTok et YouTube",
      "Comment rendre ma première phrase plus percutante ?",
      "Quelle longueur idéale pour une description YouTube ?",
      "Aide-moi à choisir entre Reel et publication classique"
    ]
  },
  thumbnails: {
    label: "Miniatures",
    welcome: "Vous travaillez sur la miniature. Décrivez-moi votre vidéo : je vous propose un concept, une accroche et une composition — et j'explique POURQUOI chaque choix fait cliquer.",
    suggestions: [
      "Crée un concept de miniature pour ma vidéo et explique tes choix",
      "Quel texte d'accroche mettre sur ma miniature ?",
      "Quelles couleurs attirent le plus l'œil dans un fil d'actualité ?",
      "Visage ou objet : qu'est-ce qui fait le plus cliquer ?",
      "Analyse les erreurs classiques d'une miniature qui ne clique pas",
      "Comment adapter ma miniature YouTube pour TikTok et Instagram ?",
      "Propose 3 variantes de miniature à tester en A/B",
      "Quelle émotion montrer sur la miniature pour ce sujet ?"
    ]
  },
  publications: {
    label: "Publications",
    welcome: "Vous parcourez vos publications. Je peux repérer celles qui ont le mieux marché, expliquer un échec de publication, ou proposer quoi republier.",
    suggestions: [
      "Quelles publications ont le mieux fonctionné récemment ?",
      "Pourquoi une publication peut-elle échouer ?",
      "Que pourrais-je republier ou recycler ?",
      "Comment filtrer mes publications par réseau ?",
      "Résume mes dernières publications en 3 lignes",
      "Comment corriger et relancer une publication en échec ?",
      "Quel rythme de publication tenir sur chaque réseau ?",
      "Comment dupliquer une publication existante ?"
    ]
  },
  post: {
    label: "Publication",
    welcome: "Vous consultez une publication. Je peux l'analyser, proposer une version améliorée du titre ou de la description, ou expliquer ses résultats.",
    suggestions: [
      "Que penses-tu de cette publication ?",
      "Propose une meilleure version du titre",
      "Comment améliorer la description ?",
      "Pourquoi cette publication a-t-elle échoué ?",
      "Sur quel autre réseau la republier ?",
      "Résume cette publication en une phrase"
    ]
  },
  calendar: {
    label: "Calendrier",
    welcome: "Vous êtes dans le calendrier. Je peux vous aider à trouver les meilleurs créneaux, à équilibrer la semaine entre les réseaux, ou à remplir les trous.",
    suggestions: [
      "Quels sont les meilleurs jours et heures pour publier ?",
      "Aide-moi à planifier une semaine équilibrée",
      "Combien de publications par semaine sur chaque réseau ?",
      "Comment déplacer une publication programmée ?",
      "Propose un planning pour le lancement d'une vidéo",
      "Que publier les jours où je n'ai rien de prévu ?",
      "Comment programmer une série de publications d'un coup ?",
      "Quel fuseau horaire est utilisé pour mes programmations ?"
    ]
  },
  analytics: {
    label: "Analytics",
    welcome: "Vous êtes sur Analytics. Je lis vos vraies statistiques : abonnés, portée, impressions. Demandez-moi ce qui progresse, ce qui bloque, et quoi faire ensuite.",
    suggestions: [
      "Explique-moi mes statistiques en langage simple",
      "Quel réseau progresse le plus ? Lequel stagne ?",
      "Pourquoi ma portée baisse-t-elle ?",
      "Comment augmenter mon nombre d'abonnés ?",
      "Quelle est la différence entre portée et impressions ?",
      "Donne-moi 3 actions concrètes pour ce mois-ci",
      "Mes chiffres sont-ils bons pour ma taille de compte ?",
      "Quel contenu produit le plus d'engagement chez moi ?"
    ]
  },
  accounts: {
    label: "Comptes connectés",
    welcome: "Vous gérez vos comptes connectés. Je peux expliquer comment connecter un réseau, pourquoi une connexion expire, ou ce que Nebula peut publier sur chacun.",
    suggestions: [
      "Comment connecter mon compte YouTube ?",
      "Pourquoi mon compte apparaît « à reconnecter » ?",
      "Quels formats puis-je publier sur chaque réseau ?",
      "Puis-je connecter plusieurs comptes du même réseau ?",
      "Comment connecter un compte TikTok ?",
      "Que se passe-t-il si je déconnecte un compte ?",
      "Quelles autorisations Nebula demande-t-il ?",
      "Comment publier sur une page Facebook plutôt qu'un profil ?"
    ]
  },
  comments: {
    label: "Commentaires",
    welcome: "Vous modérez vos commentaires. Je peux vous aider à répondre avec le bon ton, à gérer une critique, ou à transformer une question en idée de contenu.",
    suggestions: [
      "Aide-moi à répondre à un commentaire négatif",
      "Rédige une réponse chaleureuse à un compliment",
      "Comment gérer un commentaire insultant ?",
      "Comment encourager plus de commentaires sous mes vidéos ?",
      "Réponds à une question fréquente de ma communauté",
      "Quel ton adopter pour répondre à mes abonnés ?",
      "Faut-il répondre à tous les commentaires ?",
      "Comment transformer un commentaire en idée de contenu ?"
    ]
  },
  engagements: {
    label: "Engagements",
    welcome: "Vous suivez vos engagements : likes, partages, enregistrements, vues. Je lis ces chiffres et vous dis ce qui plaît vraiment, et pourquoi.",
    suggestions: [
      "Quelle publication a le plus engagé, et pourquoi ?",
      "Comment obtenir plus de partages en story ?",
      "Likes ou enregistrements : lequel compte le plus pour l'algorithme ?",
      "Pourquoi mes vues montent mais pas mes likes ?",
      "Donne-moi 3 idées pour relancer l'engagement cette semaine",
      "Quel type de contenu génère le plus de commentaires chez moi ?",
      "Comment lire le ratio engagement / vues ?",
      "Que republier vu ce qui a le mieux marché ?"
    ]
  },
  "link-in-bio": {
    label: "Page bio",
    welcome: "Vous personnalisez votre page bio. Je peux écrire une bio qui donne envie, choisir l'ordre de vos liens, ou vous dire lesquels sont vraiment cliqués.",
    suggestions: [
      "Écris une bio courte et percutante pour ma page",
      "Dans quel ordre placer mes liens ?",
      "Quels liens sont les plus cliqués ?",
      "Comment donner envie de cliquer sur mon lien principal ?",
      "Combien de liens maximum pour rester lisible ?",
      "Propose un appel à l'action pour ma page bio",
      "Comment partager ma page bio sur Instagram et TikTok ?",
      "Quel thème de couleurs choisir pour ma page ?"
    ]
  },
  reports: {
    label: "Rapports",
    welcome: "Vous préparez un rapport. Je peux rédiger le résumé pour votre client, mettre en avant les bons chiffres, ou expliquer une baisse sans jargon.",
    suggestions: [
      "Rédige un résumé de résultats pour mon client",
      "Quels chiffres mettre en avant dans un rapport mensuel ?",
      "Comment expliquer une baisse de portée à un client ?",
      "Propose une structure de rapport claire",
      "Écris l'email d'envoi du rapport",
      "Comment programmer l'envoi automatique du rapport ?",
      "Traduis mes statistiques en recommandations",
      "Quels objectifs proposer pour le mois prochain ?"
    ]
  },
  "calendar-share": {
    label: "Calendrier client",
    welcome: "Vous partagez votre calendrier avec un client. Je peux vous aider à présenter le planning, à expliquer le fonctionnement de la validation, ou à rédiger le message d'accompagnement.",
    suggestions: [
      "Écris le message d'accompagnement pour partager le calendrier",
      "Comment fonctionne la validation par le client ?",
      "Que voit exactement mon client sur ce lien ?",
      "Comment présenter un planning mensuel à un client ?",
      "Comment retirer l'accès à un calendrier partagé ?",
      "Propose un rythme de validation avec mon client"
    ]
  },
  retention: {
    label: "Rétention IA",
    welcome: "Vous analysez la rétention de vos vidéos. Je peux expliquer ce qu'est une bonne courbe, où les spectateurs décrochent, et comment retenir plus longtemps.",
    suggestions: [
      "Qu'est-ce qu'une bonne courbe de rétention ?",
      "Pourquoi les spectateurs partent-ils dans les 30 premières secondes ?",
      "Comment améliorer l'accroche de mes vidéos ?",
      "Quelle durée idéale pour mes vidéos ?",
      "Comment relancer l'attention au milieu d'une vidéo ?",
      "Que signifie un pic dans ma courbe de rétention ?",
      "Comment structurer une vidéo pour retenir jusqu'au bout ?",
      "Quels chapitres ajouter pour améliorer la rétention ?"
    ]
  },
  studio: {
    label: "Studio IA",
    welcome: "Vous êtes dans le Studio IA : idées, accroches et scripts écrits à partir de ce qui marche chez vous. Je peux vous aider à choisir une idée, à améliorer une accroche ou à adapter un script.",
    suggestions: [
      "Laquelle de ces idées devrais-je tourner en premier ?",
      "Rends cette accroche plus percutante",
      "Comment adapter ce script en format court ?",
      "Pourquoi mes meilleures publications ont-elles marché ?",
      "Comment tenir l'attention jusqu'à la fin d'une vidéo ?",
      "Propose un titre plus court pour ce script"
    ]
  },
  "media-kit": {
    label: "Media kit",
    welcome: "Vous préparez votre media kit, la page à envoyer aux marques. Je peux vous aider à écrire votre accroche et votre présentation, à fixer vos tarifs ou à rédiger le message qui accompagne le lien.",
    suggestions: [
      "Écris une accroche courte pour mon media kit",
      "Aide-moi à rédiger ma présentation « À propos »",
      "Comment fixer le prix d'une vidéo sponsorisée ?",
      "Rédige un e-mail pour proposer une collaboration à une marque",
      "Quelles publications mettre à la une ?",
      "Comment expliquer mon taux d'engagement à un sponsor ?"
    ]
  },
  community: {
    label: "Communauté",
    welcome: "Vous êtes dans la communauté Nebula. Je peux vous orienter vers un guide, vous aider à formuler une question, ou résumer les bonnes pratiques partagées.",
    suggestions: [
      "Quels guides lire pour bien démarrer ?",
      "Aide-moi à formuler ma question pour la communauté",
      "Résume les bonnes pratiques pour grandir sur TikTok",
      "Comment partager mon retour d'expérience ?",
      "Quelles sont les règles de la communauté ?",
      "Propose un sujet de discussion à lancer"
    ]
  },
  billing: {
    label: "Facturation",
    welcome: "Vous êtes dans la facturation. Je peux expliquer les différences entre les paliers, ce qui est inclus dans le vôtre, ou comment gérer votre abonnement.",
    suggestions: [
      "Quelle est la différence entre les paliers ?",
      "Qu'est-ce qui est inclus dans mon palier actuel ?",
      "Comment changer de palier ?",
      "Comment télécharger mes factures ?",
      "Que se passe-t-il si j'annule mon abonnement ?",
      "Combien de marques puis-je gérer ?",
      "Quelles fonctions IA sont incluses ?",
      "Comment mettre à jour mon moyen de paiement ?"
    ]
  },
  settings: {
    label: "Paramètres",
    welcome: "Vous êtes dans les paramètres. Je peux expliquer un réglage, vous aider à personnaliser l'apparence, ou à configurer votre marque et vos notifications.",
    suggestions: [
      "À quoi sert le Mode focus ?",
      "Comment changer le thème de couleurs ?",
      "Comment renommer ma marque ou changer son logo ?",
      "Comment ajouter un membre à ma marque ?",
      "Comment modifier mon fuseau horaire ?",
      "Comment activer le mode clair ?",
      "Où trouver mes succès débloqués ?",
      "Comment supprimer mon compte ?"
    ]
  },
  support: {
    label: "Soutenir Nebula",
    welcome: "Merci de vous intéresser au soutien de Nebula. Je peux expliquer où va votre contribution, ce qu'elle permet, et comment aider autrement.",
    suggestions: [
      "À quoi sert le soutien à Nebula ?",
      "Comment aider Nebula sans donner d'argent ?",
      "Qu'est-ce qui est prévu prochainement dans Nebula ?",
      "Comment signaler un bug ou une idée ?"
    ]
  },
  generic: {
    label: "Nebula",
    welcome: "Je suis l'assistant intégré de Nebula. Posez-moi une question sur l'application, vos publications ou vos statistiques.",
    suggestions: [
      "Que peux-tu faire pour moi ?",
      "Comment publier sur plusieurs réseaux d'un coup ?",
      "Explique-moi mes statistiques",
      "Donne-moi 3 idées de publications",
      "Comment connecter un nouveau compte ?",
      "Où trouver mon calendrier de publication ?"
    ]
  }
};

/** Correspondance URL → contexte. Les préfixes sont testés dans l'ordre :
 *  « /calendar-share » doit passer avant « /calendar », « /posts/ » (page
 *  d'une publication) avant tout le reste. Un onglet inconnu retombe sur
 *  « generic » — jamais d'erreur, juste l'accueil neutre. */
const PATH_RULES: { prefix: string; key: AssistantContextKey }[] = [
  { prefix: "/posts/", key: "post" },
  { prefix: "/calendar-share", key: "calendar-share" },
  { prefix: "/calendar", key: "calendar" },
  { prefix: "/dashboard", key: "overview" },
  { prefix: "/composer", key: "composer" },
  { prefix: "/publications", key: "publications" },
  { prefix: "/analytics", key: "analytics" },
  { prefix: "/accounts", key: "accounts" },
  { prefix: "/comments", key: "comments" },
  { prefix: "/engagements", key: "engagements" },
  { prefix: "/link-in-bio", key: "link-in-bio" },
  { prefix: "/reports", key: "reports" },
  { prefix: "/retention", key: "retention" },
  { prefix: "/studio", key: "studio" },
  { prefix: "/media-kit", key: "media-kit" },
  { prefix: "/community", key: "community" },
  { prefix: "/billing", key: "billing" },
  { prefix: "/settings", key: "settings" },
  { prefix: "/support", key: "support" }
];

export function resolveAssistantContext(pathname: string | null | undefined): AssistantContextKey {
  if (!pathname) return "generic";
  const rule = PATH_RULES.find((r) => pathname.startsWith(r.prefix));
  return rule?.key ?? "generic";
}

/** Lot n° `batch` (0, 1, 2…) de la réserve, en boucle : « Autres
 *  suggestions › » incrémente simplement le numéro de lot. Avec 8
 *  suggestions et des lots de 4, on alterne entre deux lots ; avec 6, le
 *  second lot est complété par le début de la liste, sans doublon. */
export function pickSuggestionBatch(pool: string[], batch: number, size = SUGGESTION_BATCH_SIZE): string[] {
  if (pool.length <= size) return pool;
  const start = (batch * size) % pool.length;
  const out: string[] = [];
  for (let i = 0; i < size; i++) out.push(pool[(start + i) % pool.length]);
  return out;
}

/** Nombre de lots distincts pour une réserve donnée (pour savoir si le bouton
 *  « Autres suggestions » a un sens : inutile avec 4 suggestions ou moins). */
export function suggestionBatchCount(pool: string[], size = SUGGESTION_BATCH_SIZE): number {
  return Math.max(1, Math.ceil(pool.length / size));
}
