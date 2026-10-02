import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { getToolContext } from "@/lib/tools/app-context";

// Outils dans l'application (02/10/2026) : préremplissage des outils avec
// les données déjà relevées pour la marque (src/lib/tools/app-context.ts).
// Lecture seule, membres de la marque uniquement (lecteurs compris).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  return NextResponse.json(await getToolContext(brandId), { headers: { "Cache-Control": "private, no-store" } });
}
