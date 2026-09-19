import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

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
      lastError: true
    },
    orderBy: { connectedAt: "desc" }
  });

  return NextResponse.json({ connections });
}
