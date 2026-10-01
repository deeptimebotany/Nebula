// « Supprimer aussi sur … » (01/10/2026) : ce que chaque réseau permet.
//
// Supprimer une publication dans Nebula ne la retirait que de Nebula ; elle
// restait en ligne sur les réseaux. La fiche d'une publication propose
// maintenant, pour chaque réseau où elle est en ligne, une case « Supprimer
// aussi sur … » quand le réseau donne ce droit à Nebula, et sinon la marche
// à suivre avec le lien de la publication.
//
// Droits vérifiés dans la documentation de chaque réseau :
//  - Facebook : DELETE /{id}, permission pages_manage_posts (déjà demandée).
//  - Instagram : DELETE /{id-du-média}, permission instagram_manage_contents
//    (connexion Facebook). Pas encore demandée par défaut : elle s'active
//    avec META_INSTAGRAM_DELETE (voir meta.ts) puis une reconnexion.
//  - Threads : DELETE /{id}, permission threads_delete (100 par 24 h).
//  - LinkedIn : DELETE /rest/posts/{urn}, w_member_social (déjà demandée).
//  - Pinterest : DELETE /v5/pins/{id}, pins:write (déjà demandée).
//  - Bluesky : com.atproto.repo.deleteRecord (session du compte).
//  - YouTube : videos.delete exige le droit complet « youtube », que Nebula
//    ne demande pas (nouvelle vérification Google) → YouTube Studio.
//  - TikTok : aucune suppression par l'API de publication → application.
//
// Module sans accès à la base : utilisé par la route (calcul envoyé à la
// fiche) et par les tests.
import type { Network } from "@/lib/types";

export const INSTAGRAM_DELETE_SCOPE = "instagram_manage_contents";
export const THREADS_DELETE_SCOPE = "threads_delete";

/** Clé de PostTarget.metadata : date de suppression sur le réseau depuis Nebula. */
export const REMOVED_FROM_NETWORK_KEY = "removedFromNetworkAt";

export type RemoteDeleteSupport =
  | { mode: "api" }
  | {
      mode: "manual";
      /** Marche à suivre, en une phrase. */
      how: string;
      /** Lien pour le faire à la main (publication, ou YouTube Studio). */
      manageUrl: string | null;
      /** Une reconnexion du compte suffirait à le faire depuis Nebula. */
      reconnect?: boolean;
    };

export interface RemoteDeleteTarget {
  network: string;
  status: string;
  externalPostId?: string | null;
  externalUrl?: string | null;
  metadata?: unknown;
}

function hasScope(scopes: string | null | undefined, scope: string): boolean {
  return (scopes ?? "").split(/[\s,]+/).includes(scope);
}

/** Date de suppression sur le réseau faite depuis Nebula, ou null. */
export function removedFromNetworkAt(metadata: unknown): string | null {
  const value = (metadata as Record<string, unknown> | null | undefined)?.[REMOVED_FROM_NETWORK_KEY];
  return typeof value === "string" && value ? value : null;
}

/** En ligne sur le réseau, d'après Nebula : seule une telle cible peut y être supprimée. */
export function isOnlineTarget(target: RemoteDeleteTarget): boolean {
  return target.status === "PUBLISHED" && Boolean(target.externalPostId) && !removedFromNetworkAt(target.metadata);
}

/**
 * Ce que Nebula peut faire pour retirer cette publication du réseau.
 * `options.instagramDeleteEnabled` : META_INSTAGRAM_DELETE est actif (une
 * reconnexion donnerait le droit à un compte connecté avant).
 */
export function remoteDeleteSupport(
  target: RemoteDeleteTarget,
  connection: { scopes?: string | null; status?: string | null } | null,
  options: { instagramDeleteEnabled?: boolean } = {}
): RemoteDeleteSupport {
  const network = target.network as Network;
  const link = target.externalUrl ?? null;
  const disconnected = !connection || connection.status === "DISCONNECTED";
  const manual = (how: string, extra: { manageUrl?: string | null; reconnect?: boolean } = {}): RemoteDeleteSupport => ({
    mode: "manual",
    how,
    manageUrl: extra.manageUrl === undefined ? link : extra.manageUrl,
    ...(extra.reconnect ? { reconnect: true } : {})
  });

  switch (network) {
    case "YOUTUBE":
      return manual("YouTube ne permet pas à Nebula de supprimer une vidéo : supprimez-la dans YouTube Studio.", {
        manageUrl: target.externalPostId ? `https://studio.youtube.com/video/${encodeURIComponent(target.externalPostId)}/edit` : link
      });
    case "TIKTOK":
      return manual("TikTok ne permet pas aux applications de supprimer une vidéo : supprimez-la depuis l'application TikTok (… sur la vidéo, puis Supprimer).");
    case "INSTAGRAM":
      if (!hasScope(connection?.scopes, INSTAGRAM_DELETE_SCOPE)) {
        return manual(
          options.instagramDeleteEnabled
            ? "Reconnectez ce compte Instagram pour pouvoir supprimer depuis Nebula. En attendant : depuis l'application Instagram (… sur la publication, puis Supprimer)."
            : "Supprimez-la depuis l'application Instagram (… sur la publication, puis Supprimer).",
          { reconnect: Boolean(options.instagramDeleteEnabled) }
        );
      }
      break;
    case "THREADS":
      if (!hasScope(connection?.scopes, THREADS_DELETE_SCOPE)) {
        return manual("Reconnectez ce compte Threads pour pouvoir supprimer depuis Nebula. En attendant : depuis l'application Threads.", { reconnect: true });
      }
      break;
    case "FACEBOOK":
    case "LINKEDIN":
    case "PINTEREST":
    case "BLUESKY":
      break;
    default:
      return manual("Supprimez-la directement sur le réseau.");
  }
  if (disconnected) {
    return manual("Ce compte est déconnecté de Nebula : reconnectez-le, ou supprimez la publication directement sur le réseau.", { reconnect: true });
  }
  return { mode: "api" };
}
