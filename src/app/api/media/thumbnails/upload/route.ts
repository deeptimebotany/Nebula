import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/storage";

// POST /api/media/thumbnails/upload — reçoit UNE image (frame capturée côté
// navigateur via <canvas>, voir composer/page.tsx) et la stocke simplement
// comme un fichier (disque local ou Vercel Blob selon storage.ts), sans créer
// de MediaAsset. Remplace l'ancienne extraction ffmpeg côté serveur, qui ne
// fonctionne ni sur Vercel (pas de ffmpeg) ni pour des vidéos déjà sur Blob.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Aucune image reçue" }, { status: 400 });

  const saved = await saveUploadedFile(file);
  return NextResponse.json({ url: saved.url });
}
