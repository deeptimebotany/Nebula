import { NextRequest, NextResponse } from "next/server";
import { advanceProcessingTargets, recoverInterruptedPublications, runDuePosts } from "@/lib/publish";
import { upgradeFacebookPageTokens } from "@/lib/social/meta";
import { runDueReports } from "@/lib/reports";
import { checkReferralCrownStreak } from "@/lib/referral-crown-streak";
import { purgeExpiredRateLimits } from "@/lib/rate-limit";
import { runGrowthMaintenance } from "@/lib/growth-jobs";
import { runAccountJobs } from "@/lib/account-jobs";
import { backfillSecrets } from "@/lib/prisma";
import { isPlaceholderSecret, safeEqual } from "@/lib/secrets";

// Le cron publie, termine les vidéos en traitement, envoie les rapports… :
// jusqu'à 60 s (limite du plan Vercel Hobby). Chaque tâche s'arrête avant.
export const maxDuration = 60;

// Endpoint appelé par un scheduler externe (Vercel Cron, cron-job.org, un
// vrai cron système...) toutes les minutes, pour publier les posts
// programmés arrivés à échéance ET envoyer les rapports clients automatiques
// arrivés à échéance (voir BrandReport/runDueReports dans src/lib/reports.ts
// — produit n°6 de la feuille de route). Protégé par CRON_SECRET : configurez
// votre scheduler pour envoyer l'en-tête `Authorization: Bearer <CRON_SECRET>`.
// Alternative sans hébergement serverless : `npm run worker` (scripts/worker.ts)
// fait la même chose en continu via node-cron.
export async function GET(req: NextRequest) {
  // Secret OBLIGATOIRE : sans CRON_SECRET configuré, l'endpoint refuse tout
  // (l'ancienne version laissait passer n'importe qui dans ce cas, ce qui
  // permettait de déclencher publications et envois d'emails à volonté).
  // Une valeur restée à l'exemple de .env.example compte comme absente.
  // Comparaison en temps constant (lib/secrets.ts).
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || isPlaceholderSecret(secret)) {
    console.error("[cron] CRON_SECRET manquant : /api/cron désactivé tant qu'il n'est pas configuré.");
    return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  }
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const [results, reports, , , growth, account, secrets, processing, recovered, pageTokens] = await Promise.all([
    runDuePosts(),
    runDueReports(),
    checkReferralCrownStreak(),
    // Ménage des compteurs anti-abus périmés (voir lib/rate-limit.ts) — ne
    // doit jamais faire échouer le reste du cron.
    purgeExpiredRateLimits().catch(() => 0),
    // Brief growth : essais (attribution + expiration), emails de cycle de
    // vie (au plus une fois par heure), purges — voir src/lib/growth-jobs.ts.
    runGrowthMaintenance().catch((err) => {
      console.error("[cron] growth :", (err as Error).message);
      return null;
    }),
    // Parrainage (récompenses à 30 jours, plafond), rappels et purge des
    // notifications — voir src/lib/account-jobs.ts.
    runAccountJobs(),
    // Chiffrement en tâche de fond des jetons encore en clair (audit
    // sécurité, lot 1 — voir lib/db/secret-fields.ts). Sans effet tant que
    // TOKEN_ENCRYPTION_KEY n'est pas configurée.
    backfillSecrets().catch((err) => {
      console.error("[cron] chiffrement des jetons :", (err as Error).message);
      return null;
    }),
    // Lot 2 (fiabilité) : publications « en traitement » chez un réseau,
    // publications interrompues, jetons de Page Facebook.
    advanceProcessingTargets().catch((err) => {
      console.error("[cron] publications en traitement :", (err as Error).message);
      return null;
    }),
    recoverInterruptedPublications().catch((err) => {
      console.error("[cron] publications interrompues :", (err as Error).message);
      return null;
    }),
    upgradeFacebookPageTokens().catch((err) => {
      console.error("[cron] jetons de Page Facebook :", (err as Error).message);
      return null;
    })
  ]);
  return NextResponse.json({ ranAt: new Date().toISOString(), results, reports, growth, account, secrets, processing, recovered, pageTokens });
}
