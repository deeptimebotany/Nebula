import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBrandMembership } from "@/lib/brand-access";
import { brandUploadPrefix, isAllowedMediaMime, isOwnFileUnder, MAX_UPLOAD_BYTES } from "@/lib/upload-policy";
import type { MediaType } from "@/lib/types";
import { z } from "zod";

const bodySchema = z.object({
  brandId: z.string().min(1),
  url: z.string().url(),
  filename: z.string().max(255).optional(),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().min(0).max(MAX_UPLOAD_BYTES).optional()
});

// POST /api/upload/register { brandId, url, filename, mimeType, sizeBytes }
// Appelé par le navigateur juste après un envoi direct vers Vercel Blob
// (voir /api/upload/blob-token) : le fichier est déjà stocké, on crée juste
// la fiche MediaAsset correspondante. Requête minuscule (aucun fichier dans
// le corps), donc jamais concernée par la limite de taille des fonctions
// serverless de Vercel.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { brandId, url, filename, mimeType, sizeBytes } = parsed.data;

  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  // L'URL doit pointer vers NOTRE stockage (Vercel Blob), dans le dossier de
  // CETTE marque (audit sécurité, lot 1) : sinon on pourrait enregistrer —
  // puis faire supprimer — le fichier d'un autre client.
  if (!isOwnFileUnder(url, [brandUploadPrefix(brandId)])) {
    return NextResponse.json({ error: "URL de média non reconnue." }, { status: 400 });
  }
  const mime = mimeType ?? "application/octet-stream";
  if (!isAllowedMediaMime(mime)) {
    return NextResponse.json({ error: "Type de fichier non accepté (images et vidéos uniquement)." }, { status: 415 });
  }

  const type: MediaType = mime.startsWith("video") ? "VIDEO" : "IMAGE";
  const asset = await prisma.mediaAsset.create({
    data: {
      brandId,
      type,
      url,
      filename: filename ?? "fichier",
      mimeType: mime,
      sizeBytes: sizeBytes ?? 0
    }
  });

  return NextResponse.json({ asset });
}
