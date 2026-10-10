import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mergeGuides, type CommunityGuide } from "@/lib/community/guides";

// Guides de la Communauté : ceux de l'équipe Nebula sont dans le code
// (src/lib/community/guides.ts, 10/10/2026), plus d'éventuels guides
// ajoutés en base. Simple lecture, aucune écriture utilisateur.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const fromDb: CommunityGuide[] = await prisma.guide.findMany({ orderBy: { order: "asc" } }).catch(() => []);
  return NextResponse.json({ guides: mergeGuides(fromDb) });
}
