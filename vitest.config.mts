import path from "path";
import { defineConfig } from "vitest/config";

// Tests automatiques (npm test) : protections de sécurité (tests/security),
// fiabilité de la publication (tests/reliability), règles métier
// (tests/quality). Les tests d'intégration, qui ont besoin d'une base
// Postgres, se lancent à part : npm run test:integration.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Composants .tsx testés hors de Next (lot 10) : JSX moderne, sans `import React`.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"]
  }
});
