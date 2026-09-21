import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Marque un commentaire comme lu (clic sur la boîte de réception
// /interactions) — pas de DELETE : on garde toujours l'historique, juste son
// statut lu/non-lu.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  await prisma.engagementItem.update({ where: { id: params.id }, data: { read: true } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
