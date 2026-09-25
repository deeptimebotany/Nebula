import "dotenv/config";
import cron from "node-cron";
// Import relatif (et non l'alias "@/...") car ce script est exécuté
// directement par tsx, hors du bundler Next.js qui résout les alias.
import { advanceProcessingTargets, recoverInterruptedPublications, runDuePosts } from "../src/lib/publish";
import { upgradeFacebookPageTokens } from "../src/lib/social/meta";
import { runDueReports } from "../src/lib/reports";
import { checkReferralCrownStreak } from "../src/lib/referral-crown-streak";
import { runGrowthMaintenance } from "../src/lib/growth-jobs";
import { runAccountJobs } from "../src/lib/account-jobs";
import { backfillSecrets } from "../src/lib/prisma";

// Worker autonome : à lancer avec `npm run worker` sur un serveur/VM/process
// long-lived (Railway, Fly.io, VPS...). Alternative à /api/cron pour les
// hébergements qui ne supportent pas les cron jobs serverless.
console.log("[nebula-worker] démarré — vérification des posts programmés et des rapports clients chaque minute.");

cron.schedule("* * * * *", async () => {
  try {
    const results = await runDuePosts();
    if (results.length) {
      console.log(`[nebula-worker] ${results.length} post(s) traité(s)`, results);
    }
  } catch (err) {
    console.error("[nebula-worker] erreur (posts)", err);
  }

  // Lot 2 : vidéos en traitement chez un réseau, publications interrompues,
  // jetons de Page Facebook (voir src/lib/publish.ts et social/meta.ts).
  try {
    await advanceProcessingTargets();
    await recoverInterruptedPublications();
    await upgradeFacebookPageTokens();
  } catch (err) {
    console.error("[nebula-worker] erreur (suivi des publications)", err);
  }

  try {
    const reports = await runDueReports();
    if (reports.sent || reports.failed) {
      console.log(`[nebula-worker] rapports : ${reports.sent} envoyé(s), ${reports.failed} échoué(s)`);
    }
  } catch (err) {
    console.error("[nebula-worker] erreur (rapports)", err);
  }

  try {
    await checkReferralCrownStreak();
  } catch (err) {
    console.error("[nebula-worker] erreur (streak couronne parrainage)", err);
  }

  try {
    const growth = await runGrowthMaintenance();
    if (growth && (growth.lifecycle?.sent || growth.trialsApplied || growth.legacyTrials)) {
      console.log("[nebula-worker] growth", growth);
    }
  } catch (err) {
    console.error("[nebula-worker] erreur (growth)", err);
  }

  // Chiffrement en tâche de fond des jetons encore en clair (voir
  // src/lib/db/secret-fields.ts) — sans effet sans TOKEN_ENCRYPTION_KEY.
  try {
    const secrets = await backfillSecrets();
    if (secrets.sealed || secrets.failed) console.log("[nebula-worker] jetons chiffrés", secrets);
  } catch (err) {
    console.error("[nebula-worker] erreur (chiffrement des jetons)", err);
  }

  // Parrainage, rappels et purge des notifications (src/lib/account-jobs.ts).
  const account = await runAccountJobs();
  if (account.rewards && (account.rewards.granted || account.rewards.capped || account.rewards.canceled)) {
    console.log("[nebula-worker] parrainage", account.rewards);
  }
});
