import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { disconnectConnection } from "@/lib/social/revoke";

// DELETE /api/connections/[provider]?connectionId=xxx — déconnecte un compte
// (jetons effacés et, si possible, accès retiré chez le réseau).
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

  // Lot 2 : jetons effacés et accès retiré chez le réseau quand c'est
  // possible sans toucher aux autres comptes (voir social/revoke.ts).
  const { revoked } = await disconnectConnection(connectionId);
  return NextResponse.json({ ok: true, revoked });
}
