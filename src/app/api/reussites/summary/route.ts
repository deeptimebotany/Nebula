import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildSummary } from "@/lib/reussites/view";

export const dynamic = "force-dynamic";

// GET /api/reussites/summary — carte « Niveau de créateur » du tableau de
// bord et mini-jauge du menu.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const summary = await buildSummary((session.user as { id: string }).id);
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
