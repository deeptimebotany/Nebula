// Compte à reconnecter (lot 5, résilience des API).
//
// Quand un réseau répond que la connexion a expiré ou a été retirée
// (catégorie AUTH_EXPIRED, voir errors.ts) — pendant une publication comme
// pendant la synchro des statistiques — le compte passe au statut EXPIRED :
// il apparaît « à reconnecter » partout (Vue d'ensemble, Comptes, en-tête),
// sa synchro est mise en pause, et ses éditeurs reçoivent UNE alerte
// (remise en haut si le problème persiste). Reconnecter le compte le remet
// à CONNECTED (voir lib/connections.ts).
import { prisma } from "@/lib/prisma";
import { brandEditorIds, networkLabel, notifyMany } from "@/lib/notifications";
import { emitWebhookEvent } from "@/lib/webhooks";
import { SocialApiError } from "./base";
import { classifyProviderError } from "./errors";
import { pauseMessage, recordProviderFailure, recordProviderSuccess, syncPause } from "./network-control";
import type { Network } from "@/lib/types";

interface ConnectionRef {
  id: string;
  brandId: string;
  network: string;
  displayName?: string | null;
  handle?: string | null;
  status?: string | null;
}

export async function flagConnectionForReconnect(connection: ConnectionRef, reason: string): Promise<void> {
  try {
    const { count } = await prisma.socialConnection.updateMany({
      where: { id: connection.id, status: { in: ["CONNECTED", "ERROR"] } },
      data: { status: "EXPIRED", lastError: reason.slice(0, 500) }
    });
    // Déjà signalé (EXPIRED) ou déconnecté volontairement : pas de nouvelle alerte.
    if (count === 0) return;
    const label = networkLabel(connection.network);
    await notifyMany(await brandEditorIds(connection.brandId), {
      kind: "reconnect",
      title: `${label} à reconnecter`,
      body: `La connexion à ${label}${connection.displayName ? ` (${connection.displayName})` : ""} a expiré : les statistiques et les publications sur ce compte sont en pause.`,
      href: "/accounts",
      actionLabel: `Reconnecter ${label}`,
      dedupeKey: `reconnect:${connection.id}`
    });
    await emitWebhookEvent(connection.brandId, "connection.expired", {
      connection: { id: connection.id, network: connection.network, name: connection.displayName ?? null, handle: connection.handle ?? null },
      reason
    });
  } catch (err) {
    console.error("[connexions] signalement « à reconnecter » impossible :", (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Synchronisations (statistiques, commentaires, métriques des posts) : mêmes
// règles que la publication — erreur classée, compte signalé s'il faut le
// reconnecter, disjoncteur alimenté, réseau suspendu respecté.
// ---------------------------------------------------------------------------

/** Message si la synchro de ce réseau est suspendue, sinon null. */
export async function syncBlockedReason(network: string): Promise<string | null> {
  const pause = await syncPause(network as Network);
  if (!pause.paused) return null;
  return pause.reason === "breaker"
    ? pauseMessage(network as Network, pause).replace("envoi suspendu", "synchronisation suspendue")
    : `Synchronisation ${networkLabel(network)} suspendue temporairement par Nebula.${pause.message ? ` ${pause.message}` : ""}`;
}

export async function onSyncError(connection: ConnectionRef, err: unknown): Promise<string> {
  const message = (err as Error).message ?? String(err);
  const classified = classifyProviderError(err);
  if (err instanceof SocialApiError) await recordProviderFailure(connection.network as Network, classified, message);
  if (classified.needsReconnect) await flagConnectionForReconnect(connection, message);
  return message;
}

export async function onSyncSuccess(connection: ConnectionRef): Promise<void> {
  await recordProviderSuccess(connection.network as Network);
  if (connection.status === "EXPIRED") {
    await prisma.socialConnection
      .updateMany({ where: { id: connection.id, status: "EXPIRED" }, data: { status: "CONNECTED", lastError: null } })
      .catch(() => undefined);
  }
}
