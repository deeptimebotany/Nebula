import { NextRequest } from "next/server";
import { webhookEndpointDb } from "@/lib/prisma-extra";
import { apiError, apiJson, authenticateApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

// DELETE /api/v1/webhooks/{id} — se désabonner.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticateApi(req, "write");
  if (!auth.ok) return auth.res;
  const res = await webhookEndpointDb.deleteMany({ where: { id: params.id, userId: auth.ctx.userId } });
  if (res.count === 0) return apiError(404, "webhook_not_found", "Webhook introuvable.");
  return apiJson({ deleted: true, id: params.id });
}
