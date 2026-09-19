import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { MediaType } from "@/lib/types";

// POST /api/upload/register { brandId, url, filename, mimeType, sizeBytes }
// Appelé par le navigateur juste après un envoi direct vers Vercel Blob
// (voir /api/upload/blob-token) : le fichier est déjà stocké, on crée juste
// la fiche MediaAsset correspondante. Requête minuscule (aucun fichier dans
// le corps), donc jamais concernée par la limite de taille des fonctions
// serverless de Vercel.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { brandId, url, filename, mimeType, sizeBytes } = await req.json();
  if (!brandId || !url) return NextResponse.json({ error: "brandId et url requis" }, { status: 400 });

  const type: MediaType = String(mimeType ?? "").startsWith("video") ? "VIDEO" : "IMAGE";
  const asset = await prisma.mediaAsset.create({
    data: {
      brandId,
      type,
      url,
      filename: filename ?? "fichier",
      mimeType: mimeType ?? "application/octet-stream",
      sizeBytes: typeof sizeBytes === "number" ? sizeBytes : 0
    }
  });

  return NextResponse.json({ asset });
}
