// Aides communes aux routes de l'API publique v1 (lot 4).
import type { NextResponse } from "next/server";
import { accessibleBrands, canWrite, type BrandAccess } from "./access";
import { apiError, type ApiContext } from "./auth";

/** Marque demandée, si la clé y a accès (et le droit d'écrire si besoin). */
export async function brandFor(ctx: ApiContext, brandId: string | null | undefined, needWrite = false): Promise<BrandAccess | NextResponse> {
  if (!brandId) return apiError(400, "missing_brand", "Paramètre brandId obligatoire (voir GET /api/v1/brands).");
  if (ctx.brandId && ctx.brandId !== brandId) return apiError(403, "brand_forbidden", "Cette clé est limitée à une autre marque.");
  const [brand] = await accessibleBrands(ctx.userId, brandId);
  if (!brand) return apiError(404, "brand_not_found", "Marque introuvable ou inaccessible.");
  if (needWrite && !canWrite(brand.role)) return apiError(403, "read_only_member", "Votre rôle sur cette marque ne permet pas de publier.");
  return brand;
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof Response;
