import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { studioGeneration } from "@/lib/studio/generate";

// GET /api/studio/generations/<id>?brandId=… — une génération de
// l'historique (page Studio IA, et « Utiliser dans Publier »). Revoir un
// résultat ne coûte aucune génération.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;
  const generation = await studioGeneration(brandId, params.id);
  if (!generation) return NextResponse.json({ error: "Résultat introuvable (l'historique garde les 50 derniers)." }, { status: 404 });
  return NextResponse.json({ generation });
}
