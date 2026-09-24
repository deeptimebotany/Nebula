import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { postMetricsFor } from "@/lib/posts/post-metrics";

export const dynamic = "force-dynamic";

// GET /api/posts/:id/metrics — statistiques de la publication par réseau
// (calendrier : clic sur une publication passée ; fiche de la publication).
// Les chiffres viennent du dernier relevé de la page Engagements ; pour les
// rafraîchir : POST /api/engagements/sync { brandId }.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const data = await postMetricsFor(params.id, (session.user as { id: string }).id);
  if (!data) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
