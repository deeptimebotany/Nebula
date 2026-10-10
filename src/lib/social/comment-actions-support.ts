// J'aime et suppression d'un commentaire reçu, depuis Nebula (10/10/2026,
// demande de Lucas : « voir les commentaires comme dans la Communauté, avec
// les j'aime, répondre, et pouvoir supprimer un commentaire qui n'est pas
// pertinent »). Ce que chaque réseau ouvre aux applications, avec les
// autorisations déjà données à Nebula (aucune nouvelle validation) :
//  - J'aime : Facebook (en tant que Page, POST /{commentaire}/likes,
//    pages_manage_engagement) et Bluesky (enregistrement app.bsky.feed.like).
//    Instagram, Threads et YouTube ne le permettent pas.
//  - Supprimer : Instagram (DELETE /{commentaire}, instagram_manage_comments)
//    et Facebook (DELETE /{commentaire}, pages_manage_engagement), sur les
//    publications du compte. Threads et Bluesky ne laissent pas supprimer le
//    message de quelqu'un d'autre ; YouTube demanderait une autorisation de
//    plus (nouvelle vérification Google).
// Module sans accès à la base : utilisé par les routes, la page et les tests.
import type { Network } from "@/lib/types";

export const COMMENT_LIKE_NETWORKS: readonly Network[] = ["FACEBOOK", "BLUESKY"];
export const COMMENT_DELETE_NETWORKS: readonly Network[] = ["INSTAGRAM", "FACEBOOK"];

export interface CommentActionSupport {
  /** Mettre ou retirer le j'aime du compte. */
  like: boolean;
  /** Supprimer le commentaire sur le réseau. */
  remove: boolean;
  /** Pourquoi le j'aime n'est pas possible (infobulle), sinon null. */
  likeHow: string | null;
}

const LABEL: Partial<Record<Network, string>> = { INSTAGRAM: "Instagram", THREADS: "Threads", YOUTUBE: "YouTube", FACEBOOK: "Facebook", BLUESKY: "Bluesky" };

export function commentActionSupport(
  network: string,
  connection: { status?: string | null } | null,
  role: string | null | undefined
): CommentActionSupport {
  const usable = Boolean(connection) && connection?.status !== "DISCONNECTED" && connection?.status !== "EXPIRED" && role !== "VIEWER";
  const likeNetwork = COMMENT_LIKE_NETWORKS.includes(network as Network);
  const label = LABEL[network as Network] ?? "Ce réseau";
  return {
    like: usable && likeNetwork,
    remove: usable && COMMENT_DELETE_NETWORKS.includes(network as Network),
    likeHow: likeNetwork
      ? usable
        ? null
        : role === "VIEWER"
          ? "Votre rôle sur cette marque permet de lire les commentaires, pas d'agir dessus."
          : "Reconnectez ce compte pour mettre un j'aime depuis Nebula."
      : `${label} ne permet pas aux applications de mettre un j'aime à un commentaire : faites-le sur ${label}.`
  };
}
