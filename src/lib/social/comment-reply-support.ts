// Répondre à un commentaire depuis Nebula (01/10/2026).
//
// Avant : « Répondre sur … » ouvrait seulement le réseau. Maintenant, la page
// Commentaires envoie la réponse sur le réseau, sous le nom du compte, quand
// le réseau le permet avec les autorisations déjà données à Nebula :
//  - Instagram : POST /{id-du-commentaire}/replies (instagram_manage_comments).
//    Seulement les commentaires principaux (une réponse à une réponse va
//    sous le commentaire principal) ; pas les commentaires masqués.
//  - Facebook : POST /{id-du-commentaire}/comments, jeton de la Page
//    (pages_manage_engagement).
//  - Threads : conteneur TEXT avec reply_to_id, puis threads_publish
//    (threads_manage_replies, 1 000 réponses par 24 h).
//  - Bluesky : enregistrement app.bsky.feed.post avec reply {root, parent}.
//  - YouTube : comments.insert (snippet.parentId) exige le droit
//    youtube.force-ssl, demandé seulement avec YOUTUBE_COMMENT_REPLY=true
//    (nouvelle vérification Google) ; sans lui, lien vers la vidéo.
//  - TikTok, LinkedIn, Pinterest : leurs commentaires ne sont pas lus par
//    Nebula (pas d'API ouverte), donc rien à répondre ici.
//
// Module sans accès à la base : utilisé par les routes, la page et les tests.
import type { Network } from "@/lib/types";

export const YOUTUBE_REPLY_SCOPE = "youtube.force-ssl";

/** Longueur maximale d'une réponse, selon chaque réseau. */
export const REPLY_MAX_LENGTH: Partial<Record<Network, number>> = {
  INSTAGRAM: 2200,
  FACEBOOK: 8000,
  THREADS: 500,
  BLUESKY: 300,
  YOUTUBE: 10000
};

export type CommentReplySupport =
  | { mode: "api"; maxLength: number }
  | {
      mode: "manual";
      /** Pourquoi répondre sur le réseau, en une phrase. */
      how: string;
      /** Une reconnexion du compte suffirait à répondre depuis Nebula. */
      reconnect?: boolean;
    };

export function hasScope(scopes: string | null | undefined, scope: string): boolean {
  return (scopes ?? "").split(/[\s,]+/).some((s) => s === scope || s.endsWith(`/${scope}`));
}

/** Longueur comptée comme les réseaux (caractères, emoji compris pour un). */
export function replyLength(text: string): number {
  return Array.from(text.trim()).length;
}

/**
 * Ce que Nebula peut faire pour répondre aux commentaires de ce compte.
 * `options.youtubeReplyEnabled` : YOUTUBE_COMMENT_REPLY est actif (une
 * reconnexion donnerait le droit à une chaîne connectée avant).
 */
export function commentReplySupport(
  network: string,
  connection: { scopes?: string | null; status?: string | null } | null,
  options: { youtubeReplyEnabled?: boolean } = {}
): CommentReplySupport {
  const max = REPLY_MAX_LENGTH[network as Network];
  if (network === "YOUTUBE" && !hasScope(connection?.scopes, YOUTUBE_REPLY_SCOPE)) {
    return options.youtubeReplyEnabled
      ? { mode: "manual", how: "Reconnectez cette chaîne YouTube pour répondre depuis Nebula. En attendant, répondez sur YouTube.", reconnect: true }
      : { mode: "manual", how: "YouTube demande une autorisation de plus pour répondre depuis une application : répondez sur YouTube." };
  }
  if (!max) return { mode: "manual", how: "Ce réseau ne permet pas de répondre depuis Nebula : répondez directement sur le réseau." };
  if (!connection || connection.status === "DISCONNECTED") {
    return { mode: "manual", how: "Ce compte est déconnecté de Nebula : reconnectez-le, ou répondez directement sur le réseau.", reconnect: true };
  }
  if (connection.status === "EXPIRED") {
    return { mode: "manual", how: "La connexion de ce compte a expiré : reconnectez-le pour répondre depuis Nebula.", reconnect: true };
  }
  return { mode: "api", maxLength: max };
}
