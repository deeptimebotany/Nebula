# Captures d'écran du site

L'accueil et les pages « Découvrir » montrent de **vraies captures** de l'application : elles sont prises sur un compte de démonstration aux données fictives (« Studio Nova », une chaîne de café). Ce compte n'existe que sur une base locale, jamais en production.

Les images sont dans `public/screens/`, en WebP, en deux tailles (1x et 2x) et en deux modes (clair et sombre). Le site affiche automatiquement celles du mode choisi.

## Refaire les captures après un changement de l'application

Il faut Node.js, une base PostgreSQL locale, et Playwright :

```
npm i -D playwright --ignore-scripts
npx playwright install chromium
```

### 1. Préparer la base de démo

Créez une base PostgreSQL locale dont le nom contient `demo` (par exemple `nebula_demo`). Appliquez les migrations, puis remplissez-la :

```
DATABASE_URL="postgresql://postgres@localhost:5432/nebula_demo" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres@localhost:5432/nebula_demo" npx tsx scripts/demo/seed-demo.ts
```

`seed-demo.ts` **efface toute la base** avant de la remplir. Il refuse de tourner si la base n'est pas locale ou si son nom ne contient pas `demo`.

### 2. Préparer les illustrations

Ce sont des dessins fictifs, sans photo réelle. Les sources SVG sont dans `scripts/demo/media/`.

```
node scripts/demo/capture-screens.mjs media
```

La commande crée `public/demo-media/`, qui n'est pas versionné. Il faut la lancer **avant** le build.

### 3. Lancer l'application sur la base de démo

```
DATABASE_URL="postgresql://postgres@localhost:5432/nebula_demo" npm run build
DATABASE_URL="postgresql://postgres@localhost:5432/nebula_demo" npm start
```

### 4. Prendre les captures

Dans un autre terminal :

```
BASE_URL="http://localhost:3000" node scripts/demo/capture-screens.mjs shots
```

La liste des écrans est en haut de `capture-screens.mjs`. Ajoutez-y un écran si l'accueil doit en montrer un nouveau. Le composant `ProductShot` (`src/components/marketing/product-shot.tsx`) affiche une capture par son nom.

- **Compte de démo :** `demo@nebulahub.space`, mot de passe `Demo-Nebula-2026!`. Ce compte n'existe que sur la base locale.
- **Pendant les captures :** le bouton flottant de l'assistant est masqué, et les notifications sont marquées comme lues.
