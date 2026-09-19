import "dotenv/config";
import cron from "node-cron";
// Import relatif (et non l'alias "@/...") car ce script est exécuté
// directement par tsx, hors du bundler Next.js qui résout les alias.
import { runDuePosts } from "../src/lib/publish";

// Worker autonome : à lancer avec `npm run worker` sur un serveur/VM/process
// long-lived (Railway, Fly.io, VPS...). Alternative à /api/cron pour les
// hébergements qui ne supportent pas les cron jobs serverless.
console.log("[nebula-worker] démarré — vérification des posts programmés chaque minute.");

cron.schedule("* * * * *", async () => {
  try {
    const results = await runDuePosts();
    if (results.length) {
      console.log(`[nebula-worker] ${results.length} post(s) traité(s)`, results);
    }
  } catch (err) {
    console.error("[nebula-worker] erreur", err);
  }
});
