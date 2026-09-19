import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/storage";
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
