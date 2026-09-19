# Nebula — Command Center Social

Application complète (Next.js 14 + TypeScript + Prisma) de gestion de réseaux sociaux : planification et publication multi-réseaux, analytics unifiées, multi-comptes/multi-marques, abonnements payants et assistant IA optionnel. Style visuel sombre bleu/noir avec effets glassmorphism et glow, navigation en barre d'onglets horizontale en haut de l'écran.

Ce document explique **ce qui fonctionne dès l'installation**, **ce qu'il vous reste à faire pour publier réellement sur chaque réseau**, et **comment déployer**.

---

## 1. Ce qui est déjà réel dans ce projet

Rien n'est simulé côté code : chaque intégration réseau (`src/lib/social/*.ts`) appelle les vraies API officielles (Meta Graph API, TikTok Content Posting API, YouTube Data API v3 + YouTube Analytics API v2) avec les vrais endpoints, en suivant leur documentation actuelle. Le composer, le calendrier, l'authentification, la base de données, l'upload de médias, le worker de publication planifiée, les abonnements Stripe et l'assistant IA Gemini (optionnel) sont fonctionnels de bout en bout.

**Ce qui manque pour que la publication marche pour de vrai : les identifiants développeur.** Chaque réseau social exige que **vous** créiez une application sur son portail développeur et obteniez ses propres clés API — aucun logiciel, y compris Metricool, Buffer ou Hootsuite, ne peut contourner cette étape. Voir la section 3.

**Il n'y a plus de mode démonstration.** Un visiteur qui arrive sur le site crée un compte Nebula gratuit, puis ajoute lui-même ses marques et connecte ses comptes réseaux depuis l'application — aucune donnée fictive n'est jamais affichée comme si elle était réelle. Tant qu'aucun compte réseau n'est connecté ou qu'aucune statistique n'a encore été collectée, le dashboard, le calendrier et les analytics affichent des **états vides honnêtes** ("aucune publication programmée pour l'instant", "connectez un compte pour voir vos statistiques"...) avec un lien direct vers l'action à faire, plutôt que des chiffres inventés.

### Fonctionnalités ajoutées dans cette version

- **X (Twitter) et LinkedIn retirés de la plateforme** : ces deux réseaux ont été supprimés du code (types, OAuth, publication, UI) plutôt que laissés à moitié fonctionnels. X exige un plan API payant pour publier, et LinkedIn exige une entité entreprise vérifiée — les deux sont candidats à un retour futur, voir plus bas et la page **Soutenir Nebula**. Nebula gère aujourd'hui **Instagram, Facebook, TikTok et YouTube**.
- **Hashtag Tracker retiré** (nécessitait une clé API X payante pour compter réellement) : la fonctionnalité, ses pages, ses routes et le job de rafraîchissement en arrière-plan ont été supprimés proprement plutôt que laissés cassés ou affichant un faux compteur.
- **Nouvelle page "Soutenir Nebula" → section "Bientôt disponible"** : explique clairement, pour chacun des trois points ci-dessus (connexion X, assistant propulsé par Claude/Anthropic en plus de Gemini, Hashtag Tracker), **pourquoi** ce n'est pas encore là (coût d'une clé API payante) et **ce que ça débloquerait** si le site devient rentable — pour être transparent avec les utilisateurs plutôt que de promettre une date.
- **Nouvelle tarification, par nombre de marques et moins chère** : au lieu d'un tarif fixe par marque, chaque compte Nebula souscrit **un seul abonnement** (Pro ou Agence) et choisit, avec un bouton radio façon "jusqu'à N marques", **combien de marques** il veut pouvoir gérer avec ce compte — le prix augmente avec ce nombre plutôt qu'avec le nombre d'abonnements séparés. Voir le détail des paliers en section 3bis.
- **Mode démonstration supprimé** : plus aucune fausse donnée (abonnés fictifs, courbes de croissance inventées, "meilleur horaire" calculé sur du vide, publications à venir imaginaires) n'est montrée nulle part. Un nouveau compte démarre à zéro et se remplit au fur et à mesure que l'utilisateur connecte ses comptes et publie.
- **Gestion des marques repensée** : dans le sélecteur de marque (en haut de l'app), une carte "+ Ajouter une marque" permet d'en créer une nouvelle directement, sans quitter la page. Si le palier actif ne permet pas d'en ajouter une de plus, la carte est remplacée par un badge avec l'icône diamant "verrouillée" qui renvoie vers la page Facturation.
- **Raccourci comptes réseaux dans la barre de navigation** : à côté du sélecteur de marque, une liste des comptes déjà connectés à la marque active défile horizontalement (avec un point vert/orange indiquant l'état de la connexion), et un petit bouton "+" ouvre un menu pour connecter un nouveau compte (Meta, TikTok, YouTube) en un clic, sans passer par la page Comptes.
- **Nouvelle icône diamant** : l'ancien emoji 💎 a été remplacé par une icône SVG fine et dégradée (même famille visuelle que le reste du site), réutilisée partout où Nebula propose une mise à niveau (`UpgradeGem`, `UpgradeButton`, `LockedUpgradeBadge`).
- **Navigation repensée en barre d'onglets horizontale** : la sidebar verticale a été remplacée par une barre en haut de l'écran, sur deux niveaux — les onglets principaux (Vue d'ensemble, Calendrier, Composer, Analytics, Comptes, Communauté, Facturation) en haut, puis le sélecteur de marque et les comptes connectés juste en dessous.
- **Upload en masse supprimé** : le composer ne crée plus qu'**une publication à la fois** (titre + description + médias + réglages par réseau), ce qui correspond à l'usage réel (chaque post a son propre texte, son propre titre YouTube, etc.).
- **Bouton "Dupliquer"** sur la page détail d'une publication (`/posts/[id]`) : recrée immédiatement une copie en brouillon (aucun statut ni identifiant externe hérité) pour réessayer un post resté bloqué "en attente" ou en échec, sans tout ressaisir.
- **Abonnements (Stripe), mensuel ou annuel, par nombre de marques** : deux paliers payants (Pro / Agence), chacun proposant trois choix de "nombre de marques" avec un prix croissant, plus un choix mensuel/annuel sur la page **Facturation** (l'annuel offre ~2 mois). Checkout Stripe et portail client inclus. Fonctionne en mode "vitrine" sans aucune clé Stripe (paliers affichés, aucun paiement accepté, aucun coût).
- **Barre de progression du quota** au-dessus du calendrier : affiche "X / 20" (Gratuit) ou "X / 100" (Pro) publications programmées ce mois, avec un avertissement au-delà de 80% ; masquée pour le palier Agence (illimité).
- **Publication en masse (palier Agence)** : un bouton dans le composer permet de publier la même vidéo sur **n'importe quelle combinaison de comptes, tous réseaux confondus, en une seule fois** (ex : 3 comptes Instagram + 2 Pages Facebook + 1 chaîne YouTube en un clic) — il suffit de cocher l'icône du réseau et le nom du profil visé.
- **Multi-comptes par réseau** : dans **Comptes** (ou via le raccourci "+" de la barre de navigation), vous pouvez connecter plusieurs comptes Instagram, plusieurs Pages Facebook, etc. Dès le palier **Pro**, le composer affiche un sélecteur de compte par réseau quand plusieurs sont connectés (double compte partout), avec le logo/l'avatar du compte pour choisir facilement lequel utiliser au moment de publier.
- **Badge de palier + bouton de mise à niveau** : le nom du palier actif (Gratuit/Pro/Agence) s'affiche à côté du nom de la marque dans la barre de navigation, avec un bouton de mise à niveau (nouvelle icône diamant) tant que la marque n'est pas au palier Agence.
- **Communauté Nebula** (`/community`) : un espace public commun à tous les comptes — un **forum** d'entraide (catégories Général/Aide/Suggestions/Vitrine), des **guides** d'utilisation (dont un guide de démarrage complet pour les grands débutants), et un onglet **Vidéos du jour** où chacun peut partager volontairement une de ses publications déjà en ligne (seul le lien + la miniature sont recopiés, jamais le fichier).
- **Soutenir Nebula** (`/support`) : petit espace pour que les utilisateurs puissent faire un don si le site leur est utile — invisible/désactivé tant que `NEXT_PUBLIC_DONATE_URL` n'est pas configuré — complété désormais par la section "Bientôt disponible" décrite plus haut.
- **Assistant IA (chat)** flottant, disponible sur tout le dashboard : aide à utiliser le site et répond sur vos statistiques réelles (comptes connectés, dernières publications).
- **Analyse de rétention vidéo (IA)**, façon "YouTube Studio AI Insights" : sur une vidéo YouTube publiée, récupère la vraie courbe de rétention (YouTube Analytics API), extrait les images de la vidéo aux plus grosses chutes (ffmpeg) et demande à l'IA d'expliquer ce qui se passe à l'écran à ces instants + des recommandations concrètes.
- **Génération de miniatures** : extraction de plusieurs images candidates directement depuis la vidéo (ffmpeg, aucun coût IA) au moment de la création du post.
- **Titre + description par réseau**, avec les champs spécifiques demandés par chaque plateforme, et un bouton IA par champ pour générer le texte ; un bouton IA "global" déclenche la génération sur tous les champs de tous les réseaux sélectionnés en un clic.
- **Fil de discussion par publication** (`/posts/[id]`) : un espace pour discuter d'une vidéo et de ses statistiques, avec réponses automatiques de l'assistant IA basées sur les données réelles du post.
- **Page d'accueil** : petit bloc de présentation "page par page" (fond flou / glassmorphism) juste sous le titre, pour comprendre le site en quelques clics avant de créer un compte.
- **Petites améliorations de confort** : notifications discrètes (toasts) au lieu des pop-up `alert()`, modales de confirmation avant suppression/déconnexion, compteur de caractères par réseau dans le composer (avec la limite la plus stricte des réseaux sélectionnés), brouillon du composer sauvegardé automatiquement dans le navigateur, raccourci clavier Ctrl/⌘+Entrée pour publier, bouton "copier le lien" sur une publication en ligne, bouton "partager avec la communauté".

Toutes les fonctionnalités IA (chat, analyse de rétention, génération de texte) sont **strictement optionnelles et gratuites à héberger** : voir la section 3bis.

---

## 2. Démarrage rapide (local)

```bash
npm install
cp .env.example .env
# ouvrez .env et générez au moins NEXTAUTH_SECRET :
#   openssl rand -base64 32

npx prisma generate
npx prisma db push      # crée dev.db (SQLite) à partir du schéma

npm run dev
```

Ouvrez http://localhost:3000, créez votre compte, puis ajoutez votre première marque et connectez vos comptes réseaux depuis l'application — il n'y a plus de compte de démonstration pré-rempli : chaque compte démarre vide.

Optionnel : `npm run db:seed` publie les guides de démarrage dans l'onglet **Communauté** (aucun compte ni donnée fictive n'est créé).

Pour activer la publication planifiée en arrière-plan (nécessaire dès que vous programmez un post) :

```bash
npm run worker
```

**ffmpeg** (optionnel mais recommandé) : requis pour la génération de miniatures et pour l'analyse de rétention vidéo (extraction d'images). Sans lui, ces deux fonctions sont simplement masquées ou renvoient un message clair — le reste du site fonctionne normalement. Installation : `apt install ffmpeg` (Linux), `brew install ffmpeg` (macOS), ou binaire officiel sur Windows.

> Environnement de build de cette livraison : ce projet a été développé et vérifié dans un bac à sable dont la politique réseau bloque deux domaines (`binaries.prisma.sh` pour les moteurs Prisma, `fonts.googleapis.com` pour les polices) — sans lien avec le code. Le `tsc --noEmit` complet et le build Next.js passent tous les deux une fois ces deux étapes réseau disponibles (ce qui est le cas sur votre machine ou sur n'importe quel hébergeur standard).

---

## 3. Connecter réellement chaque réseau (obligatoire pour publier)

Chaque bloc ci-dessous correspond à une variable du fichier `.env.example`. Nebula gère aujourd'hui **Instagram, Facebook, TikTok et YouTube** (X et LinkedIn ont été retirés — voir section 1 et la page **Soutenir Nebula** dans l'application).

### Instagram + Facebook (Meta)
1. Créez une app sur [developers.facebook.com/apps](https://developers.facebook.com/apps).
2. Ajoutez les produits **Instagram Graph API** et **Facebook Login**.
3. Renseignez `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`.
4. Pour publier sur un compte qui n'est pas administrateur de l'app : passez l'app en mode **Live**, ce qui exige une **vérification Business** et la validation en **App Review** des permissions `instagram_content_publish` et `pages_manage_posts`. Prévoyez plusieurs jours.
5. Le compte Instagram doit être un compte **Business ou Creator**, lié à une **Page Facebook**.

### TikTok
1. Créez une app sur [developers.tiktok.com](https://developers.tiktok.com/apps).
2. Activez le produit **Content Posting API**.
3. Renseignez `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`.
4. Le scope `video.publish` est **audité** : sans audit validé par TikTok, vous ne pouvez publier que sur les comptes de test que vous ajoutez vous-même dans le portail développeur (mode privé uniquement, `privacy_level: SELF_ONLY` déjà configuré dans le code par précaution).

### YouTube
1. Créez un projet sur [console.cloud.google.com](https://console.cloud.google.com), activez **YouTube Data API v3**.
2. Créez des identifiants OAuth 2.0, renseignez `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`.
3. Quota par défaut : 10 000 unités/jour ; un upload en coûte environ 1 600. Une validation Google (écran de consentement OAuth) est nécessaire pour sortir du mode test (limité à 100 utilisateurs).

### X (Twitter) et LinkedIn — retirés pour le moment
Ces deux réseaux ne sont plus dans le code de cette instance. X nécessite un plan API payant dès qu'on veut publier ou lire des métriques, et LinkedIn nécessite une entité entreprise vérifiée pour publier sur une Page — voir la page **Soutenir Nebula** dans l'application, section "Bientôt disponible", pour le détail de ce qui reviendrait et à quelle condition (le site générant assez de revenus pour couvrir ces coûts).

Une fois les clés renseignées, allez dans **Comptes** dans l'application (ou utilisez le raccourci "+" à côté du sélecteur de marque dans la barre de navigation) et cliquez sur "Connecter" pour chaque réseau : le flux OAuth réel s'ouvre et enregistre la connexion en base. Vous pouvez répéter l'opération plusieurs fois pour le même réseau afin de connecter plusieurs comptes (plusieurs comptes Instagram, plusieurs Pages Facebook...), dans la limite du palier d'abonnement actif (voir section 3bis).

---

## 3bis. IA et abonnements (les deux sont 100% optionnels)

Le principe est le même pour les deux : **tant qu'aucune clé n'est renseignée, la fonctionnalité correspondante est simplement invisible dans l'interface — aucun bouton cassé, aucun coût, aucune obligation.**

### IA — Google Gemini (et non l'API Anthropic/Claude)
Ce choix est délibéré : contrairement à l'API Anthropic (Claude), qui est payante dès le premier appel et candidate à une intégration future une fois le site rentable (voir la page **Soutenir Nebula**), **Google Gemini propose un vrai palier gratuit** (voir [ai.google.dev/pricing](https://ai.google.dev/pricing) pour les quotas à jour), ce qui convient à un site qui ne génère pas encore de revenu.
1. Récupérez une clé gratuite sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Renseignez `GEMINI_API_KEY` dans `.env` (`GEMINI_MODEL` a une valeur par défaut raisonnable).
3. En plus de la présence de la clé, les fonctionnalités IA sont **également conditionnées au palier d'abonnement** du compte (Pro/Agence) — voir `src/lib/plans.ts`. Cela permet, si vous le souhaitez, de faire de l'IA un argument payant plutôt qu'un coût subi. Pour tester sans Stripe configuré, passez temporairement `aiEnabled: true` sur le palier `FREE` dans `src/lib/plans.ts`.

### Abonnements — Stripe, mensuel ou annuel, par nombre de marques
Contrairement à l'ancienne version, l'abonnement est rattaché au **compte Nebula** (pas à une marque précise) : le client choisit un palier (Pro ou Agence), puis **combien de marques** il veut pouvoir gérer avec ce compte — le prix augmente avec ce nombre plutôt qu'avec le nombre d'abonnements séparés, à la manière de Metricool mais à des tarifs plus bas :

| Palier | Paliers de marques disponibles | Prix / mois | Prix / an (~2 mois offerts) |
|---|---|---|---|
| **Gratuit** | 1 marque | 0€ | 0€ |
| **Pro** | jusqu'à 3, 5 ou 10 marques | 9€ / 15€ / 25€ | 90€ / 150€ / 250€ |
| **Agence** | jusqu'à 15, 25 ou 50 marques | 29€ / 45€ / 75€ | 290€ / 450€ / 750€ |

Ces montants sont définis dans `src/lib/plans.ts` (tableau `PLAN_LIMITS`, un `BrandTier` par palier de marques) et peuvent être ajustés librement.

1. Créez un compte sur [dashboard.stripe.com](https://dashboard.stripe.com), récupérez `STRIPE_SECRET_KEY` (mode test pour commencer, aucun coût).
2. Pour chaque **combinaison palier × nombre de marques** (Pro-3, Pro-5, Pro-10, Agence-15, Agence-25, Agence-50), créez **deux tarifs récurrents** (un mensuel et un annuel) — soit **12 tarifs Stripe au total**. Copiez chaque Price ID (`price_...`) dans la variable correspondante de `.env` (`STRIPE_PRICE_PRO_3_MONTHLY`, `STRIPE_PRICE_PRO_3_YEARLY`, ... jusqu'à `STRIPE_PRICE_AGENCY_50_YEARLY` — la liste complète est commentée dans `.env.example`).
3. Configurez un webhook (`checkout.session.completed`, `customer.subscription.updated/deleted`) pointant vers `/api/billing/webhook`, copiez `STRIPE_WEBHOOK_SECRET`. L'intervalle réellement facturé (mois/an) et le nombre de marques souscrites sont lus depuis les métadonnées de l'abonnement Stripe à la réception du webhook, donc toujours fiables même si le client change d'avis dans le portail Stripe.
4. Sans ces variables, la page **Facturation** reste consultable (paliers, toggle mensuel/annuel, sélection du nombre de marques, quotas actuels) mais n'accepte aucun paiement — utile pour montrer l'offre avant d'activer réellement Stripe.
5. Le palier **Gratuit** offre 1 marque, 4 comptes connectés au choix et 20 publications programmées par mois, avec la possibilité de publier sur ses 4 réseaux en même temps, sans IA ; **Pro** débloque l'IA, tous les réseaux avec un 2e compte par réseau (double compte partout) et 100 publications par marque ; **Agence** est illimité (comptes, publications) et ajoute la publication en masse cross-réseaux (voir plus haut).

### Fonctionnalités à venir, conditionnées aux revenus du site
La page **Soutenir Nebula** (`/support`) de l'application détaille, dans sa section "Bientôt disponible", trois choses qui reviendront si les abonnements couvrent leur coût : la connexion **X (Twitter)** (plan API payant), un **assistant IA propulsé par Claude (Anthropic)** en plus de Gemini (pas de palier gratuit côté Anthropic), et le retour du **Hashtag Tracker** (nécessite lui aussi une clé API X payante pour compter réellement). Rien n'est caché : l'utilisateur voit pourquoi ce n'est pas là et ce que ça débloquerait.

---

## 4. Déploiement en production

1. **Base de données** : remplacez le provider `sqlite` de `prisma/schema.prisma` par `postgresql`, et `DATABASE_URL` par une base Postgres managée (Neon, Supabase, Railway...). Puis `npx prisma db push`.
2. **Hébergement de l'app** : Vercel (recommandé pour Next.js), Railway ou tout serveur Node.
3. **Stockage des médias** : par défaut les fichiers uploadés vont dans `./public/uploads`, ce qui ne fonctionne pas sur un hébergement serverless sans disque persistant (Vercel, entre autres). `src/lib/storage.ts` gère déjà ce cas automatiquement : dès que `BLOB_READ_WRITE_TOKEN` est renseigné dans les variables d'environnement, les uploads partent vers **Vercel Blob** au lieu du disque — aucun changement de code nécessaire. Créez un Blob Store dans votre projet Vercel (Storage → Create Database → Blob) pour obtenir ce token. Pour un autre stockage objet (S3, Cloudflare R2), adaptez ce même fichier.
4. **Publication planifiée** : deux options interchangeables :
   - **Un scheduler externe gratuit** (ex. [cron-job.org](https://cron-job.org)) : configurez un appel `GET /api/cron` chaque minute avec l'en-tête `Authorization: Bearer <CRON_SECRET>` — fonctionne sur n'importe quel hébergement, y compris le plan gratuit de Vercel (dont les Cron Jobs natifs sont limités à 1 fois/jour sur ce plan, insuffisant pour une publication planifiée à la minute près).
   - **Worker autonome** : `npm run worker` sur un service long-lived (Railway, Fly.io, VPS) si votre hébergement ne supporte pas les cron jobs serverless.
5. **Polices** : `next/font/google` (Inter, Space Grotesk) est désactivé par défaut dans `src/app/layout.tsx` pour fonctionner même sans accès sortant à `fonts.googleapis.com`. Décommentez les imports indiqués dans ce fichier pour les réactiver — aucun autre changement nécessaire.
6. **Secrets** : ne committez jamais `.env` (déjà exclu par `.gitignore`). Générez un `NEXTAUTH_SECRET` et un `CRON_SECRET` dédiés à la production, et mettez `NEXTAUTH_URL` à jour avec votre vrai domaine.

---

## 5. Structure du projet

```
src/
  app/
    page.tsx                 → page d'accueil (marketing)
    login/, register/        → authentification
    (dashboard)/             → app protégée (dashboard, calendar, composer, analytics, accounts,
                                 billing, posts/[id], support, community/*)
    api/                     → routes API (auth, posts, upload, connections OAuth, analytics, cron,
                                 ai/*, billing/*, media/*, community/*, brands)
  components/
    ui/                      → briques du design system (GlassCard, Button, StatCard, NetworkBadge...)
    dashboard/                → barre de navigation (topnav), icônes, graphique de croissance,
                                 assistant IA flottant, toasts, modale de confirmation, barre de quota,
                                 composants de mise à niveau (UpgradeGem, UpgradeButton, LockedUpgradeBadge)
    marketing/                → bloc de présentation "page par page" de la page d'accueil
  lib/
    social/                  → un client par réseau (OAuth + publication + analytics) + dispatcher
                                 (Instagram, Facebook, TikTok, YouTube)
    ai/                      → client Gemini (chat, génération de texte, analyse de rétention)
    billing/                 → plan par compte (paliers + nombre de marques), quotas, client Stripe
    video/                   → extraction de frames vidéo (ffmpeg) pour miniatures et analyse
    plans.ts, prisma.ts, auth.ts, publish.ts, storage.ts, types.ts, providers.ts
prisma/
  schema.prisma              → modèle de données (User, Subscription rattaché au User, Brand,
                                 SocialConnection, Post, PostTarget, AnalyticsSnapshot, VideoInsight,
                                 PostMessage, ForumThread, ForumReply, Guide, SharedVideo...)
scripts/
  worker.ts                  → publication planifiée en continu (alternative à /api/cron)
```

---

## 6. Limites connues / prochaines étapes suggérées

- L'upload chunké pour les grosses vidéos n'est implémenté qu'en flux simple sur les réseaux qui le permettent nativement ; pour des vidéos très volumineuses sur TikTok/YouTube, vérifiez les limites de taille par requête de chaque API.
- La publication de photos (hors vidéo) sur TikTok utilise un endpoint distinct (`/v2/post/publish/content/init/`, photo post) non encore branché.
- Le chiffrement des jetons d'accès en base (actuellement en clair dans `SocialConnection.accessToken`) est recommandé avant toute mise en production réelle.
- Aucune limite de débit (rate limiting) n'est appliquée sur les routes API : à ajouter avant une ouverture publique.
- L'analyse de rétention IA ne fonctionne que pour les vidéos YouTube publiées depuis assez longtemps pour avoir des données dans YouTube Analytics (généralement quelques heures, et un minimum de vues).
- Sans ffmpeg installé sur le serveur, la génération de miniatures et l'extraction de frames pour l'analyse de rétention sont désactivées proprement (message explicite), sans bloquer le reste de l'app.
- La Communauté (forum, guides, vidéos partagées) est volontairement globale et non modérée automatiquement : pour une ouverture publique réelle, ajoutez au minimum un signalement/une modération avant publication des messages.
- X (Twitter), LinkedIn et le Hashtag Tracker sont retirés du code pour l'instant (voir section 3bis) — leur retour est conditionné aux revenus du site plutôt qu'à du travail technique supplémentaire, le code ayant déjà existé pour X et LinkedIn dans une version antérieure.
