import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";

// Marque un commentaire comme lu (clic sur la boîte de réception
// /interactions) — pas de DELETE : on garde toujours l'historique, juste son
// statut lu/non-lu.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  await prisma.engagementItem.updateMany({
    where: { id: params.id, connection: { brand: ownedBy(userId) } },
    data: { read: true }
  });
  return NextResponse.json({ ok: true });
}
