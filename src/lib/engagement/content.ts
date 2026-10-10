// Contenu commenté (page Commentaires façon YouTube Studio, 10/10/2026) :
// titre et miniature de la publication sous laquelle est chaque
// commentaire, affichés à droite. Dans l'ordre :
//  1. ce que le réseau a donné à la synchro des commentaires (postTitle,
//     postThumbnailUrl de EngagementItem) ;
//  2. les statistiques des publications (PostMetric, onglet Engagement) ;
//  3. la publication faite avec Nebula (titre, sinon début de la légende,
//     et miniature de son premier média) ;
//  4. YouTube : la miniature publique de la vidéo.
import { prisma } from "@/lib/prisma";

export interface CommentedRow {
  connectionId: string;
  network: string;
  postExternalId: string | null;
  postTitle?: string | null;
  postThumbnailUrl?: string | null;
}

function firstLine(text: string | null | undefined, max = 100): string | null {
  const line = (text ?? "").split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export async function withCommentedContent<T extends CommentedRow>(items: T[]): Promise<(T & { postTitle: string | null; postThumbnailUrl: string | null })[]> {
  const missing = items.filter((i) => i.postExternalId && (!i.postTitle || !i.postThumbnailUrl));
  const connIds = Array.from(new Set(missing.map((i) => i.connectionId)));
  const postIds = Array.from(new Set(missing.map((i) => i.postExternalId as string)));
  const [metrics, targets] =
    missing.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.postMetric.findMany({
            where: { connectionId: { in: connIds }, postExternalId: { in: postIds } },
            select: { connectionId: true, postExternalId: true, title: true, thumbnailUrl: true }
          }),
          prisma.postTarget.findMany({
            where: { connectionId: { in: connIds }, externalPostId: { in: postIds } },
            select: {
              connectionId: true,
              externalPostId: true,
              post: { select: { title: true, caption: true, media: { orderBy: { order: "asc" }, take: 1, select: { mediaAsset: { select: { type: true, url: true, thumbnailUrl: true } } } } } }
            }
          })
        ]);
  const key = (connectionId: string, postId: string | null) => `${connectionId}|${postId}`;
  const metricBy = new Map((metrics as { connectionId: string; postExternalId: string; title: string | null; thumbnailUrl: string | null }[]).map((m) => [key(m.connectionId, m.postExternalId), m]));
  const targetBy = new Map(
    (targets as { connectionId: string; externalPostId: string | null; post: { title: string; caption: string; media: { mediaAsset: { type: string; url: string; thumbnailUrl: string | null } }[] } }[]).map((t) => [
      key(t.connectionId, t.externalPostId),
      t.post
    ])
  );
  return items.map((i) => {
    const k = key(i.connectionId, i.postExternalId);
    const metric = metricBy.get(k);
    const post = targetBy.get(k);
    const asset = post?.media[0]?.mediaAsset;
    const assetThumb = asset ? (asset.thumbnailUrl ?? (asset.type === "IMAGE" ? asset.url : null)) : null;
    const ytThumb = i.network === "YOUTUBE" && i.postExternalId ? `https://i.ytimg.com/vi/${encodeURIComponent(i.postExternalId)}/mqdefault.jpg` : null;
    return {
      ...i,
      postTitle: i.postTitle || metric?.title || firstLine(post?.title) || firstLine(post?.caption) || null,
      postThumbnailUrl: i.postThumbnailUrl || metric?.thumbnailUrl || assetThumb || ytThumb
    };
  });
}
