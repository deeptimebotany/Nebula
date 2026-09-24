import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildPage } from "@/lib/reussites/view";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/reussites — page Réussites : évalue les réussites du compte
// (déblocages éventuels), puis renvoie niveau, défis et accomplissements.
// Marque aussi les nouveautés comme vues (compteur du menu).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const page = await buildPage((session.user as { id: string }).id);
  if (!page) return NextResponse.json({ error: "Réussites indisponibles pour le moment." }, { status: 503 });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}
