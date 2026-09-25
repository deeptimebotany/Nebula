// Webhooks Nebula (lot 4, palier Agence, 25/09/2026). À chaque événement
// (publication programmée, en ligne, en échec, réponse d'un client,
// connexion expirée…), Nebula envoie un POST JSON signé aux adresses
// enregistrées dans /automatisations — ce qui permet de brancher n8n, Make,
// Zapier ou n'importe quel outil sans intégration dédiée.
//
// Signature : en-tête Nebula-Signature « t=<horodatage>,v1=<hmac> », où
// hmac = HMAC-SHA256(secret, `${t}.${corps}`) en hexadécimal (même principe
// que Stripe). Premier envoi immédiat (5 s max), puis jusqu'à 5 relances
// par le cron (1 min, 5 min, 30 min, 2 h, 12 h). Une adresse est désactivée
// après 15 échecs d'affilée, et son propriétaire prévenu.
import { createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { webhookDeliveryDb, webhookEndpointDb, type WebhookDeliveryRow, type WebhookEndpointRow } from "@/lib/prisma-extra";
import { fetchPublic } from "@/lib/net-safety";
import { hasApiAccess } from "@/lib/api/access";
import { notify } from "@/lib/notifications";

export const WEBHOOK_EVENTS = [
  { id: "post.created", label: "Publication créée", description: "Un brouillon ou une publication programmée vient d'être créé (Publier ou API)." },
  { id: "post.scheduled", label: "Publication programmée", description: "Une publication est programmée à une date donnée." },
  { id: "post.published", label: "Publication en ligne", description: "La publication est en ligne sur tous ses réseaux." },
  { id: "post.failed", label: "Échec de publication", description: "La publication a échoué sur au moins un réseau (partiel ou total)." },
  { id: "approval.responded", label: "Réponse d'un client", description: "Un client a validé une publication ou demandé des modifications." },
  { id: "connection.expired", label: "Compte à reconnecter", description: "La connexion à un réseau a expiré." }
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]["id"] | "ping";
export const WEBHOOK_EVENT_IDS: string[] = WEBHOOK_EVENTS.map((e) => e.id);

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const DISABLE_AFTER_FAILURES = 15;
const INLINE_TIMEOUT_MS = 5_000;
const RETRY_TIMEOUT_MS = 10_000;

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

const appUrl = () => (process.env.NEXTAUTH_URL || "https://nebulahub.space").replace(/\/$/, "");

// --- Contenu des événements ----------------------------------------------------

/** Données d'une publication, telles qu'envoyées dans les événements post.* et par l'API. */
export async function postPayload(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      brandId: true,
      title: true,
      caption: true,
      status: true,
      scheduledAt: true,
      createdAt: true,
      updatedAt: true,
      targets: { select: { network: true, status: true, externalUrl: true, errorMessage: true, publishedAt: true, connection: { select: { id: true, displayName: true, handle: true } } } }
    }
  });
  if (!post) return null;
  type Target = { network: string; status: string; externalUrl: string | null; errorMessage: string | null; publishedAt: Date | null; connection: { id: string; displayName: string; handle: string | null } };
  return {
    id: post.id,
    brandId: post.brandId,
    title: post.title,
    caption: post.caption,
    status: post.status,
    scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    url: `${appUrl()}/posts/${post.id}`,
    targets: (post.targets as Target[]).map((t) => ({
      network: t.network,
      status: t.status,
      account: { id: t.connection.id, name: t.connection.displayName, handle: t.connection.handle },
      postUrl: t.externalUrl,
      error: t.errorMessage,
      publishedAt: t.publishedAt ? t.publishedAt.toISOString() : null
    }))
  };
}

// --- Envoi ---------------------------------------------------------------------

async function attempt(endpoint: WebhookEndpointRow, delivery: WebhookDeliveryRow, timeoutMs: number): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  let responseStatus: number | null = null;
  let error: string | null = null;
  try {
    // fetchPublic : IP vérifiée au moment de la connexion (lib/net-safety.ts),
    // pas de redirection suivie.
    const res = await fetchPublic(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Nebula-Webhooks/1.0",
        "Nebula-Event": delivery.event,
        "Nebula-Delivery": delivery.id,
        "Nebula-Signature": `t=${timestamp},v1=${signWebhook(endpoint.secret, timestamp, delivery.payload)}`
      },
      body: delivery.payload,
      followRedirects: false,
      timeoutMs
    });
    responseStatus = res.status;
    if (!res.ok) error = `Réponse ${res.status}`;
    await res.body?.cancel().catch(() => undefined);
  } catch (err) {
    const e = err as Error;
    error = e.name === "TimeoutError" || e.name === "AbortError" ? "Délai dépassé (pas de réponse)" : e.message.slice(0, 300);
  }

  const attempts = delivery.attempts + 1;
  const ok = error === null;
  const exhausted = !ok && attempts >= MAX_ATTEMPTS;
  await webhookDeliveryDb.update({
    where: { id: delivery.id },
    data: {
      attempts,
      responseStatus,
      error,
      status: ok ? "SUCCESS" : exhausted ? "FAILED" : "PENDING",
      nextAttemptAt: ok || exhausted ? null : new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]),
      deliveredAt: ok ? new Date() : null
    }
  });

  if (ok) {
    await webhookEndpointDb.update({ where: { id: endpoint.id }, data: { failureCount: 0, lastDeliveryAt: new Date(), lastStatus: responseStatus } });
    return;
  }
  const failures = endpoint.failureCount + 1;
  const disable = failures >= DISABLE_AFTER_FAILURES && endpoint.active;
  await webhookEndpointDb.update({
    where: { id: endpoint.id },
    data: {
      failureCount: failures,
      lastDeliveryAt: new Date(),
      lastStatus: responseStatus,
      ...(disable ? { active: false, disabledReason: `Désactivé après ${failures} échecs d'affilée (${error}).` } : {})
    }
  });
  endpoint.failureCount = failures;
  if (disable) {
    endpoint.active = false;
    await notify(endpoint.userId, {
      kind: "reconnect",
      title: "Webhook désactivé",
      body: `L'adresse ${new URL(endpoint.url).host} ne répond plus (${failures} échecs d'affilée). Réactivez-la dans Automatisations une fois le problème réglé.`,
      href: "/automatisations",
      actionLabel: "Voir mes webhooks",
      dedupeKey: `webhook-disabled:${endpoint.id}`
    });
  }
}

function envelope(type: WebhookEventType, brand: { id: string; name: string } | null, data: unknown): string {
  return JSON.stringify({
    id: `evt_${randomBytes(12).toString("hex")}`,
    type,
    createdAt: new Date().toISOString(),
    brand,
    data
  });
}

/**
 * Déclenche un événement pour une marque : une livraison par adresse
 * abonnée (propriétaire membre de la marque et au palier Agence). Premier
 * envoi immédiat, en parallèle ; les échecs sont relancés par le cron.
 * Ne lève jamais : un webhook ne doit pas faire échouer l'action d'origine.
 */
export async function emitWebhookEvent(brandId: string, type: Exclude<WebhookEventType, "ping">, data: unknown): Promise<void> {
  try {
    const endpoints = await webhookEndpointDb.findMany({
      where: { active: true, events: { has: type }, OR: [{ brandId: null }, { brandId }] }
    });
    if (endpoints.length === 0) return;
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } });
    const members = new Set(
      ((await prisma.membership.findMany({ where: { brandId }, select: { userId: true } })) as { userId: string }[]).map((m) => m.userId)
    );
    const allowed = new Map<string, boolean>();
    const targets: WebhookEndpointRow[] = [];
    for (const e of endpoints) {
      if (!members.has(e.userId)) continue;
      if (!allowed.has(e.userId)) allowed.set(e.userId, await hasApiAccess(e.userId));
      if (allowed.get(e.userId)) targets.push(e);
    }
    const payload = envelope(type, brand, data);
    await Promise.allSettled(
      targets.map(async (endpoint) => {
        const delivery = await webhookDeliveryDb.create({ data: { endpointId: endpoint.id, event: type, payload } });
        await attempt(endpoint, delivery, INLINE_TIMEOUT_MS);
      })
    );
  } catch (err) {
    console.error("[webhooks] événement non envoyé :", (err as Error).message);
  }
}

/** Envoie un événement « ping » de test à une adresse (bouton « Tester »). */
export async function sendTestWebhook(endpoint: WebhookEndpointRow): Promise<WebhookDeliveryRow | null> {
  const payload = envelope("ping", null, { message: "Test depuis Nebula : si vous lisez ceci, votre webhook fonctionne.", endpointId: endpoint.id });
  const delivery = await webhookDeliveryDb.create({ data: { endpointId: endpoint.id, event: "ping", payload } });
  // Un test n'est jamais relancé : un seul essai, 10 s maximum.
  await attempt({ ...endpoint, active: true }, { ...delivery, attempts: MAX_ATTEMPTS - 1 }, RETRY_TIMEOUT_MS);
  return webhookDeliveryDb.findUnique({ where: { id: delivery.id } });
}

/** Cron : relances des envois en échec arrivées à échéance. */
export async function processWebhookRetries(): Promise<number> {
  const due = await webhookDeliveryDb.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: 25
  });
  let done = 0;
  for (const d of due) {
    // Verrou : on repousse l'échéance avant d'essayer, pour qu'un autre
    // passage du cron ne renvoie pas le même événement en parallèle.
    const claimed = await webhookDeliveryDb.updateMany({
      where: { id: d.id, status: "PENDING", nextAttemptAt: d.nextAttemptAt },
      data: { nextAttemptAt: new Date(Date.now() + 10 * 60_000) }
    });
    if (claimed.count === 0) continue;
    const endpoint = await webhookEndpointDb.findUnique({ where: { id: d.endpointId } });
    if (!endpoint || !endpoint.active) {
      await webhookDeliveryDb.update({ where: { id: d.id }, data: { status: "FAILED", nextAttemptAt: null, error: "Adresse désactivée ou supprimée." } });
      continue;
    }
    await attempt(endpoint, d, RETRY_TIMEOUT_MS);
    done++;
  }
  return done;
}

/** Cron : le journal des envois est gardé 30 jours. */
export async function purgeOldWebhookDeliveries(): Promise<number> {
  const res = await webhookDeliveryDb.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) }, status: { not: "PENDING" } } });
  return res.count;
}
