# Architecture de Nebula — règles à respecter

Ce document sert de référence avant toute modification, qu'elle soit faite à la
main ou avec une IA. Chaque règle existe parce qu'un problème réel a été
corrigé (audit de septembre 2026, lots 1 à 11), plus les règles propres aux
Réussites v2 (lots A et B).

## 1. Carte des modules

| Module | Rôle | Point d'entrée unique |
|---|---|---|
| Base de données | Accès Postgres, chiffrement des secrets | `src/lib/prisma.ts` (`prisma`) |
| Secrets | Clés dérivées, comparaisons sûres | `src/lib/secrets.ts` |
| Comptes | Confirmation d'e-mail, sessions, OAuth | `src/lib/auth.ts`, `src/lib/account-security.ts` |
| Réseaux sociaux | OAuth, publication, statistiques | `src/lib/social/*` (un fichier par réseau) |
| Versions d'API | Toutes les versions et leur date de revue | `src/lib/social/versions.ts` |
| Publication | File d'attente, reprise, finalisation | `src/lib/publish.ts` |
| Adresses externes | Appels vers des URL fournies par un utilisateur | `src/lib/net-safety.ts` (`fetchPublic`) |
| Fichiers | Upload, propriété, suppression | `src/lib/storage.ts`, `src/lib/upload-policy.ts`, `src/lib/media-files.ts` |
| Offres et quotas | Paliers, emplacements de connexion | `src/lib/billing/plan.ts` |
| Tâches planifiées | Publication, rappels, maintenance | `src/app/api/cron/route.ts` |
| Graphiques | recharts chargé à la demande | `src/components/charts/lazy.tsx` |
| Page bio publique | Données en cache, invalidation | `src/lib/link-in-bio-cache.ts` |
| Liste des publications | Période, vue allégée, pagination | `src/lib/posts/list-posts.ts` |
| Erreurs des réseaux | Catégories, relances, conseils | `src/lib/social/errors.ts`, `error-advice.ts` |
| Interrupteurs par réseau | Suspension manuelle, disjoncteur | `src/lib/social/network-control.ts`, page `/admin/reseaux` |
| Santé des comptes | Compte à reconnecter, synchros | `src/lib/social/connection-health.ts` |
| « Déjà en ligne ? » | Retrouver un envoi incertain | `src/lib/social/reconcile.ts`, `listRecentPosts` des clients |
| Données partagées (navigateur) | Cache SWR entre les pages | `src/lib/data/hooks.ts`, `swr-config.tsx` |
| Animations | framer-motion chargé en différé | `src/components/motion/motion-root.tsx` |
| Appels aux réseaux | Porte unique : délai, pannes classées, JSON sûr | `src/lib/social/base.ts` (`sendRequest`, `fetchJson`, `downloadMedia`) |
| Contrats des réponses | Schémas zod, écarts décrits, forme sans valeurs | `src/lib/social/contract.ts`, tests `tests/contracts` |
| Régies publicitaires | Porte commune + contrats, erreurs traduites en `AdsError` | `src/lib/ads/http.ts` (`adsJson`) |
| Sources d'import | Porte commune + contrats, erreurs traduites en `ImportError` | `src/lib/integrations/http.ts` (`importJson`) |
| Alertes au propriétaire | Cloche : incident, version retirée, format changé | `src/lib/owner-alerts.ts` |
| IA (Gemini) | Porte commune, contrat, relances, modèle retiré signalé | `src/lib/ai/gemini.ts` (`fetchGeminiWithRetry`) |
| E-mails (Resend) | Porte commune, idempotence des envois automatiques | `src/lib/email.ts` (`sendEmail`, `emailIdempotencyKey`) |
| Anti-robot (Turnstile) | Délai de 8 s, clé mal configurée signalée | `src/lib/turnstile.ts` |
| Données préparées par le serveur | Marques, compte, statistiques… lues une fois par requête, partagées avec les routes `/api` | `src/lib/server-data/*` (`resolveActiveBrand`, `getAnalyticsList`…), `src/lib/me.ts` (`buildMe`) |
| Marque active | Cookie `nb_brand` (+ localStorage), toujours revérifié par le serveur | `src/lib/active-brand.ts`, `src/lib/server-data/brands.ts` |
| Premier affichage | Données du serveur semées dans le cache SWR, sans nouvel appel | `src/lib/data/swr-config.tsx` (`SeededData`, `useSeededMount`, `useSeedIsFresh`) |
| Sécurité du navigateur (CSP) | Deux niveaux : stricte avec nonce (application, page bio, pages à jeton, connexion) ou vitrine pré-générée ; classement de chaque page | `src/lib/csp.ts` (`usesStrictCsp`, `STATIC_PAGES`, `buildCsp`), `src/middleware.ts`, `src/components/csp-document-guard.tsx` |
| Réussites (XP, rangs) | Mesures, évaluation, notifications, affichage | `src/lib/reussites/engine.ts` (`evaluateReussites`), `catalog.ts` (rangs, badges, récompenses), `view.ts` (page et résumé) |
| Missions de la semaine | Habitude / Progression / Mystère, coffre, choix de la Progression | `src/lib/reussites/missions.ts` (règles pures), `weekly.ts` (base : `ensureWeeklyMissions`, `chooseProgress`, `openChest`) |
| Série et boucliers | Semaines actives, boucliers gagnés et dépensés | `src/lib/reussites/streak.ts` (règles pures), registre `ReussiteItem` |
| Rappels des missions | Lundi matin et dimanche soir (heure de Paris), une fois par semaine | `src/lib/reussites/nudges.ts`, lancé par `src/lib/account-jobs.ts` |
| Constellation de compétences | 25 étoiles (5 compétences), mini-leçons, condition de variété des rangs | `src/lib/reussites/skills.ts` (catalogue, `gatedRank`), `skill-metrics.ts` (mesures), `lessons.ts` (textes, chargés à la demande) |
| Bilan de la semaine, vitrine, carte | Cap de la semaine, 3 badges montrés dans la Communauté, image PNG du créateur | `src/lib/reussites/review.ts`, `showcase.ts`, `src/app/api/reussites/card/route.tsx` (next/og) |
| Défi collectif, saisons | Objectif commun du mois (auto : mois précédent + 10 %, min. 10 ; réglable), badge de saison (2 défis du mois dans la saison) | `src/lib/reussites/collective.ts`, `seasons.ts`, admin `/admin/reussites` (`/api/admin/reussites`) |
| Vidéo à la une | Accord du créateur, tickets (rang Constellation I, coffre), file de 3 places × 7 jours, retrait | `src/lib/reussites/featured.ts`, `/api/community/featured`, bandeau `src/components/reussites/featured-strip.tsx` |
| Rareté, Premier décollage, Explorateur | Part réelle des créateurs par badge (recalcul quotidien), 5 étapes des 7 premiers jours, cookie « outils essayés » | `src/lib/reussites/rarity.ts`, `launch.ts`, `src/lib/tools-explored.ts` |
| Audit de présence (outil public) | Score /100 à partir des données publiques (YouTube par clé d'API, Instagram professionnel par Business Discovery, TikTok par oEmbed, site), rapport par lien secret 30 jours, conseils Gemini | `src/lib/audit/` (`parse-input.ts`, `sources/*`, `score.ts` pur, `advice.ts`, `run.ts`), `/outils/audit`, `/audit/[token]`, `/api/public/audit` |
| Studio IA (idées, accroches, scripts) | Faits « ce qui marche chez vous » calculés sans IA (meilleures publications rapportées aux habitudes de chaque réseau, heures, rétention, rythme), puis idées + accroches ou script de vidéo écrits par Gemini en JSON vérifié ; Pro 15 / Agence 40 par jour, historique 50 par marque | `src/lib/studio/` (`facts.ts` pur, `load.ts`, `generate.ts`, `types.ts`), `/studio`, `/api/studio`, `/api/studio/generations/[id]`, reprise dans Publier (`/composer?studio=`) |
| Media kit public | Page à envoyer aux sponsors : chiffres recalculés sans saisie (abonnés, évolution, vues médianes, engagement, publications) depuis AnalyticsSnapshot et PostMetric, texte du créateur, PDF (impression), image de partage, ouvertures comptées sans cookie ; aperçu gratuit, publication Pro/Agence | `src/lib/media-kit/` (`stats.ts` pur, `load.ts`, `cache.ts`, `types.ts`), `/media-kit`, `/kit/[slug]`, `/api/media-kit`, `/api/public/kit/[slug]/view`, `/decouvrir/media-kit` |
| Meilleur créneau | Heure qui marche le mieux, dans le fuseau de la marque | `src/lib/best-hour.ts` (Vue d'ensemble et étoile « Au bon moment ») |

## 2. Règles non négociables

1. **Toujours importer `prisma` depuis `@/lib/prisma`**, jamais `new PrismaClient()` : c'est ce client qui chiffre et déchiffre les jetons.
2. **Tout nouveau champ secret** (jeton, clé, secret de webhook) s'ajoute à `SECRET_FIELDS` dans `src/lib/db/secret-fields.ts`.
3. **Toute URL fournie par un utilisateur** s'appelle via `fetchPublic()` ; tout lien affiché passe par `safeHref()` ; toute redirection interne par `safeRelativePath()`.
4. **Aucune version d'API écrite en dur** dans un client réseau : elle vient de `versions.ts`.
5. **Un client réseau ne bloque jamais plus de ~20 s** : au-delà, il renvoie un `PendingPublish` avec un point de reprise, et le cron reprend (`resumePublish`).
6. **Un post ne change d'état qu'à travers `publish.ts`** (prise atomique, finalisation atomique). Aucune route ne modifie `Post.status` directement pour publier.
7. **Signatures et secrets** : une clé par usage (`deriveKey`), comparaison avec `safeEqual`.
8. **Schéma** : toute modification passe par une migration (`npx prisma migrate dev`), committée avec le schéma. Jamais de `db push` en production.
9. **Fonctions Vercel** : le plan Hobby limite le nombre de fonctions ; préférer ajouter une action à une route existante plutôt que créer une route.
10. **Bibliothèques lourdes chargées à la demande** : `recharts` seulement via `components/charts/lazy.tsx` (ou un composant lui-même chargé par `next/dynamic`) ; le module d'envoi Blob seulement via `uploadMediaFile()`. Un panneau qui s'ouvre sur action (assistant, profil) est monté à la première ouverture.
11. **Valeurs de contexte React mémorisées** (`useMemo`/`useCallback`) : une valeur recréée à chaque rendu re-rend toute l'application.
12. **Minuteries** : pas d'appel réseau périodique plus fréquent que toutes les 5 minutes (chaque appel réveille la base Neon), sauf pour suivre une action en cours (ex. publication en traitement) ; rafraîchir plutôt au retour sur l'onglet (`visibilitychange`).
13. **Page bio publique en cache** : toute écriture qui change ce qu'elle affiche appelle `invalidateLinkPage(brandId)` (`src/lib/link-in-bio-cache.ts`).
14. **Listes de publications** : les écrans demandent `GET /api/posts` avec `view=light` et, quand c'est possible, une période (`from`/`to`) ; jamais toutes les publications complètes.
15. **Erreurs des réseaux** : jamais de test sur le texte d'une erreur ; `classifyProviderError()` donne la catégorie. Un nouveau code d'erreur d'un réseau s'ajoute au classifieur (`errors.ts`) avec son test (`tests/resilience`).
16. **Jamais de nouvel envoi automatique d'une écriture sans réponse** (délai dépassé, connexion coupée) : elle a peut-être abouti. Seuls une limite de débit ou une panne avec réponse du réseau sont relancés (3 fois au plus).
17. **Toute synchro avec un réseau** passe par `syncBlockedReason()`, `onSyncError()` et `onSyncSuccess()` (`connection-health.ts`) : réseau suspendu respecté, compte signalé, disjoncteur alimenté.
18. **Données communes à plusieurs pages** (comptes connectés, statut IA, usage, statistiques) : toujours via les hooks de `src/lib/data/hooks.ts` ; après une action qui les modifie, appeler le `refresh*` correspondant.
19. **Animations** : importer `m as motion` (jamais `motion` complet) et placer le composant sous une `MotionRoot` ; sans elle, le contenu resterait invisible.
20. **Nouveau client réseau** : implémenter `listRecentPosts` pour que les envois incertains soient vérifiés au lieu d'être renvoyés.
21. **Aucun `fetch` direct vers un service externe dans le code serveur** (`src/lib`, `src/app/api`, hors `social/base.ts`) : tout passe par `sendRequest` / `fetchJson` (délai garanti, absence de réponse classée), `adsJson`, `importJson`, `downloadMedia` (médias) ou `fetchPublic` (adresse fournie par un utilisateur). Seul le code du navigateur appelle `fetch("/api/…")`. Vérifié par `tests/contracts/guard.test.ts`.
22. **Toute réponse lue a un contrat** : `fetchJson(..., { schema })`, jamais `fetchJson<Type>` (idem `graph`, `api`, `xrpc`). Champs indispensables stricts (identifiant, liste, jeton), champs secondaires tolérants (`soft`). Une liste illisible est une erreur, jamais une liste vide.
23. **Nouvel appel, nouveau réseau, nouvelle régie ou source d'import** : une réponse type dans `tests/contracts/fixtures/<service>` (d'après la documentation officielle, ou une vraie réponse sans données personnelles) et un test de contrat, dont un cas de dérive (champ indispensable absent).
24. **Synchro publicitaire** : un rapport entièrement vide n'efface jamais des dépenses déjà enregistrées (voir `src/lib/ads/sync.ts`) ; seule une journée absente d'un rapport non vide est remise à zéro.
25. **E-mails automatiques** (cron : cycle de vie, rapports) : toujours avec une clé d'idempotence (`emailIdempotencyKey`), pour qu'un nouvel essai après un délai dépassé n'envoie jamais deux fois.
26. **Une donnée, une fonction serveur** : ce qu'une page prépare côté serveur et ce que renvoie la route `/api` correspondante sortent de la même fonction de `src/lib/server-data` (jamais deux requêtes Prisma qui divergent). Ces modules ne sont jamais importés par un fichier `"use client"` (vérifié par `tests/quality/server-first-render.test.ts`).
27. **Marque active** : le cookie `nb_brand` n'est qu'une préférence d'affichage. Le serveur ne l'utilise qu'après avoir vérifié que la marque appartient au compte (`resolveActiveBrand`) ; sinon, première marque du compte. Toute route reste protégée par sa propre vérification d'accès.
28. **Données semées** : une page qui prépare une donnée d'un hook SWR la passe par `<SeededData entries={{ [clé]: donnée }} at={Date.now()}>` et le hook utilise `revalidateOnMount: useSeededMount(clé)`. Jamais d'écriture dans le cache SWR pendant le rendu serveur (partagé entre visiteurs). Les clés viennent de `src/lib/data/keys.ts` (module sans `"use client"` : une valeur importée d'un module `"use client"` par un composant serveur n'est qu'une référence). Une page resservie par le cache du routeur (retour arrière) recharge ses données : `useSeedIsFresh` pour les données hors SWR (`initial`).
29. **Heure, fuseau, hasard** : le serveur est en UTC et ne connaît pas l'heure du visiteur. Tout affichage qui en dépend (« ce mois-ci », horloge, compte à rebours, tirage au sort) attend `useHydrated()` (`src/lib/use-hydrated.ts`) ou se calcule côté serveur puis se transmet (ex. `greetingIndex`), sinon erreur d'hydratation.
30. **Nouvelle page = classement explicite** dans `src/lib/csp.ts`. Contenu écrit par un utilisateur, identifiants ou données privées : préfixe strict (nonce) et `export const dynamic = "force-dynamic"` dans la page ou son layout. Contenu écrit uniquement par Nebula : `STATIC_PAGES`, sans session, cookies, en-têtes, `searchParams` ni Prisma au rendu (un paramètre d'adresse se lit dans le navigateur, sous `<Suspense>`) ; page à paramètre avec `generateStaticParams` et `dynamicParams = false`. Vérifié par `tests/quality/csp.test.ts`.
31. **Entrer dans l'application par un chargement complet** : après connexion ou inscription, `window.location.assign(...)` (jamais `router.push`), pour que l'onglet reçoive la CSP stricte. Filet : `CspDocumentGuard` recharge une page stricte atteinte par un lien interne depuis la vitrine.
32. **Réussites : toute récompense passe par une clé unique en base.** Mission validée = `ChallengeCompletion` (`kind: "MISSION"`, `challengeKey: mission-<emplacement>`, une par semaine) ; coffre = `kind: "CHEST"` ; bouclier ou fragment = une ligne `ReussiteItem` (quantité +1 ou -1) avec une raison unique (`chest:<semaine>`, `streak:<début>:<palier>`, `protect:<semaine>`). Réévaluer, relancer le cron ou cliquer deux fois ne donne jamais deux fois. Le coffre s'ouvre par un `updateMany` conditionnel (`chestOpenedAt: null`).
33. **Missions : jamais d'objectif impossible.** Une mission n'est proposée que si le compte peut la faire (réseaux connectés, sources d'import, page bio pas déjà prête) ; l'objectif Habitude suit le rythme réel (médiane des 4 dernières semaines + 1, plafonnée par l'offre) et tient compte des jours restants quand la semaine commence tard. Toute nouvelle mission : une mesure réelle (jamais un clic), un lien d'action interne, un cas dans `tests/quality/reussites-v2.test.ts`.
34. **Rangs : personne ne perd rien.** `creatorLevel` stocke le palier (1 à 15) ; les récompenses restent accordées par les anciennes clés `level-N` **et** par les nouvelles `rank-N`. Un changement de seuils ou de paliers doit garder les XP déjà acquis au même endroit (test « mêmes XP que les anciens niveaux »). Pas d'argent en récompense : ni jours Pro, ni quota, ni remise, ni IA offerte.
35. **Étoiles : une mesure réelle, jamais retirée.** Chaque étoile (`skills.ts`) se mesure dans `skill-metrics.ts` sur des données réelles (publications en ligne, relevés, réponses repérées sur les commentaires, Communauté, bilans, page bio), jamais sur un clic ; elle est enregistrée comme un accomplissement `star-<compétence>-<n>` (clé stable, ne jamais renommer) et n'est jamais retirée. Toute nouvelle étoile : sa mini-leçon dans `lessons.ts` et un cas dans `tests/quality/reussites-constellation.test.ts`.
36. **Condition de variété : seulement pour les passages à venir.** Le rang enregistré (`User.creatorLevel`) passe par `gatedRank(xp, niveaux des compétences, palier déjà atteint)` : jamais sous un palier déjà atteint, jamais au-delà des XP. Tout affichage du rang part du palier enregistré (`rankAt`), jamais des XP seuls. Le passage à la v2 d'un compte déjà évalué est marqué par l'accomplissement `migration:v2` (sans XP) : sans lui, tout ce qui est déjà mérité est enregistré en silence, avec une seule annonce.
37. **Écriture annexe après une publication = best-effort.** Miniature YouTube (`applyYoutubeThumbnail`), playlist, premier commentaire : ne font jamais échouer une publication déjà en ligne, ne sont jamais relancées automatiquement, et leur sort est enregistré quand il sert (`PostTarget.thumbnailStatus`).
38. **Heures « de la marque »** : une heure de publication montrée en conseil ou comptée pour une réussite (meilleur créneau, tests de créneaux) se lit dans le fuseau de la marque (`wallHour`, `src/lib/best-hour.ts`), jamais avec `getHours()` côté serveur (UTC sur Vercel). Seuls deux easter eggs gardent volontairement l'heure du serveur (approximation documentée dans `publish.ts` et `/api/easter-eggs`).
39. **Défis partagés : jamais de classement.** Le défi collectif montre le total, le nombre de créateurs et la part du créateur lui-même, jamais celle des autres ; la rareté n'expose que des totaux par badge (`BadgeRarity`), jamais qui a quoi, et rien sous 20 créateurs. Un badge collectif, de saison ou un ticket s'accorde par une clé unique (`ChallengeCompletion` kind `COLLECTIVE`/`SEASON`, `ReussiteItem` reason `rank:10`, `feature-use:<n>`) : réévaluer n'accorde jamais deux fois.
40. **Vidéo à la une = accord + lien.** Seulement une vidéo déjà partagée dans la Communauté, par un créateur qui a coché l'accord (`User.featureConsent`, retirable : le retirer retire ses vidéos) ; on affiche un lien vers le réseau, jamais une copie. Le créateur et le propriétaire du site peuvent toujours retirer. Aucune récompense des Réussites ne donne d'argent, de jours Pro, de quota ni d'IA offerte.
41. **Cookie « outils essayés » (`nb_tools`) : noms d'outils seulement.** Première partie, 30 jours, SameSite=Lax, aucun identifiant ; lu une seule fois à l'inscription (`User.toolsExplored`). Tout nouveau cookie est décrit dans les mentions légales (section Cookies) avant la mise en ligne.
42. **Audit de présence : données publiques, portes officielles.** Chaque source passe par la porte commune (`fetchJson`) ou la garde anti-SSRF (`fetchPublic` pour les sites), 8 s au plus, et une source en échec donne un bloc « non analysable », jamais un rapport en erreur. YouTube : clé d'API dans l'en-tête `x-goog-api-key`, jamais `search.list` ; Instagram : Business Discovery (comptes professionnels seulement) ; TikTok : oEmbed ; jamais de lecture du HTML des réseaux. Une source sans clé est masquée, jamais simulée.
43. **Score de l'audit : des règles affichées, rien d'inventé.** Chaque note vient d'une règle de `score.ts` montrée dans « Pourquoi ce score », avec des repères présentés comme ceux de Nebula (jamais une « moyenne du secteur ») ; un axe sans données est exclu, jamais compté zéro, et il faut 2 axes pour un score global. Gemini ne reçoit que les faits calculés, et un paragraphe qui cite un nombre absent des faits est écarté (`keepFaithful`).
44. **Rapports publics d'audit.** Jeton aléatoire (18 octets), page `noindex` à CSP stricte (volontairement non bloquée dans robots.txt, pour les aperçus de partage), supprimable par quiconque a le lien, purgée à 30 jours ; adresse e-mail jamais conservée avec le rapport ; quota de 3 audits par jour et par IP (empreinte), un essai sans rien de lisible étant rendu (10 par jour au plus).
45. **Studio IA : les chiffres viennent des faits, jamais de l'IA.** Tout nombre affiché à côté d'un résultat (vues, « × vos chiffres habituels », rétention) vient de `facts.ts` ; l'IA ne cite qu'un numéro de publication (`basedOn`), vérifié contre la liste, et les repères de rétention d'un script sont placés d'après les vraies courbes (`annotateScript`). L'IA ne reçoit que les faits calculés, jamais un jeton ni le texte brut d'un compte ; sa réponse passe par un contrat zod, et une réponse illisible ne coûte rien.
46. **Studio IA : quota compté sur l'historique.** Générations du jour (depuis minuit, heure de Paris) = lignes `StudioGeneration` de l'utilisateur ; Gratuit = aperçu des faits et 402 `reason: "studio"` ; un échec de l'IA n'enregistre rien. L'historique est borné à 50 par marque, mais les lignes du jour ne sont jamais effacées (sinon le quota se rechargerait). Rafale : 8 essais en 10 minutes.
47. **Media kit : des chiffres qu'on ne règle pas.** Aucun chiffre n'est stocké avec le kit (`MediaKit` ne garde que les réglages) : tout est recalculé depuis les relevés des API officielles, avec la date du dernier relevé affichée. Le créateur choisit les comptes et les publications affichés et écrit son texte ; les identifiants qu'il désigne sont vérifiés comme appartenant à SA marque. Un compte déconnecté n'apparaît jamais ; un chiffre inconnu s'affiche « — », jamais 0.
48. **Media kit public.** Visible seulement s'il est publié ET que le palier le permet (`mediaKitEnabled`, revérifié à chaque lecture, dépublié à la fin de l'essai) ; `noindex`, non bloqué dans robots.txt (aperçus de partage) ; CSP stricte ; servi depuis le cache (10 min), invalidé à chaque modification du kit, de la marque ou de l'abonnement. Ouvertures : sans cookie, un visiteur (empreinte d'IP) une fois par jour, jamais les membres de la marque ni les robots.

## 3. Méthode de travail par module (avec ou sans IA)

Pour chaque changement, une demande = un module. Le modèle de demande :

1. **Contexte** : le module concerné (tableau ci-dessus) et les règles de la section 2 qui s'y appliquent.
2. **Objectif** : le comportement attendu, vu par l'utilisateur.
3. **Contraintes** : pas de service payant, pas de nouvelle route si une existante suffit, français dans l'interface.
4. **Preuve** : le test qui doit passer (existant ou à écrire) et les commandes de vérification.

Vérifications avant chaque livraison :

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration   # si une base de test est disponible
npx next build
```

## 4. Stratégie de tests

| Niveau | Où | Ce qu'on y met |
|---|---|---|
| Unitaire | `tests/security`, `tests/reliability`, `tests/quality` | Fonctions pures, clients réseau avec `fetch` simulé, règles de quotas, dates, marque active et données semées (rendu React côté serveur) |
| Contrats | `tests/contracts` | Chaque appel de chaque réseau rejoué sur sa réponse type : requête envoyée (version, jeton, contenu), résultat lu, dérives détectées |
| Intégration | `tests/integration` | Parcours complets sur un vrai Postgres jetable : publication, reprise, chiffrement, suppression Meta, missions, coffre, étoiles, rangs et bilan des Réussites |
| CI | `.github/workflows/ci.yml` | Tout ce qui précède, plus migrations sur base neuve et build |

Un bug corrigé = un test qui l'aurait détecté.
