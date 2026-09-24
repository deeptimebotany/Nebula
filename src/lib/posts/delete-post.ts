// Suppression d'une publication et des fichiers qu'elle seule utilisait —
// partagée par /api/posts/[id] et l'API publique v1 (lot 4).
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/storage";

export async function deletePostAndOrphanMedia(postId: string): Promise<void> {
  // Fichiers potentiellement libérés, capturés AVANT la suppression (un même
  // fichier peut être réutilisé par « Dupliquer »).
  const mediaAssetIds = (await prisma.postMedia.findMany({ where: { postId }, select: { mediaAssetId: true } })).map(
    (m: { mediaAssetId: string }) => m.mediaAssetId
  );

  await prisma.post.delete({ where: { id: postId } });

  // Chaque fichier qui n'est plus utilisé par aucune autre publication est
  // réellement supprimé (base + Vercel Blob), pour ne pas remplir le quota
  // de stockage pour rien.
  if (mediaAssetIds.length > 0) {
    const stillUsed = await prisma.postMedia.findMany({ where: { mediaAssetId: { in: mediaAssetIds } }, select: { mediaAssetId: true } });
    const stillUsedIds = new Set(stillUsed.map((m: { mediaAssetId: string }) => m.mediaAssetId));
    const orphaned = mediaAssetIds.filter((id: string) => !stillUsedIds.has(id));
    if (orphaned.length > 0) {
      const assets = await prisma.mediaAsset.findMany({ where: { id: { in: orphaned } } });
      for (const asset of assets) {
        await deleteUploadedFile(asset.url);
        if (asset.thumbnailUrl) await deleteUploadedFile(asset.thumbnailUrl);
      }
      await prisma.mediaAsset.deleteMany({ where: { id: { in: orphaned } } });
    }
  }
}
