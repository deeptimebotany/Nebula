import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import type { Network } from "@/lib/types";

// Boîte de réception des COMMENTAIRES (page /comments) : les commentaires
// déjà synchronisés (voir /api/engagement/sync) soit pour UN compte
// (?connectionId=…, depuis le menu déroulant d'un compte sur la page
// Comptes), soit pour TOUS les comptes d'une marque (?brandId=…, arrivée
// depuis le menu) — chaque commentaire porte l'identifiant de son compte
// pour que la page puisse filtrer et afficher le réseau d'origine.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!connectionId && !brandId) return NextResponse.json({ error: "connectionId ou brandId requis" }, { status: 400 });

  // Les comptes doivent appartenir à une des marques de l'utilisateur.
  const connections = await prisma.socialConnection.findMany({
    where: connectionId ? { id: connectionId, brand: ownedBy(userId) } : { brandId: brandId as string, brand: ownedBy(userId) },
    orderBy: { connectedAt: "asc" }
  });
  if (connectionId && connections.length === 0) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const items = await prisma.engagementItem.findMany({
    where: { connectionId: { in: connections.map((c) => c.id) } },
    orderBy: { publishedAt: "desc" },
    take: connectionId ? 100 : 300
  });

  return NextResponse.json({
    connections: connections.map((c) => ({
      id: c.id,
      network: c.network,
      displayName: c.displayName,
      handle: c.handle,
      lastSyncedAt: c.lastEngagementSyncedAt,
      supportsEngagement: Boolean(getSocialClient(c.network as Network).fetchEngagement)
    })),
    items
  });
}
