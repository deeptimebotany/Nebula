import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/storage";
import { requireBrandMembership } from "@/lib/brand-access";
import { isAllowedMediaMime, MAX_UPLOAD_BYTES } from "@/lib/upload-policy";
import type { MediaType } from "@/lib/types";

// POST /api/upload — reçoit un ou plusieurs fichiers (multipart/form-data)
// pour le composer d'upload vidéo/photo en masse.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const form = await req.formData();
  const brandId = form.get("brandId") as string | null;
  const files = form.getAll("files") as File[];

  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });

  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  // Même politique que l'envoi direct vers Vercel Blob (voir upload/blob-token) :
  // uniquement des images et des vidéos, taille plafonnée.
  for (const file of files) {
    if (!isAllowedMediaMime(file.type)) {
      return NextResponse.json({ error: `Type de fichier non accepté : ${file.type || "inconnu"} (images et vidéos uniquement).` }, { status: 415 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `Fichier trop volumineux : ${file.name} (maximum 2 Go).` }, { status: 413 });
    }
  }

  const created = [];
  for (const file of files) {
    const saved = await saveUploadedFile(file);
    const type: MediaType = file.type.startsWith("video") ? "VIDEO" : "IMAGE";
    const asset = await prisma.mediaAsset.create({
      data: {
        brandId,
        type,
        url: saved.url,
        filename: saved.filename,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes
      }
    });
    created.push(asset);
  }

  return NextResponse.json({ assets: created });
}
