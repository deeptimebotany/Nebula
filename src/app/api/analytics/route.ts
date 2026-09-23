import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const connections = await prisma.socialConnection.findMany({
    where: { brandId, status: "CONNECTED" },
    include: {
      analytics: { orderBy: { capturedAt: "desc" }, take: 30 }
    }
  });

  return NextResponse.json({
    connections: connections.map((c: { id: string; network: string; displayName: string; handle: string | null; analytics: unknown[] }) => ({
      id: c.id,
      network: c.network,
      displayName: c.displayName,
      handle: c.handle,
      snapshots: c.analytics.slice().reverse()
    }))
  });
}
