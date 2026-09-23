import { NextRequest, NextResponse } from "next/server";
import { runDuePosts } from "@/lib/publish";
import { runDueReports } from "@/lib/reports";
import { checkReferralCrownStreak } from "@/lib/referral-crown-streak";
import { purgeExpiredRateLimits } from "@/lib/rate-limit";

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
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret) {
    console.error("[cron] CRON_SECRET manquant : /api/cron désactivé tant qu'il n'est pas configuré.");
    return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const [results, reports] = await Promise.all([
    runDuePosts(),
    runDueReports(),
    checkReferralCrownStreak(),
    // Ménage des compteurs anti-abus périmés (voir lib/rate-limit.ts) — ne
    // doit jamais faire échouer le reste du cron.
    purgeExpiredRateLimits().catch(() => 0)
  ]);
  return NextResponse.json({ ranAt: new Date().toISOString(), results, reports });
}
