// Publications réellement en ligne d'un compte, telles que les Réussites les
// comptent (serveur uniquement). Partagé par le moteur (engine.ts), les
// missions de la semaine (weekly.ts) et les étoiles (skill-metrics.ts).
import { prisma } from "@/lib/prisma";

const PUBLISHED = "PUBLISHED";
const HOUR = 3_600_000;

export interface PublishedTarget {
  network: string;
  connectionId: string;
  at: Date;
}

export interface PublishedPost {
  id: string;
  /** Première mise en ligne (tous réseaux confondus). */
  firstAt: Date;
  networks: Set<string>;
  type: "VIDEO" | "IMAGE" | "TEXT";
  hasFirstComment: boolean;
  /** Médias de la publication (pour « redonner vie à un ancien contenu »). */
  mediaIds: string[];
  /** Au moins un média importé (Canva, Drive, Dropbox, OneDrive, Unsplash, API). */
  imported: boolean;
  /** Programmée au moins 1 h avant sa mise en ligne (lot B). */
  scheduledAhead: boolean;
  /** Premier média vertical (plus haut que large), dimensions connues (lot B). */
  vertical: boolean;
  /** Miniature choisie dans Nebula appliquée sur YouTube (lot B). */
  youtubeThumbnail: boolean;
  /** Chaque mise en ligne : réseau, compte et heure (créneaux, lot B). */
  targets: PublishedTarget[];
}

interface Row {
  postId: string;
  network: string;
  connectionId: string;
  publishedAt: Date | null;
  thumbnailStatus: string | null;
  post: {
    createdAt: Date;
    scheduledAt: Date | null;
    firstComment: string | null;
    media: { mediaAssetId: string; mediaAsset: { type: string; importSource: string | null; width: number | null; height: number | null } }[];
  };
}

/** Publications de ce compte réellement en ligne (au moins un réseau), éventuellement depuis une date. */
export async function publishedPosts(userId: string, since?: Date): Promise<PublishedPost[]> {
  const targets = (await prisma.postTarget.findMany({
    where: { status: PUBLISHED, post: { createdById: userId }, ...(since ? { publishedAt: { gte: since } } : {}) },
    select: {
      postId: true,
      network: true,
      connectionId: true,
      publishedAt: true,
      thumbnailStatus: true,
      post: {
        select: {
          createdAt: true,
          scheduledAt: true,
          firstComment: true,
          media: { select: { mediaAssetId: true, mediaAsset: { select: { type: true, importSource: true, width: true, height: true } } }, orderBy: { order: "asc" } }
        }
      }
    }
  })) as unknown as Row[];
  const byPost = new Map<string, PublishedPost>();
  for (const t of targets) {
    const at = t.publishedAt ?? t.post.createdAt;
    const target: PublishedTarget = { network: t.network, connectionId: t.connectionId, at };
    const thumb = t.network === "YOUTUBE" && t.thumbnailStatus === "APPLIED";
    const existing = byPost.get(t.postId);
    if (existing) {
      existing.networks.add(t.network);
      existing.targets.push(target);
      if (thumb) existing.youtubeThumbnail = true;
      if (at < existing.firstAt) existing.firstAt = at;
      continue;
    }
    const first = t.post.media[0]?.mediaAsset;
    const mediaType = first?.type;
    const scheduledAt = t.post.scheduledAt;
    byPost.set(t.postId, {
      id: t.postId,
      firstAt: at,
      networks: new Set([t.network]),
      type: mediaType === "VIDEO" ? "VIDEO" : mediaType === "IMAGE" ? "IMAGE" : "TEXT",
      hasFirstComment: Boolean(t.post.firstComment?.trim()),
      mediaIds: t.post.media.map((m) => m.mediaAssetId),
      imported: t.post.media.some((m) => Boolean(m.mediaAsset.importSource)),
      scheduledAhead: Boolean(scheduledAt && new Date(scheduledAt).getTime() - new Date(t.post.createdAt).getTime() >= HOUR),
      vertical: Boolean(first?.width && first?.height && first.height > first.width),
      youtubeThumbnail: thumb,
      targets: [target]
    });
  }
  return Array.from(byPost.values());
}
