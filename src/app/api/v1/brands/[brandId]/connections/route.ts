import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiJson, authenticateApi } from "@/lib/api/auth";
import { brandFor, isResponse } from "@/lib/api/context";

export const dynamic = "force-dynamic";

// GET /api/v1/brands/{brandId}/connections — comptes connectés de la marque
// (identifiants à utiliser dans connectionIds lors d'une création).
export async function GET(req: NextRequest, { params }: { params: { brandId: string } }) {
  const auth = await authenticateApi(req, "read");
  if (!auth.ok) return auth.res;
  const brand = await brandFor(auth.ctx, params.brandId);
  if (isResponse(brand)) return brand;
  const rows = await prisma.socialConnection.findMany({
    where: { brandId: brand.id, status: { not: "DISCONNECTED" } },
    select: { id: true, network: true, displayName: true, handle: true, status: true, tokenExpiresAt: true },
    orderBy: { connectedAt: "asc" }
  });
  return apiJson({
    data: (rows as { id: string; network: string; displayName: string; handle: string | null; status: string; tokenExpiresAt: Date | null }[]).map((c) => ({
      id: c.id,
      network: c.network,
      name: c.displayName,
      handle: c.handle,
      status: c.status,
      expiresAt: c.tokenExpiresAt ? c.tokenExpiresAt.toISOString() : null
    }))
  });
}
