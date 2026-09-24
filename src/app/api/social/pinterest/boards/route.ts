import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBrandMembership } from "@/lib/brand-access";
import { listPinterestBoards } from "@/lib/social/pinterest";

export const dynamic = "force-dynamic";

// GET /api/social/pinterest/boards?connectionId=… — tableaux d'un compte
// Pinterest connecté, pour le sélecteur « Tableau » de Publier.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "connectionId requis" }, { status: 400 });
  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.network !== "PINTEREST") return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  const denied = await requireBrandMembership(userId, connection.brandId);
  if (denied) return denied;

  try {
    const boards = await listPinterestBoards(connection);
    return NextResponse.json({ boards });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message.replace(/^\[PINTEREST\]\s*/, ""), boards: [] }, { status: 502 });
  }
}
