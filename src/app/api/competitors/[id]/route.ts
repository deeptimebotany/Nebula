import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";

// DELETE /api/competitors/[id] — retire un concurrent suivi.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // deleteMany + clause d'appartenance : un identifiant d'une autre marque ne
  // supprime rien (count 0) au lieu de supprimer le concurrent d'un tiers.
  const userId = (session.user as { id: string }).id;
  const { count } = await prisma.competitorTrack.deleteMany({ where: { id: params.id, brand: ownedBy(userId) } });
  if (count === 0) return NextResponse.json({ error: "Concurrent introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
