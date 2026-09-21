import { NextRequest, NextResponse } from "next/server";
import { runDuePosts } from "@/lib/publish";
import { runDueReports } from "@/lib/reports";

// Endpoint appelé par un scheduler externe (Vercel Cron, cron-job.org, un
// vrai cron système...) toutes les minutes, pour publier les posts
// programmés arrivés à échéance ET envoyer les rapports clients automatiques
// arrivés à échéance (voir BrandReport/runDueReports dans src/lib/reports.ts
// — produit n°6 de la feuille de route). Protégé par CRON_SECRET : configurez
// votre scheduler pour envoyer l'en-tête `Authorization: Bearer <CRON_SECRET>`.
// Alternative sans hébergement serverless : `npm run worker` (scripts/worker.ts)
// fait la même chose en continu via node-cron.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const [results, reports] = await Promise.all([runDuePosts(), runDueReports()]);
  return NextResponse.json({ ranAt: new Date().toISOString(), results, reports });
}
