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

# DATABASE_URL doit pointer sur un Postgres (local ou branche de dev Neon)
npx prisma generate
npx prisma migrate deploy   # crée toutes les tables à partir de prisma/migrations

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

1. **Base de données** : Postgres managé (Neon). `DATABASE_URL` = l'adresse « pooled ». Le schéma est appliqué **automatiquement à chaque déploiement de production** par `scripts/db-migrate.mjs` (lancé par `npm run build`) — plus besoin de `prisma db push`. Voir la section « Migrations » ci-dessous.
2. **Hébergement de l'app** : Vercel (recommandé pour Next.js), Railway ou tout serveur Node.
3. **Stockage des médias** : par défaut les fichiers uploadés vont dans `./public/uploads`, ce qui ne fonctionne pas sur un hébergement serverless sans disque persistant (Vercel, entre autres). `src/lib/storage.ts` gère déjà ce cas automatiquement : dès que `BLOB_READ_WRITE_TOKEN` est renseigné dans les variables d'environnement, les uploads partent vers **Vercel Blob** au lieu du disque — aucun changement de code nécessaire. Créez un Blob Store dans votre projet Vercel (Storage → Create Database → Blob) pour obtenir ce token. Pour un autre stockage objet (S3, Cloudflare R2), adaptez ce même fichier.
4. **Publication planifiée** : deux options interchangeables :
   - **Un scheduler externe gratuit** (ex. [cron-job.org](https://cron-job.org)) : configurez un appel `GET /api/cron` chaque minute avec l'en-tête `Authorization: Bearer <CRON_SECRET>` — fonctionne sur n'importe quel hébergement, y compris le plan gratuit de Vercel (dont les Cron Jobs natifs sont limités à 1 fois/jour sur ce plan, insuffisant pour une publication planifiée à la minute près).
   - **Worker autonome** : `npm run worker` sur un service long-lived (Railway, Fly.io, VPS) si votre hébergement ne supporte pas les cron jobs serverless.
5. **Polices** : `next/font/google` (Inter, Space Grotesk) est désactivé par défaut dans `src/app/layout.tsx` pour fonctionner même sans accès sortant à `fonts.googleapis.com`. Décommentez les imports indiqués dans ce fichier pour les réactiver — aucun autre changement nécessaire.
6. **Secrets** : ne committez jamais `.env` (déjà exclu par `.gitignore`). Générez un `NEXTAUTH_SECRET` et un `CRON_SECRET` dédiés à la production, et mettez `NEXTAUTH_URL` à jour avec votre vrai domaine.
7. **Chiffrement des jetons** : ajoutez `TOKEN_ENCRYPTION_KEY` (générée avec `openssl rand -base64 32`). Les jetons OAuth des réseaux, intégrations et comptes publicitaires ainsi que les secrets de webhooks sont alors chiffrés en AES-256-GCM (voir `src/lib/db/secret-fields.ts`) ; le cron chiffre les anciens en quelques minutes. Gardez cette clé en lieu sûr : sans elle, les comptes connectés devraient être reconnectés. Pour en changer, mettez l'ancienne dans `TOKEN_ENCRYPTION_KEY_PREVIOUS`.
8. **Tests automatiques** : `npm test` lance les tests unitaires (`tests/security`, `tests/reliability`, `tests/quality`, `tests/resilience`, `tests/contracts`) — contrats des réseaux (une réponse type par appel, dans `tests/contracts/fixtures`), chiffrement, anti-SSRF, redirections, liens, e-mails, fichiers, publication, quotas, fuseaux horaires. `npm run test:integration` lance en plus les tests sur une vraie base Postgres **jetable** (variable `INTEGRATION_DATABASE_URL`, vidée à chaque test : jamais la production).
9. **Rappels Meta** (exigés pour la validation de l'app) : dans le tableau de bord Meta, renseignez `https://votre-site/api/meta/deauthorize` (désautorisation) et `https://votre-site/api/meta/data-deletion` (suppression des données) ; pour l'app Threads, les mêmes adresses suivies de `?app=threads`.
10. **Versions des API** : toutes dans `src/lib/social/versions.ts`, avec leur date de revue.
11. **Région Vercel = région Neon** : dans Vercel → Settings → Functions → Function Region, choisissez la région la plus proche de votre base Neon (ex. Neon `eu-central-1` → Vercel `fra1` Francfort). Chaque page fait plusieurs requêtes en base : un aller-retour transatlantique par requête ralentit tout le site.
12. **Incidents chez un réseau** : page `/admin/reseaux` (compte propriétaire) pour suspendre la publication ou la synchro d'un réseau, avec un message aux utilisateurs ; les publications concernées attendent et repartent seules à la reprise (24 h au plus). Un disjoncteur suspend aussi automatiquement un réseau 15 min après 5 pannes en 10 min, et vous prévient dans la cloche. Les limites de débit et pannes passagères sont relancées automatiquement (2, 10 puis 30 min). Un envoi resté sans réponse n'est jamais renvoyé à l'aveugle : Nebula cherche d'abord la publication sur le réseau (« déjà en ligne ? ») et la marque publiée s'il la trouve.
13. **Changement d'API chez un service externe** : chaque réponse lue par Nebula est vérifiée (`src/lib/social/contract.ts`) — réseaux sociaux, Google Ads, Meta Ads, TikTok Ads, Unsplash, Canva, OneDrive, Gemini, Resend, Turnstile. La cloche vous prévient aussi quand la configuration bloque un service : modèle Gemini retiré par Google (réglez `GEMINI_MODEL`), clé Gemini refusée, e-mails bloqués chez Resend (clé, domaine non vérifié, quota), clé Turnstile refusée (inscriptions bloquées). Si un réseau change le format d'une réponse, l'appel échoue avec un message qui nomme le champ en cause, vous êtes prévenu dans la cloche (« … répond dans un nouveau format »), et la forme reçue (sans aucune donnée) est écrite dans les journaux Vercel, ligne `[contrat]`. Pour corriger : adapter le contrat du client concerné et remplacer la réponse type correspondante dans `tests/contracts/fixtures`, puis `npm test`. Une publication touchée n'est jamais renvoyée à l'aveugle : Nebula vérifie d'abord si elle est en ligne. Côté publicité, les dépenses déjà enregistrées ne sont jamais effacées par un rapport suspect.
14. **Intégration continue** : `.github/workflows/ci.yml` vérifie chaque push sur GitHub (types, lint, tests unitaires, migrations sur un Postgres neuf, tests d'intégration, build). Résultat dans l'onglet **Actions** du dépôt ; gratuit pour un dépôt privé dans la limite du quota mensuel de GitHub.
15. **Premier affichage** : l'application (menu, compte, marques) ainsi que la Vue d'ensemble et Analytics arrivent déjà remplies depuis le serveur, pour la marque choisie — mémorisée dans un cookie `nb_brand` (simple préférence, toujours revérifiée). Si une page reste sur des squelettes, regardez les journaux Vercel de la page elle-même (plus seulement ceux des routes `/api`).
16. **Pages vitrine pré-générées** (accueil, tarifs, outils, comparatifs, légal…) : construites au déploiement et servies depuis le cache de Vercel, sans fonction ni base de données. Leur contenu (prix de `plans.ts` compris) change donc au prochain déploiement. Elles ont une CSP sans nonce ; l'application, la page bio, les pages client à jeton et la connexion gardent la CSP stricte avec nonce (`src/lib/csp.ts`). Soupape en cas de script bloqué en production : variable `CSP_MODE=report-only` sur Vercel.
17. **Réussites v2** (`/reussites`) : 5 rangs à 3 paliers (Étincelle → Nébuleuse), trois missions par semaine (Habitude, Progression au choix, Mystère), un coffre quand les trois sont faites, une série de semaines actives protégée par des boucliers. Tout est calculé à partir de vraies publications et actions ; aucune récompense n'a de valeur marchande. La migration `20260926090000_reussites_missions` (tables `WeeklyMissions`, `ReussiteItem`, colonne `MediaAsset.importSource`) s'applique toute seule au déploiement. Les rappels (lundi matin, dimanche soir) partent avec les tâches de compte du cron, une seule fois par semaine.
18. **Réussites v2, lot B** : constellation de 25 étoiles (Régularité, Formats vidéo, Portée, Communauté, Stratégie) avec une mini-leçon de 2 minutes chacune ; les rangs Étoile, Constellation et Nébuleuse demandent aussi des compétences variées (un rang déjà atteint n'est jamais retiré) ; bilan de la semaine ; vitrine de 3 badges visible dans la Communauté ; carte de créateur en image (aucune page publique). Au passage : la miniature choisie dans Publier est désormais envoyée à YouTube (chaîne vérifiée par téléphone requise par YouTube), les réponses du compte à ses commentaires sont repérées à l'actualisation (Instagram, Facebook, YouTube, sans nouvelle autorisation), et le « meilleur créneau » de la Vue d'ensemble est calculé à l'heure de la marque (avant : heure du serveur). Migration `20260927090000_reussites_constellation`, appliquée toute seule au déploiement.
19. **Réussites v2, lot C** : défi collectif du mois (objectif automatique = mois précédent + 10 %, au moins 10 ; réglable dans `/admin/reussites` ; objectif atteint = badge collectif et +50 XP pour chaque participant), badge de saison (2 défis du mois réussis dans la saison), vidéo à la une dans la Communauté (3 places de 7 jours ; gagnée au rang Constellation I ou dans le coffre, 5 % ; seulement avec l'accord du créateur, retirable par lui ou par vous), rareté réelle des badges (part des créateurs, à partir de 20 créateurs), « Premier décollage » (5 étapes pendant les 7 premiers jours) et badge caché « Explorateur » (2 outils gratuits essayés avant l'inscription, via le petit cookie technique `nb_tools`, décrit dans les mentions légales). Migration `20260928090000_reussites_social`, appliquée toute seule au déploiement.
20. **Audit de présence en ligne gratuit** (`/outils/audit`, produit n°8) : le visiteur colle ses liens (chaîne YouTube, compte Instagram professionnel, compte TikTok, site ou page bio) et obtient en quelques secondes un score sur 100 (profil, régularité, engagement, contenu, cohérence), les actions à faire en premier et trois paragraphes de conseils écrits par Gemini, sur un rapport partageable (`/audit/<jeton>`, image de partage, 30 jours, jamais indexé, supprimable par quiconque a le lien). Sans compte, 3 audits par jour et par IP, Turnstile. **À configurer sur Vercel** : `YOUTUBE_API_KEY` (clé d'API gratuite, sans elle le champ YouTube est masqué) et, facultatif, `IG_DISCOVERY_USER_ID` + `IG_DISCOVERY_TOKEN` (voir `.env.example`) ; redéployer après les avoir ajoutées. Migration `20260929090000_public_audit`, appliquée toute seule au déploiement.
21. **Studio IA** (`/studio`, produit n°9) : des idées de vidéos avec leurs accroches (3 premières secondes) et des scripts complets (format court ou vidéo longue), écrits par Gemini à partir de ce qui marche déjà pour la marque : meilleures publications comparées aux habitudes de chaque réseau, meilleures heures, courbes de Rétention IA. Les chiffres montrés sont calculés par Nebula, jamais par l'IA ; les repères « relancez ici » d'un script viennent des vraies courbes. Une idée devient un script en un clic, et « Utiliser dans Publier » préremplit le titre, la légende et le réseau. En Gratuit, les chiffres restent visibles et la génération ouvre l'offre Pro ; 15 générations par jour en Pro, 40 en Agence, historique gratuit (50 par marque). Aucune nouvelle variable : utilise `GEMINI_API_KEY`. Migration `20260930090000_studio_ia`, appliquée toute seule au déploiement.
22. **Media kit public** (`/media-kit` dans l'application, page publique `/kit/<marque>`, produit n°10) : la page que le créateur envoie aux marques et aux sponsors. Audience totale, vues sur 90 jours, engagement moyen, rythme de publication, et pour chaque compte abonnés, évolution sur 30 jours, vues par publication et taux d'engagement, relevés par Nebula (jamais saisis, jamais modifiables) ; publications à la une (automatiques ou choisies, 6 au plus) ; présentation, offres et e-mail de contact écrits par le créateur. Bouton « Télécharger en PDF » (impression du navigateur, en clair), image de partage, compteur d'ouvertures sans cookie. En Gratuit, le kit se prépare et s'affiche en aperçu ; le publier est réservé à Pro et Agence (dépublié à la fin de l'essai). Landing `/decouvrir/media-kit` pour le badge « Propulsé par Nebula ». Aucune nouvelle variable. Migration `20261001090000_media_kit`, appliquée toute seule au déploiement.

### Migrations de la base (Prisma Migrate)

- **Modifier le schéma** : éditez `prisma/schema.prisma`, puis sur une base de DEV : `npx prisma migrate dev --name ajout_truc`. Un dossier `prisma/migrations/<date>_ajout_truc/` est créé : committez-le avec le schéma.
- **Déploiement** : `npm run build` appelle `scripts/db-migrate.mjs`, qui applique les migrations en attente (`prisma migrate deploy`). Au tout premier déploiement après l'adoption des migrations, la base existante est d'abord alignée (`db push`, sans suppression de données) puis les migrations sont marquées comme déjà appliquées ; ensuite seul `migrate deploy` est utilisé.
- **Previews Vercel** : ignorés (ils ne touchent pas à la base de production). `MIGRATE_PREVIEW=true` force la migration sur un Preview qui a sa propre base.
- **Neon** : les migrations passent par l'adresse directe. `DIRECT_URL` si elle est définie, sinon `DATABASE_URL` sans `-pooler`.
- **À la main** : `npm run db:deploy` (même script).
- **Une migration a échoué** : le build s'arrête et le site garde la version précédente. Corrigez la cause (souvent des doublons qui empêchent une contrainte `@unique`), puis `npx prisma migrate resolve --rolled-back <nom_du_dossier>` et redéployez.
- **Ne jamais** modifier un dossier de migration déjà déployé : créez-en un nouveau.

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
    studio/                  → Studio IA : faits « ce qui marche » calculés sans IA, idées et scripts
    media-kit/               → media kit public : chiffres recalculés, réglages, cache de la page /kit
    audit/                   → audit de présence gratuit (sources publiques, score par règles)
    billing/                 → plan par compte (paliers + nombre de marques), quotas, client Stripe
    video/                   → extraction de frames vidéo (ffmpeg) pour miniatures et analyse
    server-data/             → données préparées côté serveur (marques, statistiques…), partagées
                                 par les pages et les routes /api
    data/                    → cache partagé du navigateur (SWR) et données semées par le serveur
    plans.ts, prisma.ts, auth.ts, publish.ts, storage.ts, types.ts, providers.ts
prisma/
  schema.prisma              → modèle de données (User, Subscription rattaché au User, Brand,
                                 SocialConnection, Post, PostTarget, AnalyticsSnapshot, VideoInsight,
                                 PostMessage, ForumThread, ForumReply, Guide, SharedVideo...)
  migrations/                → historique versionné du schéma (appliqué au déploiement)
scripts/
  worker.ts                  → publication planifiée en continu (alternative à /api/cron)
  db-migrate.mjs             → application des migrations au build de production
tests/
  security/, reliability/, quality/  → tests unitaires (npm test)
  integration/               → tests sur Postgres jetable (npm run test:integration)
.github/workflows/ci.yml     → vérifications automatiques sur GitHub
docs/ARCHITECTURE.md         → règles d'architecture et méthode de travail par module
```

---

## 6. Limites connues / prochaines étapes suggérées

- L'upload chunké pour les grosses vidéos n'est implémenté qu'en flux simple sur les réseaux qui le permettent nativement ; pour des vidéos très volumineuses sur TikTok/YouTube, vérifiez les limites de taille par requête de chaque API.
- La publication de photos (hors vidéo) sur TikTok utilise un endpoint distinct (`/v2/post/publish/content/init/`, photo post) non encore branché.
- La limite de débit (`src/lib/rate-limit.ts`, compteurs en base) couvre l'inscription, la connexion et le mot de passe oublié ; elle laisse passer si la base est indisponible, et ne remplace pas un pare-feu contre une attaque distribuée.
- L'analyse de rétention IA ne fonctionne que pour les vidéos YouTube publiées depuis assez longtemps pour avoir des données dans YouTube Analytics (généralement quelques heures, et un minimum de vues).
- Sans ffmpeg installé sur le serveur, la génération de miniatures et l'extraction de frames pour l'analyse de rétention sont désactivées proprement (message explicite), sans bloquer le reste de l'app.
- La Communauté (forum, guides, vidéos partagées) est volontairement globale et non modérée automatiquement : pour une ouverture publique réelle, ajoutez au minimum un signalement/une modération avant publication des messages.
- X (Twitter), LinkedIn et le Hashtag Tracker sont retirés du code pour l'instant (voir section 3bis) — leur retour est conditionné aux revenus du site plutôt qu'à du travail technique supplémentaire, le code ayant déjà existé pour X et LinkedIn dans une version antérieure.
