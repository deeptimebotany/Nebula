// Répondre à un commentaire depuis Nebula (01/10/2026) — voir
// social/comment-reply-support.ts pour ce que chaque réseau permet.
//
// Règles :
//  - seulement un commentaire d'une marque dont la personne est
//    propriétaire ou éditrice (un « lecteur » ne parle pas au nom du compte) ;
//  - jamais depuis une marque ou un compte en veille, ni pendant une
//    suspension du réseau par Nebula ;
//  - au plus 60 réponses par heure et par personne (anti-spam : les réseaux
//    sanctionnent les rafales de réponses) ;
//  - un envoi resté sans réponse du réseau n'est JAMAIS renvoyé tout seul :
//    la personne vérifie sur le réseau avant de renvoyer (pas de doublon) ;
//  - réponse envoyée : commentaire marqué lu et « Vous avez répondu »
//    (ownerRepliedAt), Réussites à jour.
import { prisma } from "@/lib/prisma";
import { getSocialClient, SocialApiError } from "@/lib/social";
import { classifyProviderError } from "@/lib/social/errors";
import { flagConnectionForReconnect } from "@/lib/social/connection-health";
import { publishPause } from "@/lib/social/network-control";
import { youtubeCommentReplyEnabled } from "@/lib/social/youtube";
import { commentReplySupport, replyLength } from "@/lib/social/comment-reply-support";
import { assertBrandWritable, assertConnectionsWritable } from "@/lib/billing/trial-expiry";
import { consumeRateLimit } from "@/lib/rate-limit";
import { refreshReussites } from "@/lib/reussites/engine";
import { networkLabel } from "@/lib/notifications";
import type { Network } from "@/lib/types";

export const REPLY_RATE_LIMIT = { limit: 60, windowMinutes: 60 };

export type ReplyOutcome =
  | { ok: true; repliedAt: string; externalId: string | null }
  | { ok: false; status: number; error: string; reason?: string; uncertain?: boolean; reconnect?: boolean; manualUrl?: string | null };

/** Message affiché sous le champ de réponse quand le réseau refuse. */
export function replyFailureMessage(err: unknown, network: string): { error: string; uncertain: boolean; reconnect: boolean } {
  const label = networkLabel(network);
  const raw = (err as Error)?.message?.replace(/^\[[A-Z_]+\]\s*/, "") || "erreur inconnue";
  const { category, needsReconnect } = classifyProviderError(err);
  const notFound = err instanceof SocialApiError && (err.status === 404 || err.code === "100/33");
  const base = { uncertain: false, reconnect: needsReconnect };
  if (notFound) return { ...base, error: `Ce commentaire n'existe plus sur ${label} (supprimé ou masqué) : impossible d'y répondre.` };
  switch (category) {
    case "TIMEOUT":
    case "UNEXPECTED_RESPONSE":
      return { ...base, uncertain: true, error: `${label} n'a pas confirmé l'envoi : vérifiez sur ${label} si votre réponse est en ligne avant de la renvoyer.` };
    case "AUTH_EXPIRED":
      return { ...base, error: `La connexion à ${label} a expiré : reconnectez le compte dans Comptes, puis renvoyez votre réponse.` };
    case "PERMISSION_MISSING":
      return {
        ...base,
        reconnect: true,
        error: `${label} refuse cette réponse avec les autorisations actuelles (${raw}) : reconnectez le compte en acceptant toutes les autorisations, ou répondez directement sur ${label}.`
      };
    case "RATE_LIMITED":
    case "QUOTA_EXHAUSTED":
      return { ...base, error: `${label} limite le nombre de réponses pour le moment : réessayez plus tard.` };
    case "TRANSIENT":
      return { ...base, error: `Incident passager chez ${label} : réessayez dans quelques minutes.` };
    default:
      return { ...base, error: `${label} a refusé la réponse : ${raw}` };
  }
}

export async function replyToEngagementItem(userId: string, itemId: string, rawText: string): Promise<ReplyOutcome> {
  const item = await prisma.engagementItem.findFirst({
    where: { id: itemId, connection: { brand: { memberships: { some: { userId } } } } },
    include: { connection: true }
  });
  if (!item) return { ok: false, status: 404, error: "Commentaire introuvable." };
  const connection = item.connection;
  const label = networkLabel(connection.network);
  const manualUrl = item.permalink ?? item.postPermalink ?? null;

  const membership = await prisma.membership.findUnique({ where: { userId_brandId: { userId, brandId: connection.brandId } }, select: { role: true } });
  if (!membership || membership.role === "VIEWER") {
    return { ok: false, status: 403, error: "Votre rôle sur cette marque permet de lire les commentaires, pas d'y répondre.", reason: "viewer" };
  }

  const support = commentReplySupport(connection.network, connection, { youtubeReplyEnabled: youtubeCommentReplyEnabled() });
  if (support.mode !== "api") return { ok: false, status: 400, error: support.how, reconnect: support.reconnect, manualUrl, reason: "unsupported" };

  const text = rawText.trim();
  if (!text) return { ok: false, status: 400, error: "Écrivez votre réponse avant de l'envoyer." };
  if (replyLength(text) > support.maxLength) {
    return { ok: false, status: 400, error: `Réponse trop longue pour ${label} : ${support.maxLength} caractères au plus.` };
  }

  const brand = await assertBrandWritable(connection.brandId);
  if (!brand.ok) return { ok: false, status: 402, error: brand.message, reason: brand.reason };
  const conn = await assertConnectionsWritable([connection.id]);
  if (!conn.ok) return { ok: false, status: 402, error: conn.message, reason: conn.reason };

  const pause = await publishPause(connection.network as Network);
  if (pause.paused) {
    return {
      ok: false,
      status: 503,
      error:
        pause.reason === "breaker"
          ? `${label} rencontre un incident : envois suspendus quelques minutes. Réessayez plus tard.`
          : `Envois vers ${label} suspendus temporairement par Nebula. Réessayez plus tard.${pause.message ? ` ${pause.message}` : ""}`
    };
  }

  const limited = await consumeRateLimit("comment-reply", userId, REPLY_RATE_LIMIT.limit, REPLY_RATE_LIMIT.windowMinutes);
  if (!limited.ok) {
    return { ok: false, status: 429, error: "Beaucoup de réponses envoyées en peu de temps : patientez quelques minutes (les réseaux sanctionnent les rafales)." };
  }

  const client = getSocialClient(connection.network as Network);
  if (!client.replyToComment) return { ok: false, status: 400, error: `${label} ne permet pas de répondre depuis Nebula.`, manualUrl };

  let externalId: string | null = null;
  try {
    externalId = (await client.replyToComment(connection, { externalId: item.externalId, postExternalId: item.postExternalId }, text)).externalId ?? null;
  } catch (err) {
    console.error(`[réponse ${connection.network}] commentaire ${item.id} :`, (err as Error).message);
    const failure = replyFailureMessage(err, connection.network);
    if (classifyProviderError(err).needsReconnect) {
      await flagConnectionForReconnect(connection, (err as Error).message).catch(() => undefined);
    }
    return { ok: false, status: 502, ...failure, manualUrl };
  }

  const repliedAt = item.ownerRepliedAt ?? new Date();
  await prisma.engagementItem.update({ where: { id: item.id }, data: { read: true, ownerRepliedAt: repliedAt } });
  await refreshReussites(userId).catch((err) => console.error("[réponse] Réussites :", (err as Error).message));
  return { ok: true, repliedAt: repliedAt.toISOString(), externalId };
}
