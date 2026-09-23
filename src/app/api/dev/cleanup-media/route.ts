import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/dev-preview";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile } from "@/lib/storage";

// POST /api/dev/cleanup-media — réservé au compte propriétaire (voir
// /dev-preview, qui expose le bouton). Purge tous les MediaAsset qui ne
// sont référencés par AUCUNE publication (postMedia: none) : ce sont des
// fichiers déjà orphelins d'avant que DELETE/PATCH /api/posts/[id]
// n'apprennent à nettoyer au fur et à mesure — voir ces routes pour le
// nettoyage "au fil de l'eau" désormais en place. Celui-ci sert à rattraper
// ce qui traînait déjà (c'est ce qui a rempli le 1 Go gratuit de Vercel
// Blob) et peut être relancé à tout moment sans risque : un fichier encore
// utilisé par une publication n'est jamais touché.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isOwnerEmail(session.user.email)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const orphaned = await prisma.mediaAsset.findMany({ where: { postMedia: { none: {} } } });

  let freedBytes = 0;
  for (const asset of orphaned) {
    await deleteUploadedFile(asset.url);
    if (asset.thumbnailUrl) await deleteUploadedFile(asset.thumbnailUrl);
    freedBytes += asset.sizeBytes;
  }
  if (orphaned.length > 0) {
    await prisma.mediaAsset.deleteMany({ where: { id: { in: orphaned.map((a: { id: string }) => a.id) } } });
  }

  return NextResponse.json({ ok: true, count: orphaned.length, freedBytes });
}
