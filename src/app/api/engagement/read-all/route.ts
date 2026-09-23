import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";

// "Tout marquer comme lu" pour un compte — bouton en haut de /interactions.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { connectionId } = await req.json();
  if (!connectionId) return NextResponse.json({ error: "connectionId requis" }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  await prisma.engagementItem.updateMany({
    where: { connectionId, read: false, connection: { brand: ownedBy(userId) } },
    data: { read: true }
  });
  return NextResponse.json({ ok: true });
}
