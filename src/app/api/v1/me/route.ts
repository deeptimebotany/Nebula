import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiJson, authenticateApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

// GET /api/v1/me — le compte lié à la clé (utile pour tester une connexion
// depuis n8n, Make ou Zapier).
export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req, "read");
  if (!auth.ok) return auth.res;
  const user = await prisma.user.findUnique({ where: { id: auth.ctx.userId }, select: { id: true, name: true, email: true } });
  return apiJson({
    account: user,
    key: { id: auth.ctx.keyId, scopes: auth.ctx.scopes, brandId: auth.ctx.brandId }
  });
}
