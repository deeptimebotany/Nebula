import { NextRequest } from "next/server";
import { apiError, apiJson, authenticateApi } from "@/lib/api/auth";
import { brandFor, isResponse } from "@/lib/api/context";
import { buildAdsSummary } from "@/lib/ads/summary";

export const dynamic = "force-dynamic";

// GET /api/v1/ads?brandId=&days=7|30|90&currency= — dépenses et résultats
// publicitaires (Google Ads, Meta Ads, TikTok Ads) des comptes suivis.
export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req, "read");
  if (!auth.ok) return auth.res;
  const q = req.nextUrl.searchParams;
  const brand = await brandFor(auth.ctx, q.get("brandId"));
  if (isResponse(brand)) return brand;
  const days = q.get("days") ? Number(q.get("days")) : 30;
  if (![7, 30, 90].includes(days)) return apiError(400, "invalid_days", "days doit valoir 7, 30 ou 90.");
  const summary = await buildAdsSummary(brand.id, days, q.get("currency"));
  // Pas besoin des régies non configurées côté API.
  const { platforms: _platforms, ...data } = summary;
  void _platforms;
  return apiJson({ data });
}
