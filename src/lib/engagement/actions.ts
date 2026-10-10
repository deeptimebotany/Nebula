// J'aime et suppression d'un commentaire reçu, depuis Nebula (10/10/2026) —
// voir social/comment-actions-support.ts pour ce que chaque réseau permet.
//
// Mêmes règles que la réponse (engagement/reply.ts) :
//  - seulement un commentaire d'une marque dont la personne est
//    propriétaire ou éditrice ;
//  - jamais depuis une marque ou un compte en veille, ni pendant une
//    suspension du réseau par Nebula ;
//  - au plus 120 actions par heure et par personne (les réseaux sanctionnent
//    les rafales) ;
//  - suppression : définitive sur le réseau ; un commentaire déjà absent
//    (supprimé ailleurs) est simplement retiré de Nebula.
import { prisma } from "@/lib/prisma";
import { getSocialClient, SocialApiError } from "@/lib/social";
import { classifyProviderError } from "@/lib/social/errors";
import { flagConnectionForReconnect } from "@/lib/social/connection-health";
import { publishPause } from "@/lib/social/network-control";
import { commentActionSupport } from "@/lib/social/comment-actions-support";
import { assertBrandWritable, assertConnectionsWritable } from "@/lib/billing/trial-expiry";
import { consumeRateLimit } from "@/lib/rate-limit";
import { networkLabel } from "@/lib/notifications";
import type { Network } from "@/lib/types";

export const COMMENT_ACTION_RATE_LIMIT = { limit: 120, windowMinutes: 60 };

export type CommentActionOutcome =
  | { ok: true; likedAt?: string | null; deleted?: boolean }
  | { ok: false; status: number; error: string; reconnect?: boolean; manualUrl?: string | null };

type Kind = "like" | "delete";

/** Message affiché quand le réseau refuse le j'aime ou la suppression. */
export function actionFailureMessage(err: unknown, network: string, kind: Kind): { error: string; reconnect: boolean } {
  const label = networkLabel(network);
  const raw = (err as Error)?.message?.replace(/^\[[A-Z_]+\]\s*/, "") || "erreur inconnue";
  const { category, needsReconnect } = classifyProviderError(err);
  const what = kind === "like" ? "le j'aime" : "la suppression";
  switch (category) {
    case "TIMEOUT":
    case "UNEXPECTED_RESPONSE":
      return { reconnect: false, error: `${label} n'a pas confirmé ${what} : vérifiez sur ${label}, puis actualisez.` };
    case "AUTH_EXPIRED":
      return { reconnect: true, error: `La connexion à ${label} a expiré : reconnectez le compte dans Comptes, puis réessayez.` };
    case "PERMISSION_MISSING":
      return { reconnect: true, error: `${label} refuse ${what} avec les autorisations actuelles (${raw}) : reconnectez le compte en acceptant toutes les autorisations.` };
    case "RATE_LIMITED":
    case "QUOTA_EXHAUSTED":
      return { reconnect: false, error: `${label} limite les actions pour le moment : réessayez plus tard.` };
    case "TRANSIENT":
      return { reconnect: false, error: `Incident passager chez ${label} : réessayez dans quelques minutes.` };
    default:
      return { reconnect: needsReconnect, error: `${label} a refusé ${what} : ${raw}` };
  }
}

async function loadForAction(userId: string, itemId: string, kind: Kind) {
  const item = await prisma.engagementItem.findFirst({
    where: { id: itemId, connection: { brand: { memberships: { some: { userId } } } } },
    include: { connection: true }
  });
  if (!item) return { error: { ok: false as const, status: 404, error: "Commentaire introuvable." } };
  const connection = item.connection;
  const label = networkLabel(connection.network);
  const manualUrl = item.permalink ?? item.postPermalink ?? null;
  const membership = await prisma.membership.findUnique({ where: { userId_brandId: { userId, brandId: connection.brandId } }, select: { role: true } });
  if (!membership || membership.role === "VIEWER") {
    return { error: { ok: false as const, status: 403, error: "Votre rôle sur cette marque permet de lire les commentaires, pas d'agir dessus." } };
  }
  const support = commentActionSupport(connection.network, connection, membership.role);
  if (kind === "like" && !support.like) return { error: { ok: false as const, status: 400, error: support.likeHow ?? `${label} ne permet pas ce j'aime depuis Nebula.`, manualUrl } };
  if (kind === "delete" && !support.remove) return { error: { ok: false as const, status: 400, error: `${label} ne permet pas de supprimer ce commentaire depuis Nebula : faites-le sur ${label}.`, manualUrl } };

  const brand = await assertBrandWritable(connection.brandId);
  if (!brand.ok) return { error: { ok: false as const, status: 402, error: brand.message } };
  const conn = await assertConnectionsWritable([connection.id]);
  if (!conn.ok) return { error: { ok: false as const, status: 402, error: conn.message } };
  const pause = await publishPause(connection.network as Network);
  if (pause.paused) return { error: { ok: false as const, status: 503, error: `Actions vers ${label} suspendues quelques minutes : réessayez plus tard.` } };
  const limited = await consumeRateLimit("comment-action", userId, COMMENT_ACTION_RATE_LIMIT.limit, COMMENT_ACTION_RATE_LIMIT.windowMinutes);
  if (!limited.ok) return { error: { ok: false as const, status: 429, error: "Beaucoup d'actions en peu de temps : patientez quelques minutes (les réseaux sanctionnent les rafales)." } };
  return { item, connection, label, manualUrl };
}

/** Met (ou retire) le j'aime du compte sur un commentaire reçu. */
export async function likeEngagementItem(userId: string, itemId: string, like: boolean): Promise<CommentActionOutcome> {
  const loaded = await loadForAction(userId, itemId, "like");
  if ("error" in loaded) return loaded.error as CommentActionOutcome;
  const { item, connection, manualUrl } = loaded;
  // Déjà dans l'état demandé : rien à envoyer.
  if (Boolean(item.ownerLikedAt) === like) return { ok: true, likedAt: item.ownerLikedAt?.toISOString() ?? null };
  const client = getSocialClient(connection.network as Network);
  if (!client.likeComment) return { ok: false, status: 400, error: `${loaded.label} ne permet pas ce j'aime depuis Nebula.`, manualUrl };
  try {
    const res = await client.likeComment(connection, { externalId: item.externalId, likeId: item.ownerLikeId }, like);
    const likedAt = like ? new Date() : null;
    await prisma.engagementItem.update({ where: { id: item.id }, data: { ownerLikedAt: likedAt, ownerLikeId: like ? (res.likeId ?? null) : null, read: true } });
    return { ok: true, likedAt: likedAt?.toISOString() ?? null };
  } catch (err) {
    console.error(`[j'aime ${connection.network}] commentaire ${item.id} :`, (err as Error).message);
    const failure = actionFailureMessage(err, connection.network, "like");
    if (classifyProviderError(err).needsReconnect) await flagConnectionForReconnect(connection, (err as Error).message).catch(() => undefined);
    return { ok: false, status: 502, ...failure, manualUrl };
  }
}

/** Supprime un commentaire reçu, sur le réseau puis dans Nebula. */
export async function deleteEngagementItem(userId: string, itemId: string): Promise<CommentActionOutcome> {
  const loaded = await loadForAction(userId, itemId, "delete");
  if ("error" in loaded) return loaded.error as CommentActionOutcome;
  const { item, connection, manualUrl } = loaded;
  const client = getSocialClient(connection.network as Network);
  if (!client.deleteComment) return { ok: false, status: 400, error: `${loaded.label} ne permet pas de supprimer ce commentaire depuis Nebula.`, manualUrl };
  try {
    await client.deleteComment(connection, { externalId: item.externalId });
  } catch (err) {
    // Déjà supprimé sur le réseau : on le retire simplement de Nebula.
    const gone = err instanceof SocialApiError && (err.status === 404 || err.code === "100/33");
    if (!gone) {
      console.error(`[suppression ${connection.network}] commentaire ${item.id} :`, (err as Error).message);
      const failure = actionFailureMessage(err, connection.network, "delete");
      if (classifyProviderError(err).needsReconnect) await flagConnectionForReconnect(connection, (err as Error).message).catch(() => undefined);
      return { ok: false, status: 502, ...failure, manualUrl };
    }
  }
  await prisma.engagementItem.delete({ where: { id: item.id } }).catch(() => undefined);
  return { ok: true, deleted: true };
}
