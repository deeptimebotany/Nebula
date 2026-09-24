// Création / suppression d'adresses de webhooks, partagées par la page
// Automatisations (session) et l'API v1 (clé) — lot 4.
import { webhookEndpointDb, type WebhookEndpointRow } from "@/lib/prisma-extra";
import { checkUrlShape, UnsafeUrlError } from "@/lib/net-safety";
import { WEBHOOK_EVENT_IDS } from "@/lib/webhooks";
import { generateWebhookSecret } from "./keys";

export const MAX_WEBHOOKS_PER_ACCOUNT = 20;

export class WebhookInputError extends Error {}

export async function createWebhookEndpoint(userId: string, input: { url: string; events: string[]; brandId?: string | null; description?: string | null }): Promise<WebhookEndpointRow> {
  try {
    checkUrlShape(input.url);
  } catch (err) {
    throw new WebhookInputError((err as UnsafeUrlError).message);
  }
  const events = Array.from(new Set(input.events)).filter((e) => WEBHOOK_EVENT_IDS.includes(e));
  if (events.length === 0) throw new WebhookInputError(`Choisissez au moins un événement : ${WEBHOOK_EVENT_IDS.join(", ")}.`);
  const count = await webhookEndpointDb.count({ where: { userId } });
  if (count >= MAX_WEBHOOKS_PER_ACCOUNT) throw new WebhookInputError(`${MAX_WEBHOOKS_PER_ACCOUNT} webhooks au maximum par compte.`);
  return webhookEndpointDb.create({
    data: {
      userId,
      url: input.url.trim(),
      events,
      brandId: input.brandId || null,
      description: input.description?.trim().slice(0, 120) || null,
      secret: generateWebhookSecret()
    }
  });
}

/** Vue publique d'une adresse (le secret n'est renvoyé qu'à la création ou sur demande explicite). */
export function webhookView(e: WebhookEndpointRow, withSecret = false) {
  return {
    id: e.id,
    url: e.url,
    description: e.description,
    events: e.events,
    brandId: e.brandId,
    active: e.active,
    failureCount: e.failureCount,
    lastDeliveryAt: e.lastDeliveryAt ? new Date(e.lastDeliveryAt).toISOString() : null,
    lastStatus: e.lastStatus,
    disabledReason: e.disabledReason,
    createdAt: new Date(e.createdAt).toISOString(),
    ...(withSecret ? { secret: e.secret } : {})
  };
}
