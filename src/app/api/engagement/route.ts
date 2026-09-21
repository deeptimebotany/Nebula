import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import type { Network } from "@/lib/types";

// Liste les commentaires déjà synchronisés (voir /api/engagement/sync) pour
// UN compte connecté précis — alimente /interactions, ouverte depuis le menu
// déroulant d'un compte sur la page Comptes (accounts/page.tsx).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "connectionId requis" }, { status: 400 });

  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const items = await prisma.engagementItem.findMany({
    where: { connectionId },
    orderBy: { publishedAt: "desc" },
    take: 100
  });

  const supportsEngagement = Boolean(getSocialClient(connection.network as Network).fetchEngagement);

  return NextResponse.json({
    connection: {
      id: connection.id,
      network: connection.network,
      displayName: connection.displayName,
      handle: connection.handle,
      lastSyncedAt: connection.lastEngagementSyncedAt
    },
    supportsEngagement,
    items
  });
}
