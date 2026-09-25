import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/storage";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isRasterImageMime, sniffMediaMime, userUploadPrefix } from "@/lib/upload-policy";

// POST /api/media/thumbnails/upload — reçoit UNE image (frame capturée côté
// navigateur via <canvas>, voir composer/page.tsx) et la stocke simplement
// comme un fichier (disque local ou Vercel Blob selon storage.ts), sans créer
// de MediaAsset. Remplace l'ancienne extraction ffmpeg côté serveur, qui ne
// fonctionne ni sur Vercel (pas de ffmpeg) ni pour des vidéos déjà sur Blob.
//
// Audit sécurité (lot 1) : avant, n'importe quel fichier était accepté (type
// et extension choisis par l'expéditeur : page HTML, SVG avec script…) sans
// limite de taille ni de fréquence. Désormais : images matricielles
// uniquement (type lu dans le contenu), 10 Mo maximum, 60 envois par heure,
// rangées dans le dossier de l'utilisateur (u/<utilisateur>/…).
const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const rate = await consumeRateLimit("thumbnail-upload", userId, 60, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop d'envois d'images : réessayez dans quelques minutes." }, { status: 429 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucune image reçue" }, { status: 400 });
  if (file.size > MAX_THUMBNAIL_BYTES) return NextResponse.json({ error: "Image trop lourde (10 Mo maximum)." }, { status: 413 });

  const mime = sniffMediaMime(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (!isRasterImageMime(mime)) {
    return NextResponse.json({ error: "Format non accepté : envoyez une image JPEG, PNG, WebP, GIF ou HEIC." }, { status: 415 });
  }

  const saved = await saveUploadedFile(file, { prefix: userUploadPrefix(userId), mimeType: mime ?? undefined });
  return NextResponse.json({ url: saved.url });
}
