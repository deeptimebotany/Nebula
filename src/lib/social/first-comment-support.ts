// Premier commentaire : où Nebula peut le publier (07/10/2026).
//
// Constat de Lucas : un premier commentaire saisi dans Publier n'apparaissait
// pas sous une vidéo YouTube. Le client YouTube n'avait pas de
// « postComment » et publish.ts ignorait le commentaire SANS RIEN DIRE ; même
// silence pour TikTok et Pinterest, et pour tout échec (permission, réseau).
//
// Ce que chaque réseau permet, avec les autorisations demandées par Nebula :
//  - Instagram : POST /{media}/comments (instagram_manage_comments).
//  - Facebook : POST /{publication}/comments, jeton de la Page
//    (pages_manage_engagement).
//  - Threads : réponse à la publication (threads_manage_replies).
//  - LinkedIn : POST /rest/socialActions/{urn}/comments (w_member_social).
//  - Bluesky : réponse app.bsky.feed.post.
//  - YouTube : commentThreads.insert, qui exige le droit youtube.force-ssl
//    (le même que pour répondre aux commentaires, YOUTUBE_COMMENT_REPLY) ;
//    impossible sur une vidéo privée ou « conçue pour les enfants ».
//    YouTube ne permet pas d'ÉPINGLER un commentaire par son API.
//  - TikTok, Pinterest : aucune API pour commenter.
//
// Module sans accès à la base : utilisé par la publication, la liste des
// comptes (Publier) et les tests.
import type { Network } from "@/lib/types";
import { YOUTUBE_REPLY_SCOPE, hasScope } from "./comment-reply-support";

/** Longueur maximale d'un commentaire, selon chaque réseau (caractères). */
export const FIRST_COMMENT_MAX_LENGTH: Partial<Record<Network, number>> = {
  INSTAGRAM: 2200,
  FACEBOOK: 8000,
  THREADS: 500,
  LINKEDIN: 1250,
  BLUESKY: 300,
  YOUTUBE: 10000
};

export type FirstCommentSupport =
  | { mode: "api"; maxLength: number }
  | {
      mode: "unsupported";
      /** Pourquoi, en une phrase (affichée dans Publier et sur la fiche). */
      reason: string;
      /** Une reconnexion du compte suffirait. */
      reconnect?: boolean;
    };

const NO_API: Partial<Record<Network, string>> = {
  TIKTOK: "TikTok ne permet pas aux applications de publier un commentaire : ajoutez-le depuis l'app TikTok.",
  PINTEREST: "Pinterest ne permet pas aux applications de commenter une épingle : ajoutez-le depuis Pinterest."
};

/**
 * Ce que Nebula peut faire pour le premier commentaire sur ce compte.
 * `youtube` : réglages de la vidéo (confidentialité, « pour les enfants »).
 * `youtubeCommentsEnabled` : YOUTUBE_COMMENT_REPLY est actif (une
 * reconnexion donnerait le droit à une chaîne connectée avant).
 */
export function firstCommentSupport(
  network: string,
  connection: { scopes?: string | null } | null,
  options: {
    youtubeCommentsEnabled?: boolean;
    youtube?: { privacyStatus?: string | null; madeForKids?: boolean | null } | null;
    /** Format choisi (Instagram, Facebook) : une story n'a pas de commentaires. */
    format?: string | null;
  } = {}
): FirstCommentSupport {
  const noApi = NO_API[network as Network];
  if (noApi) return { mode: "unsupported", reason: noApi };
  if (options.format === "STORY" && (network === "INSTAGRAM" || network === "FACEBOOK")) {
    return { mode: "unsupported", reason: "Une story n'a pas de commentaires publiés par une application." };
  }
  const max = FIRST_COMMENT_MAX_LENGTH[network as Network];
  if (!max) return { mode: "unsupported", reason: "Ce réseau ne permet pas de publier un commentaire depuis Nebula." };
  if (network === "YOUTUBE") {
    if (options.youtube?.madeForKids) return { mode: "unsupported", reason: "Vidéo « conçue pour les enfants » : YouTube y désactive les commentaires." };
    if (options.youtube?.privacyStatus === "private") return { mode: "unsupported", reason: "Vidéo privée : YouTube n'accepte pas de commentaire sur une vidéo privée." };
    if (!hasScope(connection?.scopes, YOUTUBE_REPLY_SCOPE)) {
      return options.youtubeCommentsEnabled
        ? { mode: "unsupported", reason: "Reconnectez cette chaîne YouTube (autorisation de gérer les commentaires) pour que Nebula publie le premier commentaire.", reconnect: true }
        : { mode: "unsupported", reason: "YouTube demande une autorisation de plus pour commenter depuis une application : elle n'est pas encore activée sur Nebula. Ajoutez le commentaire depuis YouTube." };
    }
  }
  return { mode: "api", maxLength: max };
}

/** Longueur comptée comme les réseaux (caractères, emoji compris pour un). */
export function firstCommentLength(text: string): number {
  return Array.from(text.trim()).length;
}
