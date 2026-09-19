import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

/**
 * GET /api/upload/blob-token — indique simplement si Vercel Blob est
 * configuré (BLOB_READ_WRITE_TOKEN présent). Le composer l'appelle une fois
 * pour choisir entre l'envoi direct navigateur → Blob (voir POST ci-dessous)
 * et l'ancien envoi classique via /api/upload.
 */
export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
}

/**
 * POST /api/upload/blob-token — génère un jeton d'upload à usage unique pour
 * que le NAVIGATEUR envoie le fichier DIRECTEMENT à Vercel Blob, sans passer
 * par notre fonction serverless.
 *
 * Pourquoi : Vercel limite à ~4,5 Mo le corps d'une requête reçue par une
 * fonction serverless classique. Une vidéo (et parfois une photo un peu
 * lourde) dépasse presque toujours cette limite : l'ancien envoi via
 * /api/upload échouait alors silencieusement (la plateforme rejette la
 * requête avant même que notre code ne s'exécute). L'upload direct
 * contourne entièrement cette limite (jusqu'à plusieurs Go).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error: "blob-not-configured",
        message:
          "Vercel Blob n'est pas configuré (BLOB_READ_WRITE_TOKEN manquant). Ajoutez cette variable d'environnement dans les paramètres du projet Vercel."
      },
      { status: 501 }
    );
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/*", "image/*"],
        addRandomSuffix: true,
        maximumSizeInBytes: 2 * 1024 * 1024 * 1024 // 2 Go, largement suffisant pour une vidéo courte
      })
      // Pas de onUploadCompleted : l'enregistrement en base se fait via un
      // appel explicite du navigateur à /api/upload/register juste après,
      // ce qui évite de dépendre d'un webhook Vercel Blob accessible
      // publiquement (impossible à tester en local).
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
