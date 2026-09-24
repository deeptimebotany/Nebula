import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";

const AUTO_RENEW_NETWORKS = new Set(["YOUTUBE", "TIKTOK", "PINTEREST"]);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const connections = await prisma.socialConnection.findMany({
    where: { brandId, status: { not: "DISCONNECTED" } },
    select: {
      id: true,
      network: true,
      displayName: true,
      handle: true,
      avatarUrl: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
      lastError: true,
      tokenExpiresAt: true,
      refreshToken: true
    },
    orderBy: { connectedAt: "desc" }
  });

  // autoRenew : le jeton d'accès de ces réseaux ne dure que quelques heures
  // (YouTube 1 h, TikTok 24 h) ou semaines (Pinterest), mais Nebula le
  // renouvelle tout seul tant qu'il a un jeton de rafraîchissement : la page
  // Comptes ne doit donc pas afficher « expirée » d'après tokenExpiresAt.
  // Le jeton de rafraîchissement lui-même n'est jamais renvoyé au navigateur.
  return NextResponse.json({
    connections: connections.map(({ refreshToken, ...c }) => ({
      ...c,
      autoRenew: Boolean(refreshToken) && AUTO_RENEW_NETWORKS.has(c.network)
    }))
  });
}
