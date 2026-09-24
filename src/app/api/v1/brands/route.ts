import { NextRequest } from "next/server";
import { apiJson, authenticateApi } from "@/lib/api/auth";
import { accessibleBrands } from "@/lib/api/access";

export const dynamic = "force-dynamic";

// GET /api/v1/brands — marques accessibles avec cette clé.
export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req, "read");
  if (!auth.ok) return auth.res;
  const brands = await accessibleBrands(auth.ctx.userId, auth.ctx.brandId);
  return apiJson({ data: brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug, role: b.role })) });
}
