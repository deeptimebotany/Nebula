import { NextRequest } from "next/server";
import { z } from "zod";
import { webhookEndpointDb } from "@/lib/prisma-extra";
import { apiError, apiJson, authenticateApi } from "@/lib/api/auth";
import { brandFor, isResponse } from "@/lib/api/context";
import { createWebhookEndpoint, webhookView, WebhookInputError } from "@/lib/api/webhook-endpoints";

export const dynamic = "force-dynamic";

// GET /api/v1/webhooks — adresses de webhooks du compte.
export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req, "read");
  if (!auth.ok) return auth.res;
  const rows = await webhookEndpointDb.findMany({
    where: { userId: auth.ctx.userId, ...(auth.ctx.brandId ? { brandId: auth.ctx.brandId } : {}) },
    orderBy: { createdAt: "desc" }
  });
  return apiJson({ data: rows.map((r) => webhookView(r)) });
}

const bodySchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.string()).min(1).max(20),
  brandId: z.string().min(1).optional(),
  description: z.string().max(120).optional()
});

// POST /api/v1/webhooks — s'abonner à des événements (utilisé par Zapier,
// Make ou n8n pour les déclencheurs « REST hooks »). Le secret de
// signature n'est renvoyé qu'ici.
export async function POST(req: NextRequest) {
  const auth = await authenticateApi(req, "write");
  if (!auth.ok) return auth.res;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_body", "Attendu : { url, events[], brandId?, description? }.");
  const brandId = parsed.data.brandId ?? auth.ctx.brandId ?? null;
  if (brandId) {
    const brand = await brandFor(auth.ctx, brandId);
    if (isResponse(brand)) return brand;
  }
  try {
    const endpoint = await createWebhookEndpoint(auth.ctx.userId, { ...parsed.data, brandId });
    return apiJson({ data: webhookView(endpoint, true) }, 201);
  } catch (err) {
    if (err instanceof WebhookInputError) return apiError(400, "invalid_webhook", err.message);
    throw err;
  }
}
