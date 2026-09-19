import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/connections/[provider]?connectionId=xxx — déconnecte un compte
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "connectionId requis" }, { status: 400 });

  const connection = await prisma.socialConnection.findUnique({
    where: { id: connectionId },
    include: { brand: { include: { memberships: true } } }
  });
  const userId = (session.user as { id: string }).id;
  const isMember = connection?.brand.memberships.some((m: { userId: string }) => m.userId === userId);
  if (!connection || !isMember) {
    return NextResponse.json({ error: "Connexion introuvable" }, { status: 404 });
  }

  await prisma.socialConnection.update({ where: { id: connectionId }, data: { status: "DISCONNECTED" } });
  return NextResponse.json({ ok: true });
}
