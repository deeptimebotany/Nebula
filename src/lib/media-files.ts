// Suppression des fichiers d'une marque (audit sécurité, lot 1).
//
// Un fichier n'est supprimé du stockage que s'il appartient à la marque
// concernée : rangé sous b/<marque>/, envoyé par un membre de la marque
// (u/<membre>/), ou — pour les fichiers antérieurs à ce rangement — s'il
// n'est utilisé par aucun média d'une autre marque. Une adresse qui ne
// vient pas de notre stockage n'est jamais supprimée.
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/storage";
import { brandUploadPrefix, ownStoragePath } from "@/lib/upload-policy";

export async function canDeleteForBrand(url: string, brandId: string): Promise<boolean> {
  const path = ownStoragePath(url);
  if (!path) return false;
  if (path.startsWith(brandUploadPrefix(brandId))) return true;
  if (path.startsWith("b/")) return false; // dossier d'une autre marque
  if (path.startsWith("u/")) {
    const userId = path.split("/")[1];
    if (!userId) return false;
    const member = await prisma.membership.findFirst({ where: { userId, brandId }, select: { id: true } });
    return Boolean(member);
  }
  // Ancien fichier (à la racine, ou disque local) : seulement s'il n'est
  // utilisé par aucun média d'une autre marque.
  const usedElsewhere = await prisma.mediaAsset.findFirst({
    where: { brandId: { not: brandId }, OR: [{ url }, { thumbnailUrl: url }] },
    select: { id: true }
  });
  return !usedElsewhere;
}

export async function deleteBrandMediaFile(url: string | null | undefined, brandId: string): Promise<void> {
  if (!url) return;
  if (!(await canDeleteForBrand(url, brandId).catch(() => false))) return;
  await deleteUploadedFile(url);
}
