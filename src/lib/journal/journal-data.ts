// Journal des mises à jour : données (02/10/2026). Une entrée par mise à
// jour, de la plus récente à la plus ancienne. CONSIGNE : à chaque nouvel
// envoi du zip, ajouter en tête de NEW_ENTRIES les entrées de la livraison
// (avec le numéro du README et les migrations) et avancer JOURNAL_UPDATED_AT
// dans journal.ts ; tests/quality/journal.test.ts échoue sinon (élément du
// README ou migration sans entrée, lien vers une page qui n'existe pas).
import type { JournalEntry } from "./journal-types";

const NEW_ENTRIES: JournalEntry[] = [
  {
    id: "2026-10-09-inscription-mot-de-passe-confirme",
    date: "2026-10-09",
    title: "Inscription : le mot de passe se tape deux fois",
    category: "Sécurité",
    links: [{ href: "/register", label: "Créer un compte" }],
    result:
      "À l'inscription avec une adresse e-mail, un second champ « Confirmez le mot de passe » demande de retaper le mot de passe. Si les deux ne correspondent pas, le compte n'est pas créé et un message l'indique sous le champ : plus de compte bloqué par une faute de frappe invisible.",
    change:
      "`register-form.tsx` (champ `register-password-confirm`, vérification avant l'envoi ; seul le mot de passe part au serveur). Test : `tests/quality/inscription-mot-de-passe.test.ts`.",
    readme: 90,
    migrations: []
  },
  {
    id: "2026-10-09-youtube-donnees-audit",
    date: "2026-10-09",
    title: "YouTube : pages légales et gestion des données mises aux règles de YouTube",
    category: "Sécurité",
    links: [
      { href: "/legal#youtube", label: "Données YouTube (confidentialité)" },
      { href: "/accounts", label: "Comptes connectés" },
      { href: "/composer", label: "Publier" }
    ],
    result:
      "Google a validé l'écran d'autorisation de Nebula (youtube.readonly, youtube.upload, youtube.force-ssl). Pour l'audit « YouTube API Services », qui lèvera le verrou « vidéo privée » et le quota de 10 000 unités par jour, la page légale dit maintenant tout ce que YouTube exige : l'acceptation des Conditions d'utilisation de YouTube (lien), l'usage des YouTube API Services, le lien vers les règles de confidentialité de Google, ce que Nebula lit, garde et fait des données YouTube, le retrait de l'accès depuis Nebula ou depuis la page des autorisations Google, et la durée de conservation. Et Nebula le fait vraiment : déconnecter une chaîne efface tout de suite ses données YouTube (statistiques, vidéos, commentaires, rétention, nom et photo) ; les commentaires et fiches de vidéos ne sont jamais gardés plus de 30 jours sans actualisation ; l'autorisation des chaînes sans synchro depuis 25 jours est vérifiée auprès de Google chaque jour, et une autorisation retirée entraîne l'effacement. Dans Publier, un avis rappelle que les vidéos arrivent en « Privée » sur YouTube tant que l'audit n'est pas validé.",
    change:
      "`legal/page.tsx` (conditions §4, confidentialité « 2 bis. Données YouTube », conservation, droits : 7 jours), `src/lib/social/youtube-data-policy.ts` (`deleteYoutubeAuthorizedData`, `purgeStaleYoutubeData`, `checkYoutubeAuthorizations`, `runYoutubeDataPolicy`), `youtube-data-retention.ts`, `youtube.ts` (commentaires de plus de 30 jours ignorés), `revoke.ts` (effacement à la déconnexion), `account-jobs.ts` (tâche du cron), `youtube-audit.ts` et `composer/page.tsx` (avis « Privée »). Tests : `tests/integration/youtube-data-policy.test.ts`, `tests/quality/youtube-compliance.test.ts`.",
    readme: 89,
    migrations: []
  },
  {
    id: "2026-10-07-format-publication",
    date: "2026-10-07",
    title: "Publier : choisir Publication, Reel ou Story ; savoir si YouTube en fera un Short",
    category: "Publication",
    links: [{ href: "/composer", label: "Publier" }],
    result:
      "Pour Instagram et Facebook, chaque publication a maintenant son format : Publication, Reel ou Story. Nebula propose le bon format selon le média, grise ceux qui ne sont pas possibles en disant pourquoi (vidéo trop longue pour une story, vidéo horizontale pour un Reel Facebook…) et l'aperçu montre exactement ce qui sera publié. Pour YouTube, Publier dit si la vidéo sera un Short ou une vidéo classique : c'est YouTube qui décide (verticale ou carrée, 3 minutes au plus). Facebook publie aussi enfin toutes les photos d'un carrousel, pas seulement la première.",
    change:
      "`src/lib/social/post-format.ts`, `src/components/composer/format-picker.tsx`, Instagram `STORIES` / `share_to_feed` / `cover_url`, Facebook `/video_reels`, `/photo_stories`, `/video_stories` et `attached_media`, vérification à la création (`post_format`), aperçu au format choisi.",
    readme: 88,
    migrations: []
  },
  {
    id: "2026-10-07-premier-commentaire",
    date: "2026-10-07",
    title: "Premier commentaire : publié sur YouTube quand c'est possible, et son sort affiché partout",
    category: "Publication",
    links: [
      { href: "/composer", label: "Publier" },
      { href: "/publications", label: "Publications" }
    ],
    result:
      "Le premier commentaire n'est plus jamais ignoré en silence. Publier dit, réseau par réseau, s'il sera publié : TikTok et Pinterest ne le permettent pas, YouTube le permet avec l'autorisation de commenter (pas sur une vidéo privée ni « pour les enfants », et sans pouvoir l'épingler). Sur la fiche de la publication, chaque réseau indique « publié », « nouvel essai vers … » ou la raison de l'échec, avec « Copier le commentaire » et « Réessayer ». Un réseau pas prêt est relancé tout seul, et l'auteur est prévenu si le commentaire n'a pas pu partir.",
    change:
      "`src/lib/first-comment.ts` (sort noté, réservation, relances par le cron, notification), `src/lib/social/first-comment-support.ts`, `youtubeClient.postComment` (`commentThreads.insert`), `POST /api/posts/[id]/first-comment`, `firstComment` dans `/api/connections`.",
    readme: 87,
    migrations: ["20261015090000_first_comment_status"]
  },
  {
    id: "2026-10-07-miniatures-un-clic",
    date: "2026-10-07",
    title: "Miniatures en un clic : l'IA regarde la vidéo et crée 3 miniatures expliquées",
    category: "IA",
    links: [
      { href: "/composer", label: "Publier" },
      { href: "/legal", label: "Confidentialité" }
    ],
    result:
      "Plus besoin de décrire la vidéo : « Générer 3 miniatures » fait regarder la vidéo importée par l'IA, image et son. Le chat dit ce qu'elle en a compris (sujet, public, promesse), puis présente 3 miniatures créées à partir de vrais moments de la vidéo, au format de la vidéo, chacune avec son accroche, l'instant d'où elle vient et pourquoi elle fera cliquer. On en choisit une en un clic, ou on demande de la retravailler. Chaque miniature créée compte dans le quota de miniatures IA (3 par clic) ; l'analyse elle-même n'est pas décomptée.",
    change:
      "Route `POST /api/media/[id]/thumbnails/analyze` (API Files de Google : envoi par morceaux, attente ACTIVE, suppression ; `src/lib/ai/thumbnail-analysis.ts`), images aux instants choisis (`captureVideoFramesAt`), format 9:16 dans `generateThumbnail`, cartes enrichies dans le chat, relances propres au contexte, brief avec `option`.",
    readme: 86,
    migrations: []
  },
  {
    id: "2026-10-07-diagnostic-gemini",
    date: "2026-10-07",
    title: "IA : test de connexion à Gemini et vraie cause des erreurs",
    category: "Fiabilité",
    links: [{ href: "/admin/ia", label: "Coûts IA" }],
    result:
      "Quand l'assistant affiche une erreur, le propriétaire peut cliquer sur « Tester la connexion à Gemini » dans Coûts IA : deux appels courts disent si la clé est refusée, si le modèle est introuvable, si les crédits sont épuisés ou si Google est lent, avec la durée et la réponse exacte de Google. Une clé collée avec un espace ou un caractère invisible marche quand même (et c'est signalé). Une coupure ou un délai dépassé est relancé une fois, une coupure n'est plus présentée comme « trop de temps », et chaque échec est noté dans les journaux Vercel.",
    change:
      "`src/lib/ai/gemini.ts` : `cleanApiKey`, `diagnoseGemini`, une relance sur délai dépassé ou coupure, message « connexion coupée », journal `[gemini] échec …` sans la clé ; route `POST /api/admin/ia/diagnostic` (propriétaire) et carte `gemini-diagnostic.tsx` sur /admin/ia ; `maxDuration = 60` sur 8 routes IA.",
    readme: 85,
    migrations: []
  },
  {
    id: "2026-10-07-canonique-page-bio",
    date: "2026-10-07",
    title: "Référencement : adresse canonique des pages bio, sitemap du pré-lancement",
    category: "Site public",
    links: [{ href: "/link-in-bio", label: "Page bio" }],
    result:
      "Une page bio partagée depuis Instagram, Facebook ou TikTok (avec ?fbclid=… ou ?utm_… dans l'adresse) n'est plus vue par Google comme une page en double : elle déclare son adresse canonique /l/<marque>. Un test vérifie désormais que chaque page publique indexable déclare la sienne. Tant que le site est en pré-lancement, le sitemap ne liste plus /register, qui renvoie vers /bientot.",
    change: "`src/app/l/[slug]/page.tsx` : `alternates.canonical` et `openGraph.url` ; `src/app/sitemap.ts` : /register selon `isSiteOpen()`. Test `tests/quality/canonical.test.ts`.",
    readme: 84,
    migrations: []
  },
  {
    id: "2026-10-07-gemini-credits-epuises",
    date: "2026-10-07",
    title: "IA : message clair et alerte quand les crédits Gemini sont épuisés",
    category: "Fiabilité",
    links: [{ href: "/admin/ia", label: "Coûts IA" }],
    result:
      "Si le solde de crédits prépayés de l'API Gemini tombe à 0, la personne lit « Les fonctions IA de Nebula sont momentanément indisponibles. L'équipe Nebula est prévenue » au lieu du message anglais de Google (ou d'un faux « trop de demandes »), et le propriétaire reçoit une alerte dans la cloche et par e-mail, une fois par jour, avec la marche à suivre pour recharger.",
    change: "`src/lib/ai/gemini.ts` : réponse 402 (et ancienne réponse 429 « prepayment credits are depleted ») sans nouvel essai, `alertOwnerWithEmail` avec la clé `gemini-credits:<jour>`.",
    readme: 83,
    migrations: []
  },
  {
    id: "2026-10-06-etoile-ia",
    date: "2026-10-06",
    title: "Étoiles de l'IA blanches au repos, en couleur pendant l'utilisation ; rond flottant du chat retiré",
    category: "Interface",
    links: [
      { href: "/dashboard", label: "Vue d'ensemble" },
      { href: "/composer", label: "Publier" },
      { href: "/comments", label: "Commentaires" }
    ],
    result:
      "Partout où l'IA est proposée (« Demander à Nebula », « Proposer une réponse », « Générer avec l'IA », Studio IA…), l'étoile est blanche au repos (gris foncé en mode clair), prend la couleur de l'IA au survol, la garde pendant que l'IA travaille ou tant que le chat est ouvert, puis redevient blanche. Le rond flottant en bas à droite, qui doublait le bouton « Demander à Nebula » de l'en-tête, est retiré. L'entrée « Studio IA » du menu prend aussi la couleur de l'IA au survol.",
    change:
      "Composant `AiIcon` (`src/components/ai/ai-icon.tsx`, options `active` et `tone`), classes `nb-ai-icon` et `nb-ai-nav` (globals.css), bouton flottant retiré de `ai-assistant-lazy.tsx` (le tiroir se prépare au survol du bouton de l'en-tête : `prepared` / `prepare` du contexte).",
    readme: 82,
    migrations: []
  },
  {
    id: "2026-10-06-anti-robot-discret",
    date: "2026-10-06",
    title: "Anti-robot discret : la case Cloudflare n'apparaît plus que si besoin",
    category: "Site public",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/forgot-password", label: "Mot de passe oublié" }
    ],
    result:
      "Sur l'inscription, le mot de passe oublié, le contact, l'audit gratuit et les listes d'attente, la vérification anti-robot se fait en arrière-plan : pour la plupart des visiteurs, plus aucune case ni logo Cloudflare. La case n'apparaît que si Cloudflare a un doute, et prend alors toute la largeur du formulaire. Si l'on envoie trop vite, le message dit que la vérification est en cours et de réessayer dans un instant.",
    change: "`TurnstileWidget` : options `appearance: \"interaction-only\"` et `size: \"flexible\"`, nouveau `TURNSTILE_PENDING_MESSAGE`.",
    readme: 81,
    migrations: []
  },
  {
    id: "2026-10-06-logos-reseaux",
    date: "2026-10-06",
    title: "Logos officiels de Facebook, Instagram, Threads, Bluesky et LinkedIn",
    category: "Interface",
    links: [
      { href: "/accounts", label: "Comptes connectés" },
      { href: "/comments", label: "Commentaires" },
      { href: "/media-kit", label: "Media kit" }
    ],
    result:
      "Dans l'application, les pastilles des réseaux montrent les logos officiels (fichiers téléchargés sur les sites de marque) au lieu des dessins de Nebula, partout où les règles du réseau le permettent : Facebook, Threads et Bluesky partout ; LinkedIn à partir de 25 px ; Instagram seulement là où il a assez d'espace vide autour (titres de Comptes connectés, media kit). Threads et LinkedIn passent en blanc en mode sombre. Un compte déconnecté reprend le dessin en gris (un logo officiel ne se recolore pas). TikTok, Pinterest et YouTube gardent le dessin, comme la page d'accueil et l'exemple de media kit de la page publicitaire.",
    change:
      "`src/components/ui/official-network-logos.ts` (règles et fichiers, `public/brands/`), `NetworkTile` (options `muted`, `roomy`, `drawn`), classes `nb-on-light` et `nb-on-dark`, option `drawnLogos` de `KitView`.",
    readme: 80,
    migrations: []
  },
  {
    id: "2026-10-06-logos-sources",
    date: "2026-10-06",
    title: "Publier : logos officiels de Google Drive, Dropbox et Unsplash",
    category: "Publication",
    links: [{ href: "/composer", label: "Publier" }],
    result:
      "Comme pour Canva, les boutons « Importer depuis » de Publier et les mentions « Importé depuis… » affichent les logos officiels de Google Drive, Dropbox et Unsplash (le logo Unsplash passe en blanc en mode sombre), avec une infobulle qui dit l'action. OneDrive garde son dessin : Microsoft n'autorise pas ses logos sans licence. La page d'accueil publique garde les dessins.",
    change: "`src/components/media-import/brand-logo.tsx` (fichiers dans `public/brands/`), option `brand` de `SourceIcon`, classe `nb-logo-mono` pour la variante blanche d'Unsplash.",
    readme: 79,
    migrations: []
  },
  {
    id: "2026-10-06-canva-marque-compte",
    date: "2026-10-06",
    title: "Canva : logo officiel et compte connecté affiché",
    category: "Publication",
    links: [{ href: "/composer", label: "Publier" }],
    result:
      "Partout où Canva apparaît (bouton « Canva » de Publier, mention « Importé depuis Canva », accueil), Nebula affiche le logo officiel de Canva au lieu d'un dessin maison. Le bouton de connexion devient « Connecter mon compte Canva » avec ce logo, et une fois connecté, la fenêtre « Importer depuis Canva » montre le compte utilisé (« Compte Canva connecté : Lucas ») avec un bouton « Déconnecter Canva ». Demandé par la revue de l'application Canva.",
    change:
      "Logo « Canva Icon logo » du kit officiel dans `public/brands/canva/canva-icon.svg` (`CanvaIcon`), 8 px de marge autour de lui ; nom du compte (profil Canva) renvoyé par `/api/media/sources` et `/api/integrations/canva/designs`, récupéré une fois pour les connexions plus anciennes.",
    readme: 78,
    migrations: []
  },
  {
    id: "2026-10-06-tiktok-likes-count",
    date: "2026-10-06",
    title: "TikTok : Nebula ne demande plus le total des j'aime du profil",
    category: "Sécurité",
    links: [{ href: "/analytics", label: "Analytics" }],
    result:
      "Nebula ne demande à TikTok que les chiffres du profil qu'il affiche : abonnés et nombre de vidéos. Le total des j'aime du profil (likes_count) était demandé sans jamais servir ; il ne l'est plus. Rien ne change dans Analytics.",
    change: "`fetchAnalytics` de `src/lib/social/tiktok.ts` : `user/info/?fields=follower_count,video_count`. Test de contrat ajouté.",
    readme: 77,
    migrations: []
  },
  {
    id: "2026-10-06-chiffrement-jetons",
    date: "2026-10-06",
    title: "Chiffrement des jetons : état visible et alertes",
    category: "Sécurité",
    links: [{ href: "/admin/reseaux", label: "Réseaux (admin)" }],
    result:
      "Les jetons des comptes connectés (TikTok, YouTube, Meta…) sont chiffrés en AES-256-GCM dès que la clé TOKEN_ENCRYPTION_KEY est configurée. La page Réseaux du propriétaire montre maintenant l'état exact (actif ou non, combien de jetons sont chiffrés), et le propriétaire est alerté dans la cloche et par e-mail si la clé manque en production ou si des jetons ne peuvent pas être chiffrés.",
    change:
      "`secretFieldsStatus` (`src/lib/db/secret-fields.ts`, lit seulement le préfixe des valeurs), `src/lib/secrets-health.ts` appelé par le cron après le rattrapage, carte « Chiffrement des jetons » sur `/admin/reseaux`.",
    readme: 76,
    migrations: []
  },
  {
    id: "2026-10-06-plafond-tiktok",
    date: "2026-10-06",
    title: "TikTok : suivi du plafond de comptes qui publient",
    category: "Fiabilité",
    links: [{ href: "/admin/reseaux", label: "Réseaux (admin)" }],
    result:
      "TikTok limite le nombre de comptes différents qui publient via Nebula sur 24 heures (100). Nebula les compte : dès 70, le propriétaire reçoit une alerte dans la cloche et par e-mail, avec le chiffre du jour et le maximum des 30 derniers jours, et une seconde si TikTok refuse quand même une publication. La personne refusée voit un message clair en français (limite du jour atteinte, relancer demain ou publier dans l'app TikTok) au lieu du texte anglais de TikTok ; les autres refus de TikTok (limite du compte, compte privé exigé avant l'audit…) sont aussi traduits.",
    change:
      "`src/lib/social/tiktok-cap.ts` (tables `TiktokPublisher` et `TiktokPublisherDay`, seuil `TIKTOK_PUBLISHER_ALERT_AT`, plafond `TIKTOK_DAILY_PUBLISHER_CAP`), messages dans `src/lib/social/tiktok-errors.ts`, compteur affiché sur `/admin/reseaux`, purge à 60 jours.",
    readme: 75,
    migrations: ["20261014090000_tiktok_publishers"]
  },
  {
    id: "2026-10-06-meta-v26",
    date: "2026-10-06",
    title: "Facebook et Instagram : passage à la version 26.0 de l'API de Meta",
    category: "Fiabilité",
    links: [{ href: "/admin/api", label: "Veille des API" }],
    result:
      "La veille des API signalait « Version dépassée » : nos appels demandés en v25.0 étaient servis en v26.0 par Meta. Nebula appelle désormais directement la v26.0 pour les publications Facebook et Instagram, leurs statistiques et la publicité Meta ; le signal ne réapparaît plus après le déploiement.",
    change:
      "`META_GRAPH` passe à v26.0 dans `src/lib/social/versions.ts` (revue le 01/07/2027) ; échéances de la veille mises à jour (Marketing API : revue le 15/01/2027). Changements de la v26.0 relus : aucun paramètre ni champ utilisé par Nebula n'est touché.",
    readme: 74,
    migrations: []
  },
  {
    id: "2026-10-06-generateur-retire",
    date: "2026-10-06",
    title: "Générateur de publications retiré des outils",
    category: "Outils",
    links: [
      { href: "/tools", label: "Outils (application)" },
      { href: "/outils", label: "Outils gratuits" }
    ],
    result:
      "Le Générateur de publications, qui refaisait la page Publier, n'est plus dans les Outils de l'application ni sur le site public. Son ancienne adresse mène aux outils gratuits ; les six autres outils restent, et Publier garde tout ce qu'il faisait (miniature, titre et description par l'IA, aperçu).",
    change:
      "Retirés : `src/app/outils/publier/`, les routes `/api/public/tools/captions`, `pick-frames` et `thumbnail` (seules utilisatrices de l'IA payante côté public), ses composants et données de démo. Catalogue, sitemap, `SEO_TOOLS`, CSP, pied de page, `llms.txt` et liens croisés mis à jour ; `/outils/publier`, `/outils/legendes` et `/outils/miniatures` redirigent vers `/outils`.",
    readme: 73,
    migrations: []
  },
  {
    id: "2026-10-06-visite-mode-focus",
    date: "2026-10-06",
    title: "Visite guidée : le Mode focus montré dans Paramètres",
    category: "Interface",
    links: [{ href: "/settings#apparence", label: "Paramètres → Apparence & Succès" }],
    result:
      "La visite de bienvenue a une 7e étape « Mode focus » : l'anneau entoure Paramètres dans le menu, une flèche part de la bulle vers lui et le chemin « Paramètres › Apparence & Succès › Mode focus » est écrit (sur téléphone, il commence par Menu). On peut toujours l'activer d'un clic depuis la bulle. L'étape Réussites ne parle plus que des Réussites.",
    change:
      "`src/components/tour/guided-tour.tsx` : options `arrow` et `path` des étapes, `place()` testable avec la flèche, composant `TourArrow` (tracé à l'apparition, fixe avec « Réduire les animations »). `TOUR_STEP_COUNT` (7) partagé avec `PATCH /api/me/tour`.",
    readme: 72,
    migrations: []
  },
  {
    id: "2026-10-03-bilan-du-mois",
    date: "2026-10-03",
    title: "Bilan du mois par e-mail",
    category: "Analytics",
    links: [
      { href: "/analytics/bilan", label: "Bilan du mois" },
      { href: "/settings#compte", label: "Paramètres → Compte" },
      { href: "/admin/bilans", label: "Bilans du mois (admin)" }
    ],
    result:
      "Le 3 de chaque mois, les personnes qui l'ont activé reçoivent le bilan du mois écoulé, un e-mail par marque : abonnés, vues, interactions et publications comparés au mois précédent, courbes jour par jour, top 3, ce qui a marché, communauté, page bio, Réussites et mois suivant. Le même bilan est dans Analytics → Bilan du mois, avec les mois passés.",
    change:
      "Module `src/lib/monthly-summary` (calcul réseau par réseau, e-mail, envoi par le cron avec plafond quotidien `MONTHLY_SUMMARY_DAILY_LIMIT`, désinscription en un clic). Table `MonthlySummary`. Vues YouTube des Rapports clients corrigées (compteur total plus additionné chaque jour).",
    readme: 71,
    migrations: ["20261013090000_monthly_summary"]
  },
  {
    id: "2026-10-03-calendrier-frise",
    date: "2026-10-03",
    title: "Calendrier : frise des semaines plus lisible",
    category: "Calendrier",
    links: [{ href: "/calendar", label: "Calendrier" }],
    result:
      "La frise au-dessus du calendrier n'affiche plus de grand bloc gris : des colonnes fines et proportionnelles, un trait pour une semaine vide, le mois affiché en plage teintée et un point sous la semaine en cours.",
    change: "`src/components/dashboard/week-scrubber.tsx` : colonnes de 24 px au plus (`weekBarHeight`), plage du mois affiché, repère de la semaine en cours.",
    readme: 70,
    migrations: []
  },
  {
    id: "2026-10-03-analytics-graphique-immobile",
    date: "2026-10-03",
    title: "Analytics : « Évolution des abonnés » ne bouge plus au survol",
    category: "Analytics",
    links: [{ href: "/analytics", label: "Analytics" }],
    result:
      "Au premier survol, la carte du graphique s'inclinait en 3D puis sautait à plat. Les graphiques et les grilles du calendrier restent maintenant immobiles ; les petites cartes animées gardent la même légère inclinaison à chaque survol.",
    change: "`MotionGlassCard` : inclinaison par Framer Motion (`rotateX`, `rotateY`, `transformPerspective`), plus faible sur les grandes cartes, option `still`.",
    readme: 69,
    migrations: []
  },
  {
    id: "2026-10-03-reussites-progression-au-choix",
    date: "2026-10-03",
    title: "Réussites : les 3 missions Progression comptent",
    category: "Réussites",
    links: [{ href: "/reussites#missions", label: "Missions de la semaine" }],
    result:
      "Plus besoin de choisir une seule mission Progression : la première des 3 réussie valide la mission. Un clic sur l'une d'elles change seulement l'indication du bas (où aller), autant de fois que voulu, et chacune montre son avancement.",
    change: "`evaluateWeekMissions` valide la Progression par n'importe laquelle des propositions ; `chooseProgress` sans limite ; `MAX_SWAPS` supprimé.",
    readme: 68,
    migrations: []
  },
  {
    id: "2026-10-03-fondateurs-fin-1er-janvier",
    date: "2026-10-03",
    title: "Offres fondateurs : fin le 1er janvier 2027",
    category: "Compte et facturation",
    links: [
      { href: "/tarifs#fondateurs", label: "Tarifs" },
      { href: "/billing", label: "Facturation" }
    ],
    result:
      "Les offres Fondateur et Fondateur Premium affichent leur date de fin, le 1er janvier 2027, sur l'accueil, /tarifs, Facturation, la modale Pro, les FAQ et les conditions. Ce jour-là à 0 h (heure de Paris), la vente s'arrête toute seule ; les fondateurs gardent leurs avantages et leur badge.",
    change:
      "`FOUNDERS_SALE_ENDS_AT` et `foundersSaleOpen()` (`src/lib/founders-offer.ts`) : éligibilité coupée côté serveur après la date, `saleOpen` dans `/api/billing/founders`, section publique masquée, coupon Stripe avec `redeem_by`.",
    readme: 67,
    migrations: []
  },
  {
    id: "2026-10-03-medias-importes-source",
    date: "2026-10-03",
    title: "Médias importés : « Importé depuis Canva »",
    category: "Publication",
    links: [
      { href: "/composer", label: "Publier" },
      { href: "/publications", label: "Publications" }
    ],
    result:
      "Une image ou une vidéo importée depuis Canva, Google Drive, Dropbox, OneDrive ou Unsplash l'indique sous son aperçu dans Publier, sur la page de la publication et dans la liste des publications. Une vidéo importée puis modifiée dans l'éditeur garde la mention.",
    change:
      "Mention lue sur `MediaAsset.importSource`, déjà enregistré par chaque import (`ImportSourceBadge`, libellés dans `src/lib/media-sources.ts`). La vidéo modifiée recopie l'origine de la précédente par `PATCH /api/media/[id] { importSourceFrom }`, seulement depuis un média importé de la même marque.",
    readme: 66,
    migrations: []
  },
  {
    id: "2026-10-03-commentaires-reseaux",
    date: "2026-10-03",
    title: "Commentaires : seulement les réseaux qui les donnent",
    category: "Interface",
    links: [
      { href: "/comments", label: "Commentaires" },
      { href: "/accounts", label: "Comptes connectés" }
    ],
    result:
      "L'onglet Commentaires ne montre plus le bandeau « TikTok, Pinterest ne permet pas encore de lire les commentaires » ni les filtres de ces comptes ; dans Comptes connectés, le lien « Commentaires » disparaît pour TikTok et Pinterest. Bluesky reste : ses réponses sont lues et on peut y répondre.",
    change:
      "Nouvelle propriété `readsComments` des réseaux (`src/lib/types.ts`) : l'onglet ne garde que les comptes dont le client lit les commentaires, le lien du menu de compte est masqué sinon, et `/api/engagement` ne renvoie plus de commentaires pour ces comptes (la démo n'en crée plus). Des tests vérifient que la propriété correspond aux clients réseau et que d'anciennes lignes TikTok ne ressortent pas.",
    readme: 65,
    migrations: []
  },
  {
    id: "2026-10-02-pinterest-bac-a-sable",
    date: "2026-10-02",
    title: "Pinterest : mode bac à sable pour la vidéo de démonstration",
    category: "Publication",
    links: [
      { href: "/accounts", label: "Comptes connectés" },
      { href: "/composer", label: "Publier" }
    ],
    result:
      "Avec l'accès d'essai de Pinterest, la publication d'une épingle échouait. En mode bac à sable, la connexion Pinterest et la publication d'une épingle image fonctionnent de bout en bout (épingle visible par son auteur), ce qui permet d'enregistrer la vidéo demandée par Pinterest pour l'accès « Standard ».",
    change:
      "`PINTEREST_SANDBOX=\"1\"` : appels vers api-sandbox.pinterest.com (échange du code, jetons, tableaux, épingles), tableau « Nebula » créé s'il n'y en a aucun, épingle vidéo refusée avec une explication. Tests de contrat du bac à sable.",
    readme: 64,
    migrations: []
  },
  {
    id: "2026-10-02-pinterest-import-soutenir",
    date: "2026-10-02",
    title: "Pinterest ouvert et import direct des médias sur l'accueil",
    category: "Site public",
    links: [
      { href: "/#import-medias", label: "Accueil : réseaux et import" },
      { href: "/reseaux", label: "Réseaux" },
      { href: "/support", label: "Soutenir Nebula" }
    ],
    result:
      "Pinterest apparaît parmi les connexions officielles (accueil, Réseaux, comparatifs, Sécurité, conditions, outil gratuit) et se connecte dans l'application. Sous les réseaux, l'accueil montre d'où importer photos et vidéos : ordinateur ou téléphone, Google Drive, Dropbox, OneDrive, Canva, Unsplash (seulement les sources réellement ouvertes). La page « Soutenir Nebula » ne liste plus les sous-titres automatiques, le site plus rapide, les serveurs plus puissants ni l'espace vidéo.",
    change:
      "Pinterest ajouté à `LAUNCHED_NETWORKS` (liste d'attente retirée, redirection de /reseaux/pinterest, exemple de démonstration, nouveauté dans les notifications) ; listes de réseaux écrites par `networksSentence()`. Bandeau d'import lu dans `configuredMediaSources()` (clés renseignées), glyphes partagés avec Publier (`src/components/media-import/source-icon.tsx`). Quatre éléments retirés de /support.",
    readme: 63,
    migrations: []
  },
  {
    id: "2026-10-02-accueil-nouveaux-prix",
    date: "2026-10-02",
    title: "Accueil et référencement aux nouveaux prix",
    category: "Site public",
    links: [
      { href: "/#faq", label: "FAQ de l'accueil" },
      { href: "/tarifs", label: "Tarifs" },
      { href: "/admin/partenaires", label: "Partenaires" }
    ],
    result:
      "La FAQ de l'accueil annonce la nouvelle grille (Pro 1, 5 ou 10 marques dès 12 €, Agence 15, 25 ou 50 dès 39 €), l'offre de lancement Fondateur et le renouvellement automatique. La description Google des Tarifs dit « Pro dès 12 € par mois pour 1 marque ». Toutes les pages du plan du site ont été relues : plus aucun ancien prix.",
    change:
      "FAQ de l'accueil (`src/components/marketing/faq.tsx`) et description SEO (`src/lib/seo-pages.ts`) lues dans `plans.ts` et `founders-offer.ts`, libellés au singulier dans /admin/partenaires. Nouveau test : aucune grille de marques ni prix « Pro dès … » écrit en dur hors de `plans.ts`.",
    readme: 62,
    migrations: []
  },
  {
    id: "2026-10-02-recharge-retention-5-99",
    date: "2026-10-02",
    title: "Recharge Rétention à 5,99 €",
    category: "Compte et facturation",
    links: [
      { href: "/billing", label: "Facturation" },
      { href: "/retention", label: "Rétention IA" },
      { href: "/tarifs", label: "Tarifs" }
    ],
    result:
      "La recharge de 20 analyses Rétention coûte 5,99 € au lieu de 3,99 €, partout où elle est proposée (Facturation, Rétention, Tarifs, conditions). Avant l'ouverture, donc sans hausse à annoncer : le modèle qui regarde les vidéos double de prix le 1er janvier 2027, et à 3,99 € il ne serait resté qu'environ 0,75 € par recharge.",
    change:
      "Montant de `RETENTION_PACK` dans `src/lib/plans.ts` (seule source du prix), tests ajustés. Côté Stripe : nouveau prix ponctuel de 5,99 € dans `STRIPE_PRICE_RETENTION_PACK`.",
    readme: 61,
    migrations: []
  },
  {
    id: "2026-10-02-nouvelle-grille-et-fondateurs",
    date: "2026-10-02",
    title: "Nouvelle grille de prix et offres fondateurs",
    category: "Compte et facturation",
    links: [
      { href: "/tarifs", label: "Tarifs" },
      { href: "/billing", label: "Facturation" },
      { href: "/community", label: "Communauté" },
      { href: "/legal", label: "Conditions" }
    ],
    result:
      "Nouvelle grille avant l'ouverture : Pro 1, 5 ou 10 marques à 12, 19 ou 29 € par mois, Agence 15, 25 ou 50 marques à 39, 59 ou 99 € (2 mois offerts à l'année), Gratuit inchangé ; Nebula reste le moins cher sur le scénario de référence des comparatifs, et plus aucune promesse d'« utilisateurs illimités ». Offres de lancement : « Fondateur » (Pro 1 marque à 10 € pendant 3 mois puis 12 €, prélevé automatiquement, 100 premiers abonnés) et « Fondateur Premium » (100 € une fois, Pro 1 marque pendant 1 an, 100 places, sans renouvellement : rappels à J-30 et J-7, puis « Quel forfait vous faut-il ? »). Badge « Fondateur » à vie dans la Communauté et sur la carte de créateur. Places restantes affichées en direct sur les Tarifs.",
    change:
      "Prix dans `src/lib/plans.ts`, offres dans `src/lib/founders-offer.ts` et `src/lib/billing/founders.ts` : coupon Stripe « 2 € pendant 3 mois » plafonné à 100 utilisations (créé tout seul), paiement unique Premium accordé par le webhook via l'accès offert (une fois par session, remboursement géré), rappels et fin d'année par le cron. Un abonné Pro 1 marque avec deux marques garde la seconde en lecture seule, avec la marche à suivre. Conditions (article 6) et FAQ des tarifs complétées.",
    readme: 60,
    migrations: ["20261012090000_founder_offers"]
  },
  {
    id: "2026-10-02-veille-des-api",
    date: "2026-10-02",
    title: "Veille des API : prévenu avant les changements",
    category: "Administration",
    links: [
      { href: "/admin/api", label: "Veille des API" },
      { href: "/admin/reseaux", label: "Réseaux" }
    ],
    result:
      "Le propriétaire est prévenu à l'avance, dans la cloche et par e-mail : rappels à 90, 30 et 7 jours de la fin de vie ou de la date de revue de chaque version d'API et de chaque modèle Gemini, annonces importantes des changelogs officiels (retrait, fin de vie, changement cassant) et signaux de dépréciation renvoyés par les API elles-mêmes. Premier rappel attendu : la v25.0 de la Marketing API de Meta peut être retirée dès le 27/10/2026.",
    change:
      "Calendrier des versions vérifié sur les sources officielles (`src/lib/api-watch/registry.ts`) ; en-têtes Deprecation, Sunset, X-Ad-Api-Version-Warning et version Meta servie lus dans la porte commune des appels (`sendRequest`) ; 8 flux RSS/Atom et 10 pages de changelog relus une fois par jour par le cron (`src/lib/api-watch/watcher.ts`). Page /admin/api avec calendrier, annonces, signaux et sources.",
    readme: 59,
    migrations: ["20261011090000_api_watch"]
  },
  {
    id: "2026-10-02-journal-des-mises-a-jour",
    date: "2026-10-02",
    title: "Journal des mises à jour",
    category: "Administration",
    links: [{ href: "/admin/journal", label: "Journal des mises à jour" }],
    result:
      "Une page d'administration récapitule toutes les mises à jour du site, de la première version à aujourd'hui : pour chacune, la date, les liens directs vers les pages concernées, le résultat visible et ce qui a été modifié. Recherche, filtre par catégorie et copie en Markdown.",
    change:
      "Données dans `src/lib/journal/journal-data.ts`, page /admin/journal réservée au propriétaire. Un test (`tests/quality/journal.test.ts`) oblige à le compléter à chaque livraison : chaque élément du README et chaque migration de la base doit avoir son entrée, et chaque lien doit mener à une page qui existe.",
    readme: 58,
    migrations: []
  }
];

const HISTORY: JournalEntry[] =[
  {
    id: "2026-10-02-reussites-v3",
    date: "2026-10-02",
    title: "Réussites v3 : la qualité avant la quantité",
    category: "Réussites",
    links: [{ href: "/reussites", label: "Réussites" }, { href: "/community?onglet=avis", label: "Communauté → Avis" }],
    result: "Les Réussites récompensent maintenant de vrais résultats : record de vues, engagement au-dessus des repères du réseau, rétention YouTube, croissance réelle des abonnés, avis utiles. Huit rangs sobres (de Lancement à Icône) remplacent les astres, personne ne perd un palier déjà atteint, et chaque record garde sa preuve et sa carte à partager. Les statistiques des comptes connectés se mettent aussi à jour chaque jour, sans clic.",
    change: "Records de qualité mesurés uniquement sur les relevés des API officielles, publications en ligne depuis 7 jours au moins (`src/lib/reussites/quality.ts`) ; 24 paliers dont les 15 premiers gardent leurs seuils d'XP, peu d'XP pour le volume, bouton « Cet avis m'a aidé » dans les Avis de la communauté. Synchro quotidienne automatique : 3 comptes par passage du cron, une fois toutes les 20 h, seulement si un membre de la marque est venu dans les 30 derniers jours (`src/lib/social/auto-sync.ts`).",
    readme: 57,
    migrations: ["20261010090000_reussites_quality"]
  },
  {
    id: "2026-10-02-outils-dans-l-application",
    date: "2026-10-02",
    title: "Les outils gratuits dans l'application",
    category: "Outils",
    links: [{ href: "/tools", label: "Outils" }, { href: "/tools/taux-engagement", label: "Calculateur de taux d'engagement" }, { href: "/outils", label: "Outils gratuits" }],
    result: "Un nouveau menu « Outils », sous Analytics, ouvre les outils gratuits une fois connecté, déjà remplis avec la marque active : taux d'engagement calculé sur les vrais chiffres de chaque compte, meilleur moment au fuseau de la marque, bio et hashtags tirés du media kit ou de la Page bio, derniers titres YouTube, @pseudos pour l'audit. Sur chaque outil, l'assistant « Demander à Nebula » connaît le menu et les mêmes chiffres que la page.",
    change: "Le préremplissage est calculé en lecture seule, sans IA ni appel aux réseaux (`GET /api/tools/context`, `src/lib/tools/app-context.ts`). Le code de chaque outil est partagé entre le site public et l'application (`src/components/tools/bodies/`, liste unique `tool-catalog.ts`) ; les outils IA comptent dans le quota du palier.",
    readme: 56,
    migrations: []
  },
  {
    id: "2026-10-02-meilleur-moment-nan-corrige",
    date: "2026-10-02",
    title: "Meilleur moment pour publier : fin des « NaN h »",
    category: "Outils",
    links: [{ href: "/outils/meilleur-moment", label: "Meilleur moment pour publier" }, { href: "/outils/taux-engagement", label: "Calculateur de taux d'engagement" }],
    result: "L'outil « Meilleur moment pour publier » affiche de vraies heures au lieu de « NaN h » sur tous les créneaux. Le calculateur de taux d'engagement écrit ses repères à la française (« 0,5 % » au lieu de « 0.5 % »).",
    change: "L'outil lisait une heure au format français (« 14 h ») que le calcul ne savait pas lire ; il passe maintenant par `shiftWallHour` (`src/lib/timezone.ts`), couvert par un test sur Paris, Montréal, Nouméa, la Martinique et La Réunion, en heure d'été et d'hiver.",
    readme: 55,
    migrations: []
  },
  {
    id: "2026-10-02-fenetres-au-clavier",
    date: "2026-10-02",
    title: "Fenêtres utilisables au clavier",
    category: "Interface",
    links: [{ href: "/composer", label: "Publier" }, { href: "/community", label: "Communauté" }],
    result: "À l'ouverture d'une fenêtre (signalement, imports, clés d'API, Réussites, carte du media kit, avis…), le focus entre dedans, Tab et Maj+Tab restent à l'intérieur, et la fermeture rend la main au bouton qui l'avait ouverte.",
    change: "Le comportement est géré une seule fois dans le composant `Modal` (`src/components/ui/modal.tsx`), sauf si un champ prend déjà le focus ou si une autre fenêtre, une confirmation par exemple, est au premier plan.",
    readme: 54,
    migrations: []
  },
  {
    id: "2026-10-02-avis-de-la-communaute",
    date: "2026-10-02",
    title: "Avis de la communauté sur une miniature ou un titre",
    category: "Communauté",
    links: [{ href: "/community?onglet=avis", label: "Communauté → Avis" }, { href: "/composer", label: "Publier" }],
    result: "Dans Communauté, l'onglet « Avis » permet de proposer 2 ou 3 miniatures ou titres : les autres créateurs votent et laissent un avis pendant 72 h, et les résultats restent cachés tant qu'on n'a pas voté. Depuis Publier, le bouton « Avis » envoie le titre en cours, et le lien « Hésitation ? Demander l'avis de la communauté » les miniatures proposées.",
    change: "Nouvelles tables de demandes, options, votes et commentaires, avec 2 demandes par semaine en Gratuit et 10 par jour en Essai, Pro et Agence (`src/lib/community/feedback.ts`). Les images sont recopiées dans le stockage du compte et supprimées avec la demande ; les demandes sont effacées 30 jours après leur fin.",
    readme: 53,
    migrations: ["20261009090000_community_feedback"]
  },
  {
    id: "2026-10-02-carte-a-partager-du-media-kit",
    date: "2026-10-02",
    title: "Carte à partager du media kit",
    category: "Page bio et media kit",
    links: [{ href: "/media-kit", label: "Media kit" }],
    result: "Le bouton « Carte à partager » du Media kit crée une image prête à poster avec les chiffres du kit, en story (1080 × 1920) ou en post (1080 × 1350), à télécharger ou à partager depuis le téléphone. Les chiffres portent leur date de relevé, avec le lien du kit public quand il est publié.",
    change: "L'image est fabriquée à la demande, sans rien stocker, par `GET /api/media-kit/card` (membres de la marque uniquement, 40 par heure), à partir des relevés faits par Nebula via les API officielles.",
    readme: 52,
    migrations: []
  },
  {
    id: "2026-10-02-apercu-de-publier-stable",
    date: "2026-10-02",
    title: "L'aperçu de Publier ne tremble plus",
    category: "Interface",
    links: [{ href: "/composer", label: "Publier" }],
    result: "À certaines largeurs de fenêtre (vers 1 110 à 1 160 px), l'aperçu de Publier changeait de taille à chaque image ; il reste maintenant stable.",
    change: "La place de la barre de défilement de la colonne d'aperçu est toujours réservée (`scrollbar-gutter: stable`), et `ScaledFrame` garde la plus petite largeur quand elle oscille entre deux valeurs. Sur un balayage de 76 tailles de fenêtre, plus aucune oscillation (7 avant).",
    readme: 51,
    migrations: []
  },
  {
    id: "2026-10-01-e-mail-de-confirmation",
    date: "2026-10-01",
    title: "E-mail de confirmation de l'adresse plus fiable",
    category: "Compte et facturation",
    links: [{ href: "/dashboard", label: "Vue d'ensemble" }],
    result: "Chaque lien de confirmation reçu fonctionne, même dans un ancien e-mail, et « Renvoyer » affiche un décompte avec au moins une minute entre deux envois. Le bandeau passe en « En attente de confirmation » et disparaît tout seul quand le lien est ouvert ailleurs, sur le téléphone par exemple ; chaque e-mail de Nebula arrive à part dans Gmail.",
    change: "Le délai est réservé côté serveur (colonne `User.emailVerifySentAt`, 3 renvois par heure) et le même lien est renvoyé tant qu'il reste valable (jeton dérivé de `NEXTAUTH_SECRET`). Chaque e-mail porte un en-tête `X-Entity-Ref-ID` unique pour que Gmail ne les regroupe pas.",
    readme: 50,
    migrations: ["20261008090000_email_verify_sent_at"]
  },
  {
    id: "2026-10-01-repondre-aux-commentaires",
    date: "2026-10-01",
    title: "Répondre aux commentaires depuis Nebula",
    category: "Publication",
    links: [{ href: "/comments", label: "Commentaires" }],
    result: "Sous chaque commentaire de la page Commentaires, « Répondre » envoie la réponse sur Instagram, Facebook, Threads ou Bluesky au nom du compte. « Proposer une réponse » remplit le champ avec une suggestion de l'IA, mais rien ne part sans un clic sur « Envoyer ».",
    change: "Nouvelle route `POST /api/engagement/[id]/reply` et méthode `replyToComment` dans chaque client réseau, sans nouvelle permission (`src/lib/engagement/reply.ts`). Garde-fous : rôle lecteur, marque en veille et réseau suspendu refusés, 60 réponses par heure, longueur maximale du réseau, et un envoi sans confirmation du réseau n'est jamais renvoyé tout seul.",
    readme: 49,
    migrations: []
  },
  {
    id: "2026-10-01-supprimer-aussi-sur-les-reseaux",
    date: "2026-10-01",
    title: "« Supprimer aussi sur … » les réseaux",
    category: "Publication",
    links: [{ href: "/publications", label: "Publications" }],
    result: "En supprimant une publication, une case par réseau permet de la retirer aussi de Facebook, LinkedIn, Pinterest ou Bluesky (Instagram et Threads selon les permissions). Pour YouTube et TikTok, la fenêtre donne la marche à suivre avec le lien ; si un réseau échoue, la publication reste dans Nebula avec le détail par réseau.",
    change: "La suppression ne touche que les réseaux cochés et qui le permettent (`src/lib/social/remote-delete-support.ts`, `src/lib/posts/remote-delete.ts`, `deletePost` de chaque client). Ce qui a déjà été retiré est noté sur la fiche, et une publication déjà absente du réseau compte comme supprimée.",
    readme: 48,
    migrations: []
  },
  {
    id: "2026-10-01-collaborateurs-instagram-et-apercu",
    date: "2026-10-01",
    title: "Collaborateurs Instagram et aperçu au format de la vidéo",
    category: "Publication",
    links: [{ href: "/composer", label: "Publier" }],
    result: "Dans Publier, on peut inviter jusqu'à 3 comptes Instagram comme co-auteurs, visibles dans l'aperçu. L'aperçu respecte aussi le format de la vidéo : vertical en Reels, Shorts ou TikTok plein écran, paysage ou carré à son format (avant, une vidéo 16:9 était rognée dans l'écran Reels).",
    change: "Les collaborateurs passent par le paramètre `collaborators` de l'API Graph, sans nouvelle permission ; les noms sont nettoyés et, si Instagram refuse un compte, la publication part sans lui (`src/lib/social/instagram-collaborators.ts`).",
    readme: 47,
    migrations: []
  },
  {
    id: "2026-10-01-retouches-publier-comptes-listes",
    date: "2026-10-01",
    title: "Retouches de Publier, des comptes et des listes",
    category: "Interface",
    links: [{ href: "/composer", label: "Publier" }, { href: "/publications", label: "Publications" }, { href: "/accounts", label: "Comptes connectés" }],
    result: "Une Page Facebook connectée a enfin une pastille verte, et retirer un média de Publier demande une confirmation. La liste des publications montre le logo et le nom de chaque réseau avec des statuts plus marqués, la grille des miniatures a une case « Votre image », et l'IA de Publier n'écrit plus que le titre et la description.",
    change: "Un compte sans date d'expiration (jeton de Page Facebook) est considéré comme valide ; la fenêtre de confirmation, commune à tout le site, met le focus sur « Annuler » et se ferme avec Échap. Les boutons IA des textes par réseau (étape 4) sont retirés et « Générer tout » ne touche plus que les étapes 2 et 3.",
    migrations: []
  },
  {
    id: "2026-09-30-permissions-meta-completees",
    date: "2026-09-30",
    title: "Statistiques Facebook et Instagram complètes",
    category: "Analytics",
    links: [{ href: "/accounts", label: "Comptes connectés" }, { href: "/analytics", label: "Analytics" }, { href: "/comments", label: "Commentaires" }],
    result: "Après reconnexion des comptes Instagram et Facebook, les vues de la Page, les commentaires des abonnés et les vues, portée, partages et enregistrements Instagram ne reviennent plus vides. La connexion Meta n'échoue plus avec « État OAuth invalide ».",
    change: "Nebula demande maintenant `read_insights`, `pages_read_user_content` et `instagram_manage_insights`, listées dans `META_PAGES_SCOPES` et `META_INSTAGRAM_SCOPES` (`src/lib/social/meta.ts`) et vérifiées par un test. Instagram et Facebook reviennent sur une seule adresse, `/api/connections/meta/callback` ; les anciennes restent acceptées.",
    readme: 46,
    migrations: []
  },
  {
    id: "2026-09-30-pre-lancement-inscriptions-fermees",
    date: "2026-09-30",
    title: "Pré-lancement : inscriptions fermées",
    category: "Site public",
    links: [{ href: "/bientot", label: "Nebula ouvre bientôt" }, { href: "/admin/lancement", label: "Lancement" }],
    result: "Le site reste visible, mais par défaut les inscriptions sont fermées : un bandeau « Nebula ouvre bientôt » s'affiche et les boutons d'inscription mènent à la page animée /bientot, avec le formulaire « Prévenez-moi du lancement ». Seules les adresses autorisées peuvent entrer, et le propriétaire suit la liste et annonce l'ouverture depuis /admin/lancement.",
    change: "Barrières côté serveur : inscription refusée (403), connexion par mot de passe et par Google, Apple ou Meta refusées avant toute lecture en base, sessions non invitées coupées (`src/lib/launch.ts`, `src/middleware.ts`). L'ouverture se fait avec `NEXT_PUBLIC_SITE_OPEN=true`, et l'annonce envoie un seul e-mail par personne, 90 par clic.",
    readme: 45,
    migrations: ["20261007090000_launch_waitlist_notified"]
  },
  {
    id: "2026-09-30-editeur-video",
    date: "2026-09-30",
    title: "Éditeur vidéo dans Publier",
    category: "Publication",
    links: [{ href: "/composer", label: "Publier" }],
    result: "Le bouton « Modifier la vidéo » ouvre un éditeur complet, pour tous les paliers : couper, recadrer (9:16, 4:5, 1:1, 16:9), régler lumière et couleurs, 10 filtres, autocollants, dessin, dimensions, son gardé ou coupé, annuler et rétablir. La vidéo modifiée remplace l'originale dans la publication.",
    change: "Tout se fait dans le navigateur (WebGL et WebCodecs, bibliothèque Mediabunny), sans serveur ni coût ; le MP4 final (H.264 et AAC) est envoyé comme un import normal (`src/lib/video-editor/`). Un encodeur AAC en WebAssembly prend le relais sur Firefox et certains Safari ; vidéos de 10 minutes au plus.",
    readme: 44,
    migrations: []
  },
  {
    id: "2026-09-30-son-de-l-apercu",
    date: "2026-09-30",
    title: "Le son dans l'aperçu de Publier",
    category: "Publication",
    links: [{ href: "/composer", label: "Publier" }],
    result: "Un bouton haut-parleur dans la barre de l'aperçu permet d'entendre la vidéo, et un clic sur la vidéo active aussi le son. Le choix reste le même en changeant de réseau ou de format.",
    change: "Les navigateurs ne lancent la lecture automatique que sans le son : l'aperçu fidèle restait donc muet. Le bouton est ajouté dans Publier et dans l'outil gratuit /outils/publier.",
    migrations: []
  },
  {
    id: "2026-09-30-cles-developpeur-nettoyees",
    date: "2026-09-30",
    title: "Clés des réseaux lues sans caractère parasite",
    category: "Fiabilité",
    links: [{ href: "/accounts", label: "Comptes connectés" }],
    result: "La connexion TikTok n'échoue plus avec l'erreur « client_key » quand la clé a été collée avec un retour à la ligne.",
    change: "Nebula lit toutes les clés développeur des réseaux sans espaces, retours à la ligne ni guillemets autour. Les étapes du sandbox TikTok sont décrites dans `.env.example`.",
    migrations: []
  },
  {
    id: "2026-09-30-gemini-payant-quotas-du-mois",
    date: "2026-09-30",
    title: "Gemini payant : quotas du mois et recharges",
    category: "IA",
    links: [{ href: "/billing", label: "Facturation" }, { href: "/retention", label: "Rétention IA" }, { href: "/admin/ia", label: "Coûts de l'IA" }],
    result: "L'IA passe aux meilleurs modèles « Flash » de Gemini en version payante, sans les refus du palier gratuit. Chaque palier a ses quotas du mois (Rétention, miniatures, Studio, assistant), affichés dans Facturation, et une recharge ajoute 20 analyses Rétention pour 3,99 € en Pro et Agence. Nebula est désormais réservé aux 18 ans et plus : case à cocher à l'inscription, confirmation unique pour les comptes existants.",
    change: "Modèles `gemini-3.8-flash` et `gemini-3.1-flash-image`, quotas mensuels par compte remis à zéro le 1er à l'heure de Paris (`AI_MONTHLY` dans `src/lib/plans.ts`, table `AiMonthlyUsage`), recharge en paiement unique Stripe créditée une seule fois (`src/lib/billing/retention-pack.ts`). Sans âge confirmé, l'IA est refusée ; `/admin/ia` montre les modèles, les prix en vigueur et le coût moyen par action.",
    readme: 43,
    migrations: ["20261006090000_gemini_paid_monthly_quotas"]
  },
  {
    id: "2026-09-30-retention-ia-regarde-la-video",
    date: "2026-09-30",
    title: "Rétention IA regarde la vidéo",
    category: "IA",
    links: [{ href: "/retention", label: "Rétention IA" }],
    result: "Sur une vidéo YouTube publique de 20 minutes au plus, l'IA regarde la vidéo entière pour expliquer chaque chute de la courbe ; au-delà, le début et les passages des chutes. Pour une vidéo privée ou non listée, l'écran signale que l'IA n'a vu que la miniature. Une vidéo déjà analysée n'est pas recomptée.",
    change: "Nebula calcule les chutes sur la vraie courbe YouTube Analytics et l'IA ne fait que les expliquer : tout chiffre qu'elle inventerait est retiré (`src/lib/ai/retention.ts`). La réponse arrive en flux, jusqu'à 5 minutes par analyse.",
    migrations: []
  },
  {
    id: "2026-09-30-reussites-au-centre",
    date: "2026-09-30",
    title: "Réussites au centre, Mode focus au choix",
    category: "Réussites",
    links: [{ href: "/", label: "Accueil du site" }, { href: "/reussites", label: "Réussites" }, { href: "/settings#apparence", label: "Paramètres" }],
    result: "L'accueil du site présente les Réussites dès l'introduction, avec une section et une vraie capture. Pour les nouveaux comptes, le Mode focus est désactivé par défaut et proposé d'un clic dans la visite guidée ; activé, il masque tout ce qui est ludique (carte de rang, pastilles, notifications « Succès », sons, easter eggs).",
    change: "Le Mode focus démarre désactivé pour les comptes créés à partir de cette mise à jour, les comptes existants gardent leur réglage. Les easter eggs « Vu dans le code source » et « Message dans la console » demandent maintenant un code à taper dans la palette (Ctrl/Cmd+K) au lieu d'être accordés au simple affichage d'une page.",
    readme: 42,
    migrations: []
  },
  {
    id: "2026-09-30-tiktok-direct-post",
    date: "2026-09-30",
    title: "TikTok conforme aux règles « Direct Post »",
    category: "Publication",
    links: [{ href: "/composer", label: "Publier" }, { href: "/accounts", label: "Comptes connectés" }],
    result: "La section TikTok de Publier affiche le compte qui publie et demande de choisir la confidentialité, sans valeur par défaut ; Commentaires, Duo et Collage sont éteints par défaut, la durée est vérifiée et le contenu commercial se déclare. Le bouton Publier reste désactivé tant qu'un choix manque, et les comptes TikTok déjà connectés doivent être reconnectés.",
    change: "Les règles vivent dans `src/lib/social/tiktok-direct-post.ts` et sont revérifiées à l'envoi avec `creator_info`. Le fichier part par morceaux (`FILE_UPLOAD`) avec reprise au passage suivant du cron, et les scopes sont `user.info.basic`, `user.info.stats`, `video.publish` et `video.list`.",
    readme: 41,
    migrations: []
  },
  {
    id: "2026-09-30-communaute-moderee",
    date: "2026-09-30",
    title: "Communauté modérée : signaler et supprimer",
    category: "Communauté",
    links: [{ href: "/community", label: "Communauté" }],
    result: "Un bouton « Signaler » apparaît sur chaque sujet, réponse et lien partagé de la Communauté, avec un motif au choix. Le propriétaire du site est prévenu dans la cloche et peut supprimer n'importe quel contenu ; chaque auteur peut aussi supprimer ses propres réponses.",
    change: "Nouvelle table `CommunityReport` (un signalement par personne et par contenu, jamais sur son propre contenu, 20 par heure au plus) et module `src/lib/community/moderation.ts`. Les signalements d'un contenu supprimé partent avec lui ; la même migration désactive le Mode focus par défaut pour les nouveaux comptes.",
    readme: 40,
    migrations: ["20261005090000_community_reports_focus_default"]
  },
  {
    id: "2026-09-30-generateur-de-publications",
    date: "2026-09-30",
    title: "Un seul outil : le Générateur de publications",
    category: "Outils",
    links: [{ href: "/outils", label: "Outils gratuits" }],
    result: "Les générateurs de légendes et de miniatures ne font plus qu'un outil, /outils/publier, construit comme la page Publier : média et miniature, titre, description, réseau, publication, avec l'aperçu fidèle à droite. Les anciennes adresses redirigent vers le nouvel outil.",
    change: "Nouvelle page `src/app/outils/publier/`, redirections permanentes de `/outils/legendes` et `/outils/miniatures`, hub, sitemap, pied de page et `llms.txt` mis à jour. Les aperçus des réseaux gardent leurs couleurs d'origine en mode clair (heure de la barre d'état, logo Instagram).",
    readme: 39,
    migrations: []
  },
  {
    id: "2026-09-30-reussites-onglets-visite-guidee-sons",
    date: "2026-09-30",
    title: "Réussites en onglets, visite guidée et sons",
    category: "Interface",
    links: [{ href: "/reussites", label: "Réussites" }, { href: "/reussites/collection", label: "Collection des Easter eggs" }, { href: "/settings", label: "Paramètres" }],
    result: "La page Réussites se range en trois onglets (Missions, Compétences, Récompenses) et la collection des Easter eggs a sa propre page. À la première connexion, une visite guidée de 6 bulles présente l'application (« Revoir la visite » dans Paramètres et ⌘K), et de courts sons accompagnent quelques actions clés, réglables dans « Sons de l'interface ».",
    change: "Onglets construits avec le composant `Tabs` partagé, gros morceaux chargés à la demande ; visite ancrée sur des attributs `data-tour` (`src/components/tour/guided-tour.tsx`), sons centralisés dans `src/lib/ui-sounds.ts`. Les comparatifs perdent « en français » dans leurs titres et l'Easter egg « Statue » est corrigé.",
    readme: 38,
    migrations: []
  },
  {
    id: "2026-09-30-couts-de-l-ia",
    date: "2026-09-30",
    title: "Coûts de l'IA suivis par le propriétaire",
    category: "Administration",
    links: [{ href: "/admin/ia", label: "Coûts de l'IA" }],
    result: "La page /admin/ia montre le coût estimé de l'IA sur 30 jours par palier et par type, les budgets du jour, les 20 comptes les plus coûteux, le taux essai → payant et le coût des essais par abonné gagné. Une alerte arrive dans la cloche au-delà du seuil.",
    change: "L'usage est rangé par jour, palier et type dans une nouvelle table (`AiUsageDaily`) et valorisé avec les prix de `src/lib/ai/pricing.ts`, à revérifier sur la page de Google ; seuil d'alerte réglable par `AI_DAILY_COST_ALERT_USD`.",
    readme: 37,
    migrations: []
  },
  {
    id: "2026-09-30-fin-d-essai-propre",
    date: "2026-09-30",
    title: "Fin d'essai propre : rien n'est supprimé",
    category: "Compte et facturation",
    links: [{ href: "/billing/garder", label: "Choisir ce que je garde" }, { href: "/billing", label: "Facturation" }],
    result: "À la fin de l'essai, l'utilisateur choisit la marque et les comptes qui restent actifs en Gratuit (sinon la marque la plus utilisée sur 14 jours) ; les autres passent « en veille », sans rien perdre. Les publications à plus de 7 jours repassent en brouillon et repartent d'un clic au passage en Pro.",
    change: "Une seule fonction, `applyFreeLimits` (`src/lib/billing/free-limits.ts`), sert à toutes les descentes en Gratuit : marques et comptes en veille ne publient ni ne se synchronisent, et la réactivation passe par le webhook, la reprise de pause ou un filet du cron. Changer de marque active est possible une fois tous les 30 jours.",
    readme: 36,
    migrations: []
  },
  {
    id: "2026-09-30-un-essai-par-personne",
    date: "2026-09-30",
    title: "Un essai par personne",
    category: "Compte et facturation",
    links: [{ href: "/register", label: "Inscription" }, { href: "/billing", label: "Facturation" }],
    result: "Une adresse déjà passée par un essai (y compris avec un +alias ou des points Gmail), un compte supprimé puis recréé, une adresse jetable ou une 3e inscription depuis un même réseau en 30 jours donnent un compte Gratuit, sans essai. L'inscription n'est jamais bloquée : une ligne discrète l'explique dans Facturation.",
    change: "Les adresses ayant eu un essai sont gardées sous forme d'empreinte HMAC pendant 12 mois (table `TrialGrant`, `src/lib/billing/trial-eligibility.ts`), avec une liste de domaines jetables. Les inscriptions sont limitées à 5 par heure et par IP, et la politique de confidentialité est à jour.",
    readme: 35,
    migrations: []
  },
  {
    id: "2026-09-30-ia-protegee",
    date: "2026-09-30",
    title: "IA protégée par une porte unique",
    category: "IA",
    links: [{ href: "/billing", label: "Facturation" }, { href: "/outils", label: "Outils gratuits" }],
    result: "Tous les usages de l'IA suivent les mêmes règles : adresse e-mail confirmée en Gratuit et en Essai, quota du compte, plafond par connexion sur les outils et budget global du jour. Un refus ouvre la fenêtre « Passer en Pro » ou « Confirmez votre adresse », jamais un simple message.",
    change: "Tous les appels à Gemini passent par `assertAiAllowed` (`src/lib/ai/guard.ts`), avec réservation atomique du quota en base et remboursement si Google n'a rien facturé. Les budgets du jour de l'Essai et du Gratuit sont réglables par des variables Vercel facultatives.",
    readme: 34,
    migrations: []
  },
  {
    id: "2026-09-30-palier-essai",
    date: "2026-09-30",
    title: "Palier « Essai » de 14 jours",
    category: "Compte et facturation",
    links: [{ href: "/billing", label: "Facturation" }, { href: "/dashboard", label: "Vue d'ensemble" }],
    result: "L'essai devient un palier à part entière (14 jours, 30 avec parrainage), avec ses propres limites d'IA et 2 marques à la création. Un bandeau « Essai — n jours restants » et une carte « Essai jusqu'au … » dans Facturation indiquent où l'on en est, et une fenêtre claire s'ouvre quand une limite du jour est atteinte.",
    change: "`getUserPlan` renvoie `TRIAL` et les gardes lisent des capacités au lieu de comparer des noms de paliers, ce qu'un test vérifie dans tout le code. L'essai ne s'achète pas et n'est jamais écrit par le webhook Stripe ; la migration ajoute aussi le registre des essais, l'état « en veille », le suivi des coûts de l'IA, la visite guidée et les sons.",
    readme: 33,
    migrations: ["20261004090000_trial_tier_ai_costs"]
  },
  {
    id: "2026-09-29-accueil-vraies-captures",
    date: "2026-09-29",
    title: "Accueil refait avec de vraies captures",
    category: "Site public",
    links: [{ href: "/", label: "Accueil du site" }, { href: "/decouvrir/page-bio", label: "Découvrir la Page bio" }, { href: "/decouvrir/rapports-clients", label: "Découvrir les rapports clients" }],
    result: "L'accueil montre l'application telle qu'elle est (tableau de bord, Publier, Calendrier, Analytics, Studio IA, Page bio, Rapports), en clair et en sombre, avec une visite en 6 onglets. Les pages « Découvrir » et la fenêtre « Passer en Pro » utilisent aussi ces vraies captures.",
    change: "Les captures sont prises sur un compte de démonstration aux données fictives (`scripts/demo/`) et affichées sans JavaScript par `ProductShot` (`src/components/marketing/product-shot.tsx`) ; les anciens faux écrans sont supprimés.",
    readme: 32,
    migrations: []
  },
  {
    id: "2026-09-29-outils-fideles-a-l-application",
    date: "2026-09-29",
    title: "Outils Légendes et Miniatures fidèles à l'application",
    category: "Outils",
    links: [{ href: "/outils", label: "Outils gratuits" }],
    result: "Les outils gratuits reprennent les écrans de Publier : même éditeur, même aperçu fidèle, et un exemple qui suit le réseau choisi. Pour les miniatures, le navigateur extrait 12 images de la vidéo sans l'envoyer nulle part ; avec un compte, l'IA choisit les 3 meilleures.",
    change: "Nouvelle route `/api/public/tools/pick-frames` (compte requis, quota des textes) ; la fausse démo illustrée et le cadre « En attente » qui ne bougeait jamais sont supprimés. Ces deux outils ont été réunis le lendemain dans le Générateur de publications.",
    migrations: []
  },
  {
    id: "2026-09-29-mentions-legales-completes",
    date: "2026-09-29",
    title: "Mentions légales complètes",
    category: "Site public",
    links: [{ href: "/legal", label: "Mentions légales" }],
    result: "La page /legal affiche l'éditeur (entrepreneur individuel, nom commercial Nebula), son immatriculation, son activité et son adresse, et la politique de confidentialité nomme le responsable du traitement. L'adresse de contact par défaut devient contact@nebulahub.space.",
    change: "Les informations sont écrites dans `src/lib/site.ts`, les variables `NEXT_PUBLIC_LEGAL_*` restant facultatives pour corriger sans toucher au code ; un test vérifie la clé de contrôle du SIREN et du SIRET.",
    migrations: []
  },
  {
    id: "2026-09-29-mode-clair-par-defaut",
    date: "2026-09-29",
    title: "Mode clair par défaut",
    category: "Interface",
    links: [{ href: "/", label: "Accueil du site" }, { href: "/settings", label: "Paramètres" }],
    result: "Tout le site s'ouvre en clair, sans clignotement ; le sombre reste au choix, par le bouton soleil/lune sur la vitrine ou la bascule Clair / Sombre dans l'application. La page bio, le media kit, les rapports, le calendrier partagé et l'approbation gardent leur propre design.",
    change: "Un petit script dans `<head>` pose le mode avant l'affichage, autorisé par son empreinte sur les pages à CSP stricte (`src/lib/color-mode.ts`). Tous les comptes existants passent en clair, et des textes illisibles en clair ont été corrigés au passage.",
    readme: 31,
    migrations: ["20261003090000_light_mode_default"]
  },
  {
    id: "2026-09-29-metadonnees-retirees-des-medias",
    date: "2026-09-29",
    title: "Position GPS et métadonnées retirées des médias",
    category: "Sécurité",
    links: [{ href: "/composer", label: "Publier" }],
    result: "La position GPS, l'appareil et l'auteur sont retirés des photos et vidéos avant leur enregistrement, sans perte de qualité.",
    change: "Photos JPEG, PNG et WebP nettoyées sans nouvel encodage (orientation gardée) et position des vidéos MP4 et MOV effacée, dans le navigateur avant l'envoi et sur le serveur (`src/lib/media-metadata.ts`). Limite : les vidéos importées depuis Drive ou Dropbox ne sont pas traitées.",
    readme: 30,
    migrations: []
  },
  {
    id: "2026-09-29-preferences-et-brouillon-dans-le-compte",
    date: "2026-09-29",
    title: "Préférences et brouillon suivent le compte",
    category: "Interface",
    links: [{ href: "/composer", label: "Publier" }, { href: "/calendar", label: "Calendrier" }],
    result: "La vue du calendrier, le menu replié, le son des succès et le brouillon de Publier se retrouvent d'un appareil à l'autre.",
    change: "Les préférences d'affichage sont enregistrées dans le compte (liste fermée, `src/lib/ui-prefs.ts`) et le brouillon dans une table dédiée (`ComposerDraft`) ; le navigateur n'en garde qu'une copie, et les anciennes valeurs locales sont envoyées au compte une fois.",
    readme: 29,
    migrations: []
  },
  {
    id: "2026-09-29-statistiques-anonymes",
    date: "2026-09-29",
    title: "Statistiques anonymes : un cadre prêt, rien de vendu",
    category: "Administration",
    links: [{ href: "/settings#compte", label: "Paramètres" }, { href: "/admin/statistiques", label: "Statistiques anonymes" }],
    result: "Une case facultative, décochée par défaut, à l'inscription et dans Paramètres → Compte permet d'accepter que ses données comptent dans des chiffres de groupe anonymes. Le propriétaire les consulte et les exporte en CSV dans /admin/statistiques ; rien n'est vendu.",
    change: "Calcul quotidien sur le serveur (`src/lib/anon-stats/`), uniquement sur les données propres à Nebula et avec au moins 20 comptes par chiffre ; CGU et politique de confidentialité mises à jour. La même migration ajoute les préférences et le brouillon enregistrés dans le compte.",
    readme: 28,
    migrations: ["20261002091000_stats_consent_prefs"]
  },
  {
    id: "2026-09-29-seo-technique",
    date: "2026-09-29",
    title: "SEO technique complet",
    category: "Site public",
    links: [{ href: "/", label: "Accueil du site" }, { href: "/tarifs", label: "Tarifs" }, { href: "/outils", label: "Outils gratuits" }, { href: "/alternatives", label: "Comparatifs" }],
    result: "Chaque page publique a son titre, sa description, sa canonique et son propre aperçu de partage (outils, tarifs, comparatifs). Les moteurs de recherche reçoivent des données structurées qui décrivent Nebula, ses prix et chaque outil.",
    change: "Titres et descriptions centralisés dans `src/lib/seo-pages.ts` ; données structurées Organization, WebSite, SoftwareApplication avec les prix réels, WebApplication par outil et fil d'Ariane, sans note ni avis inventés. Balises facultatives de vérification Google et Bing.",
    readme: 27,
    migrations: []
  },
  {
    id: "2026-09-29-outils-ia-demo-sans-compte",
    date: "2026-09-29",
    title: "Outils IA : démo sans compte",
    category: "Outils",
    links: [{ href: "/outils", label: "Outils gratuits" }],
    result: "Sans compte, les outils IA montrent une démo préparée à l'avance, annoncée « Démo · sans IA ». Avec un compte gratuit, la vraie génération est disponible, avec 10 textes par jour.",
    change: "Les routes de génération exigent une session (401 sinon) et comptent un quota par compte selon le palier, plus un plafond par adresse IP pour les comptes Gratuits ; exemples écrits dans `src/lib/tools/demo.ts`. La clé Gemini n'est plus consommée par des visiteurs anonymes.",
    readme: 26,
    migrations: []
  },
  {
    id: "2026-09-29-mot-de-passe-depuis-parametres",
    date: "2026-09-29",
    title: "Définir ou changer son mot de passe",
    category: "Sécurité",
    links: [{ href: "/settings#compte", label: "Paramètres" }, { href: "/forgot-password", label: "Mot de passe oublié" }],
    result: "Un compte créé avec Google peut définir un mot de passe, les autres le changent avec l'actuel et une confirmation ; les autres appareils sont déconnectés et un e-mail d'alerte est envoyé. « Mot de passe oublié » dit clairement quand l'envoi d'e-mails n'est pas configuré.",
    change: "5 essais par quart d'heure et 72 octets au plus (`src/lib/password-rules.ts`) ; toutes les sessions sont coupées, puis la session en cours est rouverte. Un compte sans mot de passe confirme sa suppression en retapant son adresse.",
    readme: 25,
    migrations: []
  },
  {
    id: "2026-09-29-formulaire-de-contact-fiable",
    date: "2026-09-29",
    title: "Formulaire de contact fiable",
    category: "Site public",
    links: [{ href: "/contact", label: "Contact" }, { href: "/admin/messages", label: "Messages" }],
    result: "Un message envoyé depuis la page Contact n'est plus jamais perdu : il est lisible dans /admin/messages même si l'e-mail ne part pas. La case anti-robot est plus claire et fonctionne de nouveau après une erreur.",
    change: "Le message est enregistré en base (table `ContactMessage`) avant toute tentative d'e-mail, signalé dans la cloche du propriétaire et purgé à 12 mois. Le jeton anti-robot est renouvelé après chaque envoi, aussi sur l'inscription, le mot de passe oublié, l'audit et les listes d'attente.",
    readme: 24,
    migrations: ["20261002090000_contact_messages"]
  },
  {
    id: "2026-09-29-intro-de-creation-de-compte",
    date: "2026-09-29",
    title: "Intro animée à la création du compte",
    category: "Interface",
    links: [{ href: "/register", label: "Inscription" }],
    result: "Juste après « Créer mon espace », la page devient blanche, les anneaux du logo arrivent de l'extérieur de l'écran et « Nebula » s'écrit avec une aura et un son. Après une inscription Google, Apple ou Facebook, elle se joue à l'arrivée sur le tableau de bord ; Échap la passe.",
    change: "Intro en WebGL avec un son synthétisé (Web Audio, aucun fichier), chargée seulement à ce moment-là (`src/lib/intro/`, `src/components/intro/`). Avec « Réduire les animations » ou sans WebGL, un logo simple apparaît en fondu.",
    readme: 23,
    migrations: []
  },
  {
    id: "2026-09-29-assistant-epure-et-logo",
    date: "2026-09-29",
    title: "Assistant épuré et logo sans étoile",
    category: "Interface",
    links: [{ href: "/dashboard", label: "Vue d'ensemble" }, { href: "/securite", label: "Sécurité" }],
    result: "L'assistant IA n'affiche plus l'indicateur « Contexte : … » et son champ indique simplement « Posez votre question… ». L'étoile dans le N de « Nebula » disparaît des logos du site et des e-mails, et la page Sécurité ne garde qu'un bouton « Nous contacter ».",
    change: "Retouches de textes et de logo : wordmark du site, règles CSS associées et logo des e-mails (`public/email/nebula-logo.png`) régénéré ; l'étoile au centre de l'icône reste.",
    migrations: []
  },
  {
    id: "2026-09-25-media-kit-public",
    date: "2026-09-25",
    title: "Media kit public",
    category: "Page bio et media kit",
    links: [{ href: "/media-kit", label: "Media kit" }, { href: "/decouvrir/media-kit", label: "Découvrir le media kit" }],
    result: "Le créateur prépare une page à envoyer aux marques et aux sponsors : audience totale, vues sur 90 jours, engagement moyen, rythme de publication et une carte par compte, avec ses publications à la une, ses offres et son contact. Les chiffres sont relevés par Nebula et ne se modifient pas ; le kit se télécharge en PDF, et sa publication est réservée à Pro et Agence.",
    change: "Aucun chiffre n'est stocké avec le kit : tout est recalculé depuis les relevés des API officielles (`src/lib/media-kit/stats.ts`), et la table `MediaKit` ne garde que les réglages et le compteur d'ouvertures, sans cookie. Page publique `/kit/<marque>` non indexée, servie depuis le cache et invalidée à chaque modification.",
    readme: 22,
    migrations: ["20261001090000_media_kit"]
  },
  {
    id: "2026-09-25-studio-ia",
    date: "2026-09-25",
    title: "Studio IA : idées, accroches et scripts",
    category: "IA",
    links: [{ href: "/studio", label: "Studio IA" }, { href: "/composer", label: "Publier" }],
    result: "Le Studio IA propose des idées de vidéos avec leurs accroches et des scripts complets, écrits à partir de ce qui marche déjà pour la marque. Une idée devient un script en un clic, et « Utiliser dans Publier » préremplit le titre, la légende et le réseau ; en Gratuit, les chiffres restent visibles et la génération ouvre l'offre Pro.",
    change: "Les faits « ce qui marche chez vous » sont calculés par Nebula sans IA (`src/lib/studio/facts.ts`), puis Gemini écrit en JSON vérifié par un contrat, sans pouvoir inventer de chiffre. Historique de 50 résultats par marque (table `StudioGeneration`), et un échec de l'IA ne décompte rien.",
    readme: 21,
    migrations: ["20260930090000_studio_ia"]
  },
  {
    id: "2026-09-25-audit-de-presence-en-ligne",
    date: "2026-09-25",
    title: "Audit de présence en ligne gratuit",
    category: "Outils",
    links: [{ href: "/outils/audit", label: "Audit de présence en ligne" }],
    result: "Un visiteur colle ses liens (YouTube, Instagram professionnel, TikTok, site ou page bio) et obtient en quelques secondes un score sur 100, les actions à faire en premier et trois paragraphes de conseils. Le rapport se partage par un lien secret, n'est jamais indexé, se supprime d'un clic et disparaît après 30 jours.",
    change: "Chaque note vient d'une règle affichée dans « Pourquoi ce score » (`src/lib/audit/score.ts`) et Gemini ne reçoit que les faits calculés. Sources publiques et officielles uniquement (clé d'API YouTube, Business Discovery, oEmbed TikTok), 3 audits par jour et par IP, anti-robot Turnstile.",
    readme: 20,
    migrations: ["20260929090000_public_audit"]
  },
  {
    id: "2026-09-25-reussites-v2-defi-collectif",
    date: "2026-09-25",
    title: "Réussites v2 : défi collectif et rareté",
    category: "Réussites",
    links: [{ href: "/reussites", label: "Réussites" }, { href: "/admin/reussites", label: "Réussites (admin)" }],
    result: "Un défi collectif du mois réunit tous les créateurs : objectif atteint, chaque participant reçoit un badge et +50 XP. S'ajoutent un badge de saison, la rareté réelle de chaque badge (part des créateurs, à partir de 20), « Premier décollage » pendant les 7 premiers jours et le badge caché « Explorateur ».",
    change: "Objectif automatique (mois précédent + 10 %, au moins 10), réglable dans `/admin/reussites` ; badges accordés par des clés uniques en base, jamais deux fois (`src/lib/reussites/collective.ts`, `seasons.ts`, `rarity.ts`). Le badge Explorateur s'appuie sur un petit cookie technique `nb_tools`, décrit dans les mentions légales.",
    readme: 19,
    migrations: ["20260928090000_reussites_social"]
  },
  {
    id: "2026-09-25-videos-a-la-une",
    date: "2026-09-25",
    title: "Vidéos à la une dans la Communauté",
    category: "Communauté",
    links: [{ href: "/community", label: "Communauté" }, { href: "/reussites", label: "Réussites" }],
    result: "Trois vidéos de créateurs sont mises à la une en haut de la Communauté, 7 jours chacune. Une place se gagne au rang Constellation I ou, rarement, dans le coffre, et seulement avec l'accord du créateur, qui peut retirer sa vidéo à tout moment.",
    change: "On affiche un lien vers le réseau, jamais une copie, et seulement une vidéo déjà partagée dans la Communauté (`src/lib/reussites/featured.ts`). Le propriétaire du site peut aussi mettre une vidéo à la une ou la retirer depuis `/admin/reussites`.",
    migrations: []
  },
  {
    id: "2026-09-25-reussites-v2-constellation",
    date: "2026-09-25",
    title: "Réussites v2 : la constellation de compétences",
    category: "Réussites",
    links: [{ href: "/reussites#competences", label: "Réussites → Compétences" }, { href: "/community", label: "Communauté" }],
    result: "25 étoiles réparties en 5 compétences (Régularité, Formats vidéo, Portée, Communauté, Stratégie), chacune avec une mini-leçon de 2 minutes. Les rangs Étoile, Constellation et Nébuleuse demandent aussi des compétences variées, sans jamais retirer un rang atteint ; s'ajoutent un bilan de la semaine, une vitrine de 3 badges visible dans la Communauté et une carte de créateur en image.",
    change: "Étoiles mesurées sur de vraies données et enregistrées comme accomplissements (`src/lib/reussites/skills.ts`, `skill-metrics.ts`), leçons chargées à l'ouverture. Les réponses du compte aux commentaires sont repérées à l'actualisation (Instagram, Facebook, YouTube), sans nouvelle autorisation.",
    readme: 18,
    migrations: ["20260927090000_reussites_constellation"]
  },
  {
    id: "2026-09-25-miniature-envoyee-a-youtube",
    date: "2026-09-25",
    title: "La miniature choisie part sur YouTube",
    category: "Publication",
    links: [{ href: "/composer", label: "Publier" }, { href: "/publications", label: "Publications" }],
    result: "La miniature choisie dans Publier est maintenant envoyée à YouTube avec la vidéo. Si YouTube la refuse (chaîne non vérifiée par téléphone, image trop lourde), la vidéo est publiée quand même et la fiche de la publication l'explique.",
    change: "Envoi par `thumbnails.set` avec l'autorisation déjà accordée, en best-effort : une miniature refusée ne fait jamais échouer une publication en ligne, et son sort est noté (`PostTarget.thumbnailStatus`).",
    migrations: []
  },
  {
    id: "2026-09-25-meilleur-creneau-heure-de-la-marque",
    date: "2026-09-25",
    title: "Meilleur créneau à l'heure de la marque",
    category: "Analytics",
    links: [{ href: "/dashboard", label: "Vue d'ensemble" }],
    result: "Le « meilleur créneau » de la Vue d'ensemble est donné à l'heure de la marque : avant, « 18 h » voulait dire 20 h à Paris.",
    change: "Le calcul se fait dans le fuseau de la marque (`src/lib/best-hour.ts`) et non plus à l'heure du serveur, en UTC sur Vercel.",
    migrations: []
  },
  {
    id: "2026-09-25-reussites-v2-missions",
    date: "2026-09-25",
    title: "Réussites v2 : rangs et missions de la semaine",
    category: "Réussites",
    links: [{ href: "/reussites", label: "Réussites" }, { href: "/dashboard", label: "Vue d'ensemble" }],
    result: "Cinq rangs à trois paliers (Étincelle → Nébuleuse) remplacent les anciens niveaux, sans perte d'XP. Chaque semaine, trois missions (Habitude, Progression au choix, Mystère) ouvrent un coffre une fois faites, et une série de semaines actives est protégée par des boucliers ; des rappels arrivent le lundi matin et, s'il reste une mission, le dimanche soir.",
    change: "Missions calculées sur de vraies publications et actions, jamais d'objectif impossible, et chaque récompense passe par une clé unique en base (`src/lib/reussites/missions.ts`, `weekly.ts`, `streak.ts`). Nouvelles tables `WeeklyMissions` et `ReussiteItem` ; aucune récompense n'a de valeur marchande.",
    readme: 17,
    migrations: ["20260926090000_reussites_missions"]
  },
  {
    id: "2026-09-25-pages-vitrine-pre-generees",
    date: "2026-09-25",
    title: "Pages vitrine pré-générées",
    category: "Performance",
    links: [{ href: "/", label: "Accueil du site" }, { href: "/tarifs", label: "Tarifs" }, { href: "/outils", label: "Outils gratuits" }],
    result: "L'accueil, les tarifs, les outils, les comparatifs, les pages légales et le contact s'affichent plus vite : ils sont servis depuis le cache de Vercel, sans fonction ni base de données. L'application, la page bio et les pages à jeton gardent leur protection la plus stricte.",
    change: "Deux niveaux de CSP dans `src/lib/csp.ts` : stricte avec nonce pour l'application et le contenu des utilisateurs, sans nonce pour les 19 pages vitrine construites au déploiement. La connexion ouvre l'application par un chargement complet, avec `CspDocumentGuard` comme filet.",
    readme: 16,
    migrations: []
  },
  {
    id: "2026-09-25-premier-affichage-par-le-serveur",
    date: "2026-09-25",
    title: "Vue d'ensemble et Analytics déjà remplies",
    category: "Performance",
    links: [{ href: "/dashboard", label: "Vue d'ensemble" }, { href: "/analytics", label: "Analytics" }],
    result: "La Vue d'ensemble et Analytics arrivent déjà remplies : chiffres, conseils et prochaines publications s'affichent sans attendre une série d'appels (3 au lieu de 13 sur la Vue d'ensemble). La marque choisie est retrouvée dès la première requête.",
    change: "Le serveur lit les données en parallèle avec les mêmes fonctions que les routes `/api` (`src/lib/server-data`) et les sème dans le cache du navigateur (`SeededData`). La marque active est mémorisée dans un cookie `nb_brand`, simple préférence toujours revérifiée.",
    readme: 15,
    migrations: []
  },
  {
    id: "2026-09-24-miniatures-ia-reparees",
    date: "2026-09-24",
    title: "Miniatures IA réparées, Gemini mieux encadré",
    category: "IA",
    links: [{ href: "/composer", label: "Publier" }],
    result: "La génération de miniatures et de stickers par l'IA fonctionne : elle échouait toujours avec « Gemini n'a renvoyé aucune image ». Les refus de l'IA (filtres, réponse coupée) s'expliquent en français, et le propriétaire est prévenu quand un modèle est retiré ou que la clé est refusée.",
    change: "Les réponses de Gemini en camelCase (`inlineData`) sont maintenant lues ; la clé passe dans l'en-tête `x-goog-api-key` et non plus dans l'adresse, et chaque appel est borné à 55 s, relances comprises (`src/lib/ai/gemini.ts`).",
    migrations: []
  },
  {
    id: "2026-09-24-e-mails-anti-robot-paiement",
    date: "2026-09-24",
    title: "E-mails, anti-robot, paiement et Linktree encadrés",
    category: "Fiabilité",
    links: [{ href: "/register", label: "Inscription" }, { href: "/billing", label: "Facturation" }, { href: "/link-in-bio", label: "Page bio" }],
    result: "Les e-mails automatiques ne partent qu'une fois, même si le cron réessaie, et le propriétaire est prévenu quand plus aucun e-mail ne peut partir ou que la clé anti-robot est refusée. Une inscription ne reste plus bloquée sans fin, et un appel au paiement ne dépasse plus la durée d'une fonction Vercel.",
    change: "Délais garantis : 15 s pour Resend, 8 s pour Turnstile, 20 s par appel Stripe avec 2 nouvelles tentatives sans double paiement ; clé d'idempotence sur les e-mails automatiques (`src/lib/email.ts`). L'import Linktree passe par `fetchPublic`, qui revérifie chaque redirection.",
    migrations: []
  },
  {
    id: "2026-09-24-publicite-et-imports-proteges",
    date: "2026-09-24",
    title: "Publicité et imports protégés",
    category: "Fiabilité",
    links: [{ href: "/analytics?tab=ads", label: "Analytics → Publicité" }, { href: "/composer", label: "Publier" }],
    result: "Un rapport publicitaire au format inattendu n'efface plus 30 jours de dépenses déjà enregistrées, et les comptes TikTok Ads et Meta Ads ne sont plus marqués « à reconnecter » à tort. Les imports de Publier (Drive, Dropbox, OneDrive, Unsplash, Canva) affichent un message clair au lieu de bloquer.",
    change: "Google Ads, Meta Ads, TikTok Ads et les sources d'import passent par la porte commune, avec un délai garanti (20 s par appel, 50 s par téléchargement) et un contrat pour chaque réponse (`src/lib/ads/http.ts`, `src/lib/integrations/http.ts`). Les erreurs sont classées par code, et un format changé prévient le propriétaire.",
    migrations: []
  },
  {
    id: "2026-09-24-contrats-des-reseaux",
    date: "2026-09-24",
    title: "Chaque réponse des réseaux est vérifiée",
    category: "Fiabilité",
    links: [{ href: "/publications", label: "Publications" }, { href: "/analytics", label: "Analytics" }],
    result: "Si un réseau change le format de ses réponses, Nebula ne publie jamais deux fois et n'affiche pas de faux 0 : la publication passe en vérification et le propriétaire est prévenu dans la cloche (« … répond dans un nouveau format »). Au passage, les vidéos TikTok sont de nouveau rattachées à leurs statistiques et la synchro YouTube consomme beaucoup moins de quota.",
    change: "Chaque appel lu a un contrat zod (`src/lib/social/contract.ts`) et passe par une seule porte (`sendRequest`, `fetchJson`), testée sur 87 réponses types dans `tests/contracts/fixtures` ; la forme reçue, sans aucune donnée, va dans les journaux Vercel. Les identifiants TikTok de 19 chiffres sont lus en texte, et YouTube passe par la liste « uploads » (2 unités de quota) au lieu de `search.list` (100).",
    readme: 13,
    migrations: []
  },
  {
    id: "2026-09-24-deja-en-ligne",
    date: "2026-09-24",
    title: "« Déjà en ligne ? » avant tout nouvel envoi",
    category: "Fiabilité",
    links: [{ href: "/publications", label: "Publications" }],
    result: "Quand un envoi reste sans réponse, la publication passe « Vérification en cours » : Nebula la cherche sur le réseau et la marque publiée s'il la trouve, sans jamais la renvoyer à l'aveugle. Sur la fiche, le bouton devient « Vérifier maintenant ».",
    change: "Chaque réseau sait lister ses publications récentes (`listRecentPosts`) et `src/lib/social/reconcile.ts` compare le début du texte et l'heure de l'envoi. Nouveau champ `PostTarget.lastAttemptAt`.",
    migrations: ["20260925150000_lot6_reconcile"]
  },
  {
    id: "2026-09-24-cache-partage-entre-les-pages",
    date: "2026-09-24",
    title: "Cache partagé entre les pages",
    category: "Performance",
    links: [{ href: "/dashboard", label: "Vue d'ensemble" }, { href: "/analytics", label: "Analytics" }],
    result: "Passer de la Vue d'ensemble à Analytics puis revenir n'attend plus rien : les chiffres s'affichent en 0,1 s environ, sans nouvel appel. Les pages sans animation ne chargent plus le moteur d'animation.",
    change: "Les données communes (comptes, statut IA, usage, statistiques) passent par des hooks SWR partagés (`src/lib/data/hooks.ts`), rafraîchis après une action ; framer-motion est chargé en différé (`MotionRoot`).",
    migrations: []
  },
  {
    id: "2026-09-24-pannes-des-reseaux",
    date: "2026-09-24",
    title: "Pannes des réseaux : relances et interrupteurs",
    category: "Fiabilité",
    links: [{ href: "/admin/reseaux", label: "Réseaux" }, { href: "/publications", label: "Publications" }],
    result: "Une limite de débit ou une panne passagère d'un réseau est relancée toute seule (2, 10 puis 30 min), et la fiche affiche l'heure du prochain essai avec un conseil adapté. Le propriétaire peut suspendre un réseau dans /admin/reseaux ; un disjoncteur le suspend 15 min après 5 pannes en 10 min, et les publications repartent seules à la reprise.",
    change: "Erreurs classées par catégorie d'après les codes de chaque réseau (`src/lib/social/errors.ts`), 3 relances au plus et jamais après un délai dépassé. Nouvelle table `NetworkControl` (`src/lib/social/network-control.ts`), et un compte expiré passe « à reconnecter » partout.",
    readme: 12,
    migrations: ["20260925090000_lot5_resilience"]
  },
  {
    id: "2026-09-24-publier-allege-publications-paginees",
    date: "2026-09-24",
    title: "Publier allégé et Publications paginées",
    category: "Performance",
    links: [{ href: "/composer", label: "Publier" }, { href: "/publications", label: "Publications" }],
    result: "La page Publier pèse 207 Ko au lieu de 272, et la frappe reste fluide pendant que l'aperçu se met à jour. La page Publications charge 50 publications à la fois, avec « Afficher plus », sans plafond.",
    change: "Aperçu, fenêtres d'import et outils annexes de Publier chargés à la demande, aperçu différé (`useDeferredValue`). Nouvelle pagination par curseur `GET /api/posts?paginate=1`, avec filtres, recherche et compteurs calculés par la base.",
    migrations: []
  },
  {
    id: "2026-09-24-pages-plus-legeres",
    date: "2026-09-24",
    title: "Pages de l'application plus légères",
    category: "Performance",
    links: [{ href: "/dashboard", label: "Vue d'ensemble" }, { href: "/analytics", label: "Analytics" }, { href: "/link-in-bio", label: "Page bio" }],
    result: "Les pages de l'application téléchargent nettement moins de JavaScript (Vue d'ensemble 344 → 232 Ko, Analytics 349 → 231 Ko). La page bio publique est servie depuis un cache, et la cloche ne réveille plus le serveur chaque minute.",
    change: "recharts, le module d'envoi de fichiers, l'assistant et le panneau « Mon profil » sont chargés à la demande (`src/components/charts/lazy.tsx`), et les valeurs de contexte sont mémorisées. Cloche toutes les 5 min avec rafraîchissement au retour sur l'onglet, page bio en cache invalidé à chaque modification (`src/lib/link-in-bio-cache.ts`).",
    migrations: []
  },
  {
    id: "2026-09-24-calendrier-glisser-deposer-instantane",
    date: "2026-09-24",
    title: "Calendrier : glisser-déposer instantané",
    category: "Calendrier",
    links: [{ href: "/calendar", label: "Calendrier" }],
    result: "Déplacer une publication dans le calendrier est instantané ; si le serveur refuse, elle revient à sa place avec un message. Le calendrier ne charge que les mois affichés.",
    change: "`GET /api/posts` accepte une période et une vue allégée (`src/lib/posts/list-posts.ts`) ; le glisser-déposer fait un seul PATCH optimiste, et seuls les brouillons et les publications programmées sont déplaçables.",
    migrations: []
  },
  {
    id: "2026-09-24-socle-qualite-migrations-tests",
    date: "2026-09-24",
    title: "Socle qualité : migrations, index et tests automatiques",
    category: "Fiabilité",
    links: [{ href: "/publications", label: "Publications" }],
    result: "Chaque déploiement applique des migrations de base versionnées au lieu de modifier la base sans historique, et une migration en échec laisse le site sur sa version précédente. Les requêtes les plus fréquentes sur les publications sont indexées.",
    change: "`scripts/db-migrate.mjs`, lancé par `npm run build`, applique les migrations Prisma ; quinze index ajoutés. Tests unitaires et d'intégration, et intégration continue `.github/workflows/ci.yml` à chaque push : types, lint, tests, migrations sur une base neuve, build.",
    readme: 14,
    migrations: ["20260924120000_lot3_index"]
  },
  {
    id: "2026-09-24-quota-de-comptes-corrige",
    date: "2026-09-24",
    title: "Quota de comptes connectés corrigé",
    category: "Compte et facturation",
    links: [{ href: "/accounts", label: "Comptes connectés" }, { href: "/billing", label: "Facturation" }],
    result: "Les comptes Bluesky, Threads, Pinterest et LinkedIn comptent désormais dans la limite de comptes du palier, et la paire Instagram et Facebook compte pour un seul emplacement.",
    change: "`countConnectionSlots` ne comptait que quatre réseaux ; le calcul (`connectionSlotsFor`, `src/lib/billing/plan.ts`) couvre maintenant tous les réseaux et est couvert par des tests.",
    migrations: []
  },
  {
    id: "2026-09-24-plus-de-double-publication",
    date: "2026-09-24",
    title: "Plus de double publication",
    category: "Fiabilité",
    links: [{ href: "/calendar", label: "Calendrier" }, { href: "/publications", label: "Publications" }],
    result: "Une publication programmée ne part qu'une fois, même si plusieurs passages du planificateur se chevauchent. Une vidéo encore en traitement chez Instagram ou TikTok est suivie jusqu'au bout, et un envoi interrompu passe en échec avec « vérifiez sur le réseau avant de relancer », au lieu de rester bloqué.",
    change: "Chaque publication est prise puis terminée de façon atomique (`claimPostForPublishing`, `src/lib/publish.ts`) ; les étapes longues renvoient un point de reprise que le cron termine sans republier. Délai de 30 s par appel et attentes plafonnées à 20 s.",
    migrations: []
  },
  {
    id: "2026-09-24-meta-a-jour-et-deconnexion-propre",
    date: "2026-09-24",
    title: "Meta à jour et déconnexion propre",
    category: "Fiabilité",
    links: [{ href: "/accounts", label: "Comptes connectés" }, { href: "/suppression-donnees", label: "Suppression des données" }],
    result: "Les statistiques Instagram ne tombent plus à 0 en silence, chaque Page Facebook publie avec son propre jeton, et une publication programmée ne part plus sur un compte déconnecté. Meta peut demander la suppression des données d'un utilisateur, avec un code de suivi sur /suppression-donnees.",
    change: "Graph API passée de v19.0 (expirée) à v25.0, et toutes les versions d'API réunies dans `src/lib/social/versions.ts` avec leur date de revue ; la métrique retirée `impressions` est remplacée par `views`. La déconnexion efface les jetons (`src/lib/social/revoke.ts`) et les rappels Meta de désautorisation et de suppression vérifient la signature.",
    readme: 10,
    migrations: []
  },
  {
    id: "2026-09-24-jetons-chiffres-adresses-filtrees",
    date: "2026-09-24",
    title: "Jetons chiffrés et adresses externes filtrées",
    category: "Sécurité",
    links: [{ href: "/accounts", label: "Comptes connectés" }, { href: "/link-in-bio", label: "Page bio" }],
    result: "Les accès aux comptes réseaux enregistrés par Nebula sont illisibles sans la clé de chiffrement, même en cas de fuite de la base. Une adresse piégée dans un import ou un webhook ne peut plus atteindre un service interne, et la page bio refuse les liens non sûrs.",
    change: "Jetons et secrets chiffrés en AES-256-GCM par une extension Prisma (`src/lib/db/secret-fields.ts`, clé `TOKEN_ENCRYPTION_KEY`). Garde anti-SSRF revue (`src/lib/net-safety.ts`), redirections internes vérifiées, fichiers rangés par propriétaire et SVG refusés.",
    migrations: []
  },
  {
    id: "2026-09-24-comptes-proteges-adresse-confirmee",
    date: "2026-09-24",
    title: "Comptes protégés : adresse confirmée",
    category: "Sécurité",
    links: [{ href: "/register", label: "Inscription" }, { href: "/login", label: "Connexion" }],
    result: "Une inscription par mot de passe demande de confirmer son adresse e-mail. Personne ne peut plus créer un compte avec l'adresse de quelqu'un d'autre puis y entrer quand le vrai titulaire se connecte avec Google, et réinitialiser son mot de passe déconnecte toutes les sessions.",
    change: "Nouveaux champs de confirmation et de version de session sur le compte ; Google et Apple garantissent l'adresse, Meta ne relie un compte existant que par l'identifiant Facebook. Une clé dérivée par usage, `CRON_SECRET` comparé en temps constant et bcrypt passé à 12.",
    migrations: []
  },
  {
    id: "2026-09-24-page-bio-enregistrement-themes-cadres",
    date: "2026-09-24",
    title: "Page bio : enregistrement visible, thèmes et cadres liés",
    category: "Page bio et media kit",
    links: [{ href: "/link-in-bio", label: "Page bio" }, { href: "/reports", label: "Rapports" }, { href: "/calendar-share", label: "Calendrier client" }],
    result: "La Page bio affiche si les changements sont enregistrés, avec un bouton « Enregistrer » et une alerte avant de quitter ; Rapports et Calendrier client ont le même statut. Les thèmes à univers propre n'acceptent que leurs cadres, et un cadre incompatible est retiré avec un message.",
    change: "Statut d'enregistrement commun (`src/components/ui/save-status.tsx`) et règles thème/cadre dans `src/lib/bio-frames.ts` ; bug de taille du thème Prisme corrigé et tailles des cartes hiérarchisées par palier.",
    migrations: []
  },
  {
    id: "2026-09-24-calendrier-et-publications-navigation",
    date: "2026-09-24",
    title: "Calendrier et Publications : navigation corrigée",
    category: "Calendrier",
    links: [{ href: "/calendar", label: "Calendrier" }, { href: "/publications", label: "Publications" }],
    result: "Le sélecteur de mois du calendrier surligne toutes les semaines du mois affiché et ses noms de mois sont cliquables ; les jours passés n'acceptent plus de dépôt. Des boutons relient Publications et Calendrier, et chaque ligne de la liste a sa flèche.",
    change: "Une semaine appartient désormais au mois de son jeudi (`src/components/dashboard/week-scrubber.tsx`) ; badges réseau neutres avec logo dans Commentaires et Engagements.",
    migrations: []
  },
  {
    id: "2026-09-24-assistant-notifications-reussites",
    date: "2026-09-24",
    title: "Assistant, aperçu et notifications de succès revus",
    category: "Interface",
    links: [{ href: "/reussites", label: "Réussites" }, { href: "/composer", label: "Publier" }, { href: "/accounts", label: "Comptes connectés" }],
    result: "L'assistant salue la marque (« Bonjour [marque] — Comment puis-je vous aider ? ») et une notification de succès mène directement au succès, mis en surbrillance. Dans Publier, l'aperçu est plus grand et garde le style choisi, TikTok en premier ; la page Comptes connectés montre les logos en couleur.",
    change: "Les notifications ouvrent `/reussites?focus=…`, le niveau ouvre la fenêtre des grades, et le mode test du propriétaire démarre sur « Mon compte réel » avec une pastille toujours visible.",
    migrations: []
  },
  {
    id: "2026-09-24-codes-promo-acces-partenaires",
    date: "2026-09-24",
    title: "Codes promo et accès partenaires",
    category: "Administration",
    links: [{ href: "/admin/partenaires", label: "Partenaires" }, { href: "/billing", label: "Facturation" }],
    result: "Les codes promo Stripe sont acceptés sur la page de paiement. Le propriétaire peut offrir Pro ou Agence à une adresse e-mail pour 1, 3, 6 ou 12 mois, ou sans limite, sans carte bancaire, et révoquer cet accès.",
    change: "Nouvelle page `/admin/partenaires` et modèle `PartnerGrant` ; l'accès offert est lu par `getUserPlan()` juste après l'abonnement payant, et appliqué à l'inscription si le compte n'existe pas encore.",
    migrations: []
  },
  {
    id: "2026-09-24-theme-sombre-noir-neutre",
    date: "2026-09-24",
    title: "Thème sombre « noir neutre »",
    category: "Interface",
    links: [{ href: "/settings#apparence", label: "Paramètres" }, { href: "/dashboard", label: "Vue d'ensemble" }],
    result: "Le thème sombre passe à un noir neutre et sobre, avec un seul accent violet, celui du logo, dans l'application comme sur les pages publiques. L'ancien bleu nuit reste disponible sous le nom « Nébuleuse bleue ».",
    change: "Fonds gris-noir neutres, gris de texte « zinc », boutons principaux en aplat d'accent sans halo et fond par défaut « Uni » ; un compte qui avait choisi un autre thème ou un autre fond le garde.",
    migrations: []
  },
  {
    id: "2026-09-23-import-csv-et-linktree",
    date: "2026-09-23",
    title: "Import de publications et de Linktree",
    category: "Publication",
    links: [{ href: "/publications", label: "Publications" }, { href: "/link-in-bio", label: "Page bio" }],
    result: "Depuis Publications, un fichier CSV exporté de Buffer ou Metricool crée des brouillons datés, jamais programmés automatiquement, avec un récapitulatif ligne par ligne. Sur Page bio, « Importer depuis Linktree » reprend les liens d'une page linktr.ee.",
    change: "Détection des en-têtes de Buffer et Metricool, avec un mappage manuel en filet ; le média distant est rapatrié en tâche de fond par le cron. L'import Linktree lit la page publique (`src/lib/linktree.ts`).",
    migrations: []
  },
  {
    id: "2026-09-23-comparatifs-et-reseaux-a-venir",
    date: "2026-09-23",
    title: "Comparatifs, réseaux à venir et llms.txt",
    category: "Site public",
    links: [{ href: "/alternatives", label: "Comparatifs" }, { href: "/reseaux", label: "Réseaux" }, { href: "/tarifs", label: "Tarifs" }],
    result: "Des pages « Alternative à … » comparent Nebula à huit outils avec des prix relevés et datés, et un calculateur d'économies s'ajoute aux tarifs. Les pages /reseaux annoncent les réseaux à venir avec une liste d'attente, et `llms.txt` décrit Nebula aux assistants IA.",
    change: "Données des concurrents dans `src/data/competitors.ts` (prix relevés le 23/09/2026, convertis au cours BCE quand ils sont en dollars) ; `robots.txt` autorise les robots des moteurs de réponse.",
    migrations: []
  },
  {
    id: "2026-09-23-cinq-nouveaux-outils-gratuits",
    date: "2026-09-23",
    title: "Cinq nouveaux outils gratuits",
    category: "Outils",
    links: [{ href: "/outils", label: "Outils gratuits" }, { href: "/outils/taux-engagement", label: "Calculateur de taux d'engagement" }, { href: "/outils/hashtags", label: "Générateur de hashtags" }, { href: "/outils/meilleur-moment", label: "Meilleur moment pour publier" }],
    result: "Calculateur de taux d'engagement, générateur de bio Instagram, générateur de hashtags, testeur de titre YouTube et meilleur moment pour publier rejoignent les outils gratuits. Un résultat peut être programmé directement avec Nebula : il arrive prérempli dans Publier.",
    change: "Les outils IA partagent une route `POST /api/public/tools/generate` avec un quota par IP ; le taux d'engagement et le meilleur moment n'utilisent pas l'IA. Les brouillons publics sont remis à Publier par `?draft=<id>`.",
    migrations: []
  },
  {
    id: "2026-09-23-essai-pro-et-offres",
    date: "2026-09-23",
    title: "14 jours de Pro offerts et offres au bon moment",
    category: "Compte et facturation",
    links: [{ href: "/billing", label: "Facturation" }, { href: "/register", label: "Inscription" }],
    result: "Tout nouvel inscrit a 14 jours de Pro (30 avec un parrainage), sans carte bancaire, puis repasse en Gratuit sans rien perdre. Une fenêtre présente chaque fonction réservée au moment où on la touche, avec, après l'essai, une offre unique de -50 % sur le premier mois valable 48 h ; « Résilier » propose aussi une pause.",
    change: "`trialEndsAt` sur le compte et palier effectif calculé par `getUserPlan()` (`src/lib/billing/plan.ts`) ; fenêtre `UpgradeModal` ouverte depuis la raison renvoyée par l'API, pause Stripe par `pause_collection`. Des e-mails de cycle de vie (bienvenue, fin d'essai…) partent selon l'étape réelle, avec désinscription.",
    migrations: []
  },
  {
    id: "2026-09-23-page-acquisition",
    date: "2026-09-23",
    title: "D'où viennent les inscrits : page Acquisition",
    category: "Administration",
    links: [{ href: "/admin/acquisition", label: "Acquisition" }, { href: "/decouvrir/page-bio", label: "Découvrir la Page bio" }],
    result: "Le propriétaire voit dans /admin/acquisition d'où viennent les inscrits et les payants (source, campagne, page bio d'origine), ainsi que les essais et les offres. Le badge « Propulsé par Nebula » des pages publiques mène vers des pages « Découvrir », et la marque qui amène un abonné reçoit un mois de Pro.",
    change: "Un cookie `nb_attr` garde la première source de visite pendant 30 jours, recopiée sur le compte à l'inscription ; événements internes `GrowthEvent`, sans outil tiers.",
    migrations: []
  },
  {
    id: "2026-09-23-accessibilite-mode-clair-csp",
    date: "2026-09-23",
    title: "Accessibilité, mode clair lisible et protection stricte",
    category: "Interface",
    links: [{ href: "/settings#apparence", label: "Paramètres" }, { href: "/securite", label: "Sécurité" }],
    result: "Aucune violation d'accessibilité n'est relevée sur 21 pages en sombre et 18 pages de l'application en clair, sur ordinateur et téléphone. En mode clair, les boutons gardent un texte blanc, les liens sont soulignés et les couleurs d'alerte et des réseaux restent lisibles ; le navigateur bloque les scripts non autorisés.",
    change: "Mode clair reposant sur une seule palette de jetons sans couleur écrite en dur (`src/app/globals.css`) ; CSP appliquée avec un nonce par requête (`src/middleware.ts`), soupape `CSP_MODE=report-only`. Images distantes passées par `next/image` et tests de fumée `npm run smoke`.",
    migrations: []
  },
  {
    id: "2026-09-23-fuseau-horaire-et-vue-liste",
    date: "2026-09-23",
    title: "Fuseau horaire de la marque et vue Liste",
    category: "Calendrier",
    links: [{ href: "/calendar", label: "Calendrier" }, { href: "/settings#marque", label: "Paramètres" }],
    result: "Chaque marque a son fuseau horaire de programmation : l'heure saisie dans Publier, le calendrier et la fiche d'une publication suivent ce fuseau, avec un avertissement s'il diffère de l'appareil. Le calendrier gagne une vue Liste, par défaut sur téléphone, et une publication programmée se reprogramme depuis la fiche rapide.",
    change: "Calcul des fuseaux sans dépendance, changements d'heure compris (`src/lib/timezone.ts`), réglage dans Paramètres → Marque ; boutons « + » du calendrier visibles au toucher et au clavier.",
    migrations: []
  },
  {
    id: "2026-09-23-mise-en-route-et-barre-d-action",
    date: "2026-09-23",
    title: "Mise en route guidée et barre d'action dans Publier",
    category: "Publication",
    links: [{ href: "/dashboard", label: "Vue d'ensemble" }, { href: "/composer", label: "Publier" }, { href: "/settings#compte", label: "Paramètres" }],
    result: "La Vue d'ensemble affiche une checklist de mise en route et un encadré « À traiter » (publications en échec, comptes à reconnecter, brouillons). Dans Publier, une barre collante montre ce qui manque et garde le bouton principal visible, et un e-mail prévient si une publication programmée échoue.",
    change: "Étapes calculées sur les données réelles ; Publier découpé en sous-composants, avec une numérotation corrigée (1 Média à 5 Publication). Réglage « e-mail en cas d'échec » dans Paramètres → Compte, activé par défaut.",
    migrations: []
  },
  {
    id: "2026-09-23-barre-laterale-et-publications",
    date: "2026-09-23",
    title: "Barre latérale, page Publications et Mode focus",
    category: "Interface",
    links: [{ href: "/publications", label: "Publications" }, { href: "/dashboard", label: "Vue d'ensemble" }, { href: "/settings", label: "Paramètres" }],
    result: "L'application passe à une barre latérale fixe et repliable, avec un en-tête d'une ligne et une barre d'onglets en bas sur téléphone. Une nouvelle page Publications liste toutes les publications avec filtres et recherche ; le Mode focus, actif par défaut, coupe les surprises ludiques, et Paramètres se range en trois onglets.",
    change: "Une seule source de navigation (`src/components/dashboard/navigation.ts`) partagée par la barre, le tiroir, la palette ⌘K et le fil d'Ariane ; un seul appel `/api/me` remplace 7 appels de préférences, et des squelettes de chargement remplacent les « Chargement... ».",
    migrations: []
  },
  {
    id: "2026-09-23-pages-tarifs-contact-securite",
    date: "2026-09-23",
    title: "Pages Tarifs, Contact, Sécurité et mentions légales",
    category: "Site public",
    links: [{ href: "/tarifs", label: "Tarifs" }, { href: "/contact", label: "Contact" }, { href: "/securite", label: "Sécurité" }, { href: "/legal", label: "Mentions légales" }],
    result: "Le site public gagne une page Tarifs avec un comparatif complet des paliers, un formulaire de contact, une page Sécurité factuelle et des pages légales complètes (conditions, confidentialité, sous-traitants, cookies). La navigation et le pied de page sont les mêmes partout.",
    change: "Comparatif construit depuis `src/lib/plans.ts` ; page bio publique rendue côté serveur avec une vraie page 404, et « Propulsé par Nebula » lisible et cliquable sur les pages à jeton.",
    migrations: []
  },
  {
    id: "2026-09-23-connexion-et-inscription-refaites",
    date: "2026-09-23",
    title: "Connexion et inscription refaites",
    category: "Compte et facturation",
    links: [{ href: "/register", label: "Inscription" }, { href: "/login", label: "Connexion" }, { href: "/forgot-password", label: "Mot de passe oublié" }],
    result: "Les pages de compte partagent le même cadre, avec un œil pour afficher le mot de passe et un indicateur de robustesse. À l'inscription, la marque devient facultative, le code de parrainage se replie et l'acceptation des conditions est obligatoire.",
    change: "Composant `PasswordInput` (`src/components/ui/password-input.tsx`), erreurs affichées sous chaque champ et messages du serveur en français.",
    migrations: []
  },
  {
    id: "2026-09-22-nouvelle-page-d-accueil",
    date: "2026-09-22",
    title: "Nouvelle page d'accueil",
    category: "Site public",
    links: [{ href: "/", label: "Accueil du site" }],
    result: "L'accueil est entièrement refait : une promesse claire, un visuel du produit, les étapes, les fonctionnalités, des tarifs avec le choix du nombre de marques, une FAQ et un appel final. Le faux message « Un utilisateur vient de publier… » et son compteur sont retirés.",
    change: "Navigation et pied de page publics partagés, haut de page rendu côté serveur et visible avant le chargement du JavaScript ; libellés des paliers corrigés dans `src/lib/plans.ts`.",
    migrations: []
  },
  {
    id: "2026-09-22-marques-cloisonnees",
    date: "2026-09-22",
    title: "Marques cloisonnées et en-têtes de sécurité",
    category: "Sécurité",
    links: [{ href: "/accounts", label: "Comptes connectés" }, { href: "/login", label: "Connexion" }],
    result: "Les publications, statistiques et comptes d'une marque ne sont plus accessibles depuis une autre marque, et les accès aux réseaux ne sont jamais renvoyés au navigateur. Les tentatives de connexion répétées sont limitées.",
    change: "Contrôle d'appartenance ajouté sur environ 35 routes (`src/lib/brand-access.ts`), état OAuth signé, `CRON_SECRET` obligatoire, envois limités aux images et vidéos et en-têtes HTTP de sécurité (HSTS, X-Frame-Options…).",
    migrations: []
  },
  {
    id: "2026-09-22-polices-composants-partage",
    date: "2026-09-22",
    title: "Polices, composants partagés et aperçus de partage",
    category: "Interface",
    links: [{ href: "/", label: "Accueil du site" }, { href: "/dashboard", label: "Vue d'ensemble" }],
    result: "Le site affiche enfin ses polices (Inter et Space Grotesk), le nom « Nebula » partout, un focus clavier visible et des contrastes renforcés. Un lien partagé affiche une image d'aperçu.",
    change: "Polices auto-hébergées, composants d'interface partagés (champs, interrupteurs, onglets, squelettes) dans `src/components/ui/`, image de partage générée, sitemap et robots.",
    migrations: []
  },
  {
    id: "2026-09-21-rapports-et-calendrier-client",
    date: "2026-09-21",
    title: "Rapports clients et calendrier client",
    category: "Analytics",
    links: [{ href: "/reports", label: "Rapports" }, { href: "/calendar-share", label: "Calendrier client" }],
    result: "Chaque marque peut partager avec ses clients une page de rapport (abonnés, croissance, engagement, publications de la période, recalculés à chaque visite), avec un envoi par e-mail hebdomadaire ou mensuel. Un calendrier client en lecture seule montre les publications programmées des 14, 30 ou 60 prochains jours, jamais un brouillon ; les deux sont réservés à Pro et Agence.",
    change: "Modèles `BrandReport` et `CalendarShare` (`src/lib/reports.ts`, `src/lib/calendar-share.ts`), envois des rapports déclenchés par le cron ; « Propulsé par Nebula » reste affiché sur ces pages.",
    migrations: []
  },
  {
    id: "2026-09-21-page-bio-publique",
    date: "2026-09-21",
    title: "Page bio publique par marque",
    category: "Page bio et media kit",
    links: [{ href: "/link-in-bio", label: "Page bio" }],
    result: "Chaque marque a sa page « link in bio » publique, éditée depuis l'onglet Page bio, avec 3 liens en Gratuit, 15 en Pro et sans limite en Agence.",
    change: "Modèles `LinkPage` et `LinkItem`, page publique `/l/<marque>`.",
    migrations: []
  },
  {
    id: "2026-09-21-retention-ia-toute-la-chaine",
    date: "2026-09-21",
    title: "Rétention IA pour toutes les vidéos de la chaîne",
    category: "IA",
    links: [{ href: "/retention", label: "Rétention IA" }],
    result: "L'onglet Rétention IA analyse n'importe quelle vidéo de la chaîne YouTube connectée, pas seulement celles publiées depuis Nebula, avec la vraie courbe YouTube Analytics et des recommandations de l'IA. Réservé à Pro et Agence.",
    change: "Colonnes `connectionId` et `videoId` ajoutées aux analyses (`VideoInsight`) ; l'IA s'appuyait alors sur la miniature publique de la vidéo.",
    migrations: []
  },
  {
    id: "2026-09-21-outils-gratuits-sans-compte",
    date: "2026-09-21",
    title: "Outils gratuits : légendes et miniatures",
    category: "Outils",
    links: [{ href: "/outils", label: "Outils gratuits" }],
    result: "Deux outils gratuits, sans compte, génèrent avec l'IA des titres et légendes et des miniatures percutantes, avec un petit quota par jour.",
    change: "Pages `/outils/legendes` et `/outils/miniatures` (réunies depuis dans le Générateur de publications), quota quotidien par IP dans la table `PublicToolUsage`.",
    migrations: []
  },
  {
    id: "2026-09-19-quatre-reseaux-sans-donnees-fictives",
    date: "2026-09-19",
    title: "Quatre réseaux, aucune donnée fictive",
    category: "Publication",
    links: [{ href: "/accounts", label: "Comptes connectés" }, { href: "/dashboard", label: "Vue d'ensemble" }],
    result: "Nebula gère Instagram, Facebook, TikTok et YouTube ; X, LinkedIn et le Hashtag Tracker sont retirés plutôt que laissés à moitié fonctionnels. Le mode démonstration disparaît : un nouveau compte démarre vide, avec des états vides honnêtes et un lien vers l'action à faire.",
    change: "Les deux réseaux et le Hashtag Tracker sont supprimés du code (types, OAuth, publication, interface, tâche de rafraîchissement) ; plus aucune donnée fictive n'est affichée comme réelle.",
    migrations: []
  },
  {
    id: "2026-09-19-publier-plusieurs-reseaux-et-comptes",
    date: "2026-09-19",
    title: "Publier : une publication, plusieurs réseaux et comptes",
    category: "Publication",
    links: [{ href: "/composer", label: "Publier" }, { href: "/accounts", label: "Comptes connectés" }],
    result: "Publier crée une publication à la fois, avec un titre et une description par réseau et un compteur de caractères. Dès Pro, on choisit le compte quand plusieurs sont connectés sur un réseau ; en Agence, une même vidéo part sur n'importe quelle combinaison de comptes en un clic, et « Dupliquer » recrée en brouillon une publication restée bloquée.",
    change: "Upload en masse supprimé, sélecteur de compte par réseau avec avatar, brouillon sauvegardé dans le navigateur et raccourci Ctrl/⌘+Entrée ; miniatures candidates extraites de la vidéo avec ffmpeg, sans coût d'IA.",
    migrations: ["20260924000000_baseline"]
  },
  {
    id: "2026-09-19-tarifs-par-nombre-de-marques",
    date: "2026-09-19",
    title: "Tarifs par nombre de marques",
    category: "Compte et facturation",
    links: [{ href: "/billing", label: "Facturation" }, { href: "/calendar", label: "Calendrier" }],
    result: "Un seul abonnement par compte, Pro ou Agence, dont le prix dépend du nombre de marques choisi, en mensuel ou en annuel (environ 2 mois offerts). Une barre au-dessus du calendrier montre les publications programmées du mois (20 en Gratuit, 100 en Pro), et le palier actif s'affiche à côté du nom de la marque avec un bouton de mise à niveau.",
    change: "Paliers et prix définis dans `src/lib/plans.ts`, paiement et portail client Stripe, mode vitrine sans clé Stripe ; nouvelle icône diamant en SVG pour les mises à niveau.",
    migrations: []
  },
  {
    id: "2026-09-19-navigation-et-marques",
    date: "2026-09-19",
    title: "Navigation en onglets et marques à portée de main",
    category: "Interface",
    links: [{ href: "/dashboard", label: "Vue d'ensemble" }, { href: "/accounts", label: "Comptes connectés" }],
    result: "Une barre d'onglets en haut de l'écran remplace la colonne verticale, avec en dessous le sélecteur de marque et les comptes connectés de la marque active. On ajoute une marque ou connecte un compte (Meta, TikTok, YouTube) sans quitter la page, et des notifications discrètes et des confirmations remplacent les pop-up.",
    change: "Carte « + Ajouter une marque », remplacée par un badge verrouillé quand le palier ne le permet pas, et menu « + » de connexion rapide ; toasts et fenêtres de confirmation avant une suppression ou une déconnexion.",
    migrations: []
  },
  {
    id: "2026-09-19-assistant-et-retention-ia",
    date: "2026-09-19",
    title: "Assistant IA, analyse de rétention et textes générés",
    category: "IA",
    links: [{ href: "/retention", label: "Rétention IA" }, { href: "/composer", label: "Publier" }],
    result: "Un assistant IA flottant aide à utiliser le site et répond sur les vraies statistiques. Sur une vidéo YouTube publiée, l'analyse de rétention explique les plus grosses chutes de la courbe avec des recommandations, et chaque champ de Publier a son bouton IA, plus un bouton qui remplit tout d'un coup.",
    change: "Client Gemini optionnel, masqué sans clé et conditionné au palier ; la vraie courbe vient de YouTube Analytics et les images aux chutes sont extraites avec ffmpeg. Chaque publication a aussi son fil de discussion, avec des réponses de l'assistant.",
    migrations: []
  },
  {
    id: "2026-09-19-communaute-et-soutenir-nebula",
    date: "2026-09-19",
    title: "Communauté Nebula et page Soutenir",
    category: "Communauté",
    links: [{ href: "/community", label: "Communauté" }, { href: "/support", label: "Soutenir Nebula" }],
    result: "La Communauté réunit un forum d'entraide, des guides (dont un guide de démarrage complet) et un onglet « Vidéos du jour » où chacun peut partager une publication déjà en ligne. La page Soutenir Nebula permet un don et explique, dans « Bientôt disponible », ce qui reviendrait si le site devient rentable.",
    change: "Seuls le lien et la miniature d'une vidéo partagée sont recopiés, jamais le fichier ; le bouton de don n'apparaît que si `NEXT_PUBLIC_DONATE_URL` est renseigné.",
    migrations: []
  },
  {
    id: "2026-09-19-presentation-page-par-page",
    date: "2026-09-19",
    title: "Présentation page par page sur l'accueil",
    category: "Site public",
    links: [{ href: "/", label: "Accueil du site" }],
    result: "Sous le titre de l'accueil, un bloc présente le site page par page, pour le comprendre en quelques clics avant de créer un compte.",
    change: "Bloc de présentation en verre dépoli (glassmorphism) ajouté aux composants marketing de la page d'accueil.",
    migrations: []
  }
];

export const JOURNAL_ENTRIES: JournalEntry[] = [...NEW_ENTRIES, ...HISTORY];
