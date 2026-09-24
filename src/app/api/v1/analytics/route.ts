import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiJson, authenticateApi } from "@/lib/api/auth";
import { brandFor, isResponse } from "@/lib/api/context";

export const dynamic = "force-dynamic";

// GET /api/v1/analytics?brandId= — derniers chiffres de chaque compte
// connecté (abonnés, portée, engagement), tels qu'affichés dans Analytics.
export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req, "read");
  if (!auth.ok) return auth.res;
  const brand = await brandFor(auth.ctx, req.nextUrl.searchParams.get("brandId"));
  if (isResponse(brand)) return brand;
  const connections = (await prisma.socialConnection.findMany({
    where: { brandId: brand.id, status: { not: "DISCONNECTED" } },
    select: { id: true, network: true, displayName: true, handle: true }
  })) as { id: string; network: string; displayName: string; handle: string | null }[];
  const data = [];
  for (const c of connections) {
    const snap = await prisma.analyticsSnapshot.findFirst({ where: { connectionId: c.id }, orderBy: { capturedAt: "desc" } }).catch(() => null);
    data.push({
      connection: { id: c.id, network: c.network, name: c.displayName, handle: c.handle },
      latest: snap
        ? {
            capturedAt: (snap as { capturedAt: Date }).capturedAt.toISOString(),
            followers: snap.followers,
            followersDelta: snap.followersDelta,
            engagementRate: snap.engagementRate,
            impressions: snap.impressions,
            reach: snap.reach,
            postsCount: snap.postsCount
          }
        : null
    });
  }
  return apiJson({ data });
}
