// Format d'une publication, réseau par réseau (09/10/2026, page Publications :
// tableau façon YouTube Studio, filtre « Shorts / Vidéos / Posts / Stories »).
//
// Le format n'est pas enregistré tel quel : il se déduit de ce que Nebula
// envoie (mêmes règles que la publication, src/lib/social/post-format.ts) :
//   - Instagram et Facebook : le format choisi dans Publier (Reel → Short,
//     Story → Story), sinon celui appliqué par défaut à l'envoi ;
//   - YouTube : Short si la vidéo est verticale ou carrée et dure 3 minutes
//     au plus (c'est YouTube qui décide), vidéo sinon ;
//   - TikTok : toute vidéo est une vidéo courte (Short) ;
//   - les autres réseaux : vidéo ou post (image, carrousel, texte).
// Module sans base de données : importable côté serveur et navigateur.
import { effectiveFormat, FORMAT_NETWORKS, youtubeKind, type MediaFacts } from "@/lib/social/post-format";
import type { Network } from "@/lib/types";

export const POST_KINDS = ["SHORT", "VIDEO", "POST", "STORY"] as const;
export type PostKind = (typeof POST_KINDS)[number];

/** Libellé court, dans le tableau. */
export const POST_KIND_LABEL: Record<PostKind, string> = { SHORT: "Short", VIDEO: "Vidéo", POST: "Post", STORY: "Story" };

/** Libellé du filtre. */
export const POST_KIND_FILTER_LABEL: Record<PostKind, string> = {
  SHORT: "Shorts et Reels",
  VIDEO: "Vidéos",
  POST: "Posts (images et textes)",
  STORY: "Stories"
};

export function isPostKind(value: unknown): value is PostKind {
  return typeof value === "string" && (POST_KINDS as readonly string[]).includes(value);
}

/** Format d'une cible (un réseau d'une publication). */
export function targetKind(network: string, metadata: unknown, media: MediaFacts): PostKind {
  const isVideo = media.type === "VIDEO";
  if (FORMAT_NETWORKS.has(network as Network)) {
    const chosen = (metadata as { format?: unknown } | null)?.format;
    const format = effectiveFormat(network as Network, typeof chosen === "string" ? chosen : null, media);
    if (format === "STORY") return "STORY";
    if (format === "REEL") return "SHORT";
    return isVideo ? "VIDEO" : "POST";
  }
  if (network === "YOUTUBE") return youtubeKind(media) === "SHORT" ? "SHORT" : "VIDEO";
  if (network === "TIKTOK") return isVideo ? "SHORT" : "POST";
  return isVideo ? "VIDEO" : "POST";
}

/**
 * Formats d'une publication. Sans réseau ciblé (brouillon) : d'après le
 * média seul — vidéo verticale ou carrée de 3 minutes au plus = Short.
 */
export function postKinds(targets: { network: string; metadata: unknown }[], media: MediaFacts): PostKind[] {
  if (targets.length === 0) return [media.type !== "VIDEO" ? "POST" : youtubeKind(media) === "SHORT" ? "SHORT" : "VIDEO"];
  const kinds = new Set(targets.map((t) => targetKind(t.network, t.metadata, media)));
  return POST_KINDS.filter((k) => kinds.has(k));
}
