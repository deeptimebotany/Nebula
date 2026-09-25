import path from "path";
import { defineConfig } from "vitest/config";

// Tests d'intégration (npm run test:integration) : sur une vraie base
// Postgres jetable (CI), jamais sur la production. Les fichiers partagent la
// base : exécution l'un après l'autre.
//
// Sécurité : le client Prisma est forcé sur INTEGRATION_DATABASE_URL, pour
// qu'un DATABASE_URL de production présent dans .env ne soit jamais vidé.
const integrationUrl = process.env.INTEGRATION_DATABASE_URL;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: integrationUrl ? { NODE_ENV: "test", DATABASE_URL: integrationUrl } : { NODE_ENV: "test" }
  }
});
