import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { brandUploadPrefix, isOwnFileUnder, userUploadPrefix } from "@/lib/upload-policy";

const dimension = z.number().int().min(1).max(20_000);
const bodySchema = z
  .object({ thumbnailUrl: z.string().min(1).max(2048).optional(), width: dimension.optional(), height: dimension.optional() })
  .refine((b) => b.thumbnailUrl !== undefined || (b.width !== undefined && b.height !== undefined), { message: "thumbnailUrl ou width + height requis" });

// PATCH /api/media/[id] { thumbnailUrl } — enregistre la miniature choisie
// (frame extraite ou uploadée) pour ce média.
// PATCH /api/media/[id] { width, height } — dimensions lues par l'aperçu de
// Publier (Réussites, lot B : étoile « Vertical natif »). Enregistrées une
// seule fois : jamais remplacées ensuite.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Le média doit appartenir à une des marques de l'utilisateur.
  const userId = (session.user as { id: string }).id;
  const owned = await prisma.mediaAsset.findFirst({
    where: { id: params.id, brand: ownedBy(userId) },
    select: { id: true, brandId: true, thumbnailUrl: true, width: true, height: true }
  });
  if (!owned) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  if (parsed.data.thumbnailUrl === undefined) {
    if (owned.width === null && owned.height === null) {
      await prisma.mediaAsset.updateMany({ where: { id: owned.id, width: null, height: null }, data: { width: parsed.data.width, height: parsed.data.height } });
    }
    return NextResponse.json({ ok: true });
  }

  // Audit sécurité (lot 1) : la miniature doit être un fichier de NOTRE
  // stockage envoyé par cet utilisateur ou rangé dans le dossier de la
  // marque — jamais le fichier d'un autre client (qui aurait été supprimé
  // avec la publication).
  const thumbnailUrl = parsed.data.thumbnailUrl;
  if (thumbnailUrl !== owned.thumbnailUrl && !isOwnFileUnder(thumbnailUrl, [userUploadPrefix(userId), brandUploadPrefix(owned.brandId)])) {
    return NextResponse.json({ error: "Miniature non reconnue : envoyez l'image depuis Nebula." }, { status: 400 });
  }

  const asset = await prisma.mediaAsset.update({
    where: { id: owned.id },
    data: { thumbnailUrl: parsed.data.thumbnailUrl }
  });
  return NextResponse.json({ asset });
}
