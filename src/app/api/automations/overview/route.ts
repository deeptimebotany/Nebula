import { NextResponse } from "next/server";
import { apiKeyDb, webhookDeliveryDb, webhookEndpointDb } from "@/lib/prisma-extra";
import { automationSession } from "@/lib/api/session";
import { accessibleBrands } from "@/lib/api/access";
import { webhookView } from "@/lib/api/webhook-endpoints";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

// GET /api/automations/overview — tout ce qu'affiche la page Automatisations.
export async function GET() {
  const s = await automationSession(false);
  if (!s.ok) return s.res;
  const [keys, endpoints, brands] = await Promise.all([
    apiKeyDb.findMany({ where: { userId: s.userId, revokedAt: null }, orderBy: { createdAt: "desc" } }),
    webhookEndpointDb.findMany({ where: { userId: s.userId }, orderBy: { createdAt: "desc" } }),
    accessibleBrands(s.userId)
  ]);
  const webhooks = [];
  for (const e of endpoints) {
    const deliveries = await webhookDeliveryDb.findMany({ where: { endpointId: e.id }, orderBy: { createdAt: "desc" }, take: 10 });
    webhooks.push({
      ...webhookView(e),
      deliveries: deliveries.map((d) => ({
        id: d.id,
        event: d.event,
        status: d.status,
        attempts: d.attempts,
        responseStatus: d.responseStatus,
        error: d.error,
        createdAt: new Date(d.createdAt).toISOString(),
        nextAttemptAt: d.nextAttemptAt ? new Date(d.nextAttemptAt).toISOString() : null
      }))
    });
  }
  return NextResponse.json({
    access: s.access,
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes.split(","),
      brandId: k.brandId,
      lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
      createdAt: new Date(k.createdAt).toISOString()
    })),
    webhooks,
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    events: WEBHOOK_EVENTS
  });
}
