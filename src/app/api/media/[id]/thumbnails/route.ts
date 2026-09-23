import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { checkFfmpegAvailable, evenlySpacedTimestamps, extractFrames, getVideoDurationSeconds } from "@/lib/video/frames";

// POST /api/media/[id]/thumbnails — extrait 6 vraies frames de la vidéo
// uploadée (aucune IA), pour que l'utilisateur choisisse sa miniature.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const asset = await prisma.mediaAsset.findFirst({ where: { id: params.id, brand: ownedBy(userId) } });
  if (!asset) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
  if (asset.type !== "VIDEO") return NextResponse.json({ error: "Ce média n'est pas une vidéo" }, { status: 400 });
  if (asset.url.startsWith("http")) {
    return NextResponse.json(
      { error: "Génération de miniatures uniquement pour les fichiers stockés localement pour l'instant." },
      { status: 400 }
    );
  }

  if (!(await checkFfmpegAvailable())) {
    return NextResponse.json(
      {
        error:
          "ffmpeg n'est pas installé sur ce serveur. Cette fonctionnalité nécessite ffmpeg/ffprobe (voir le README, section déploiement)."
      },
      { status: 503 }
    );
  }

  const filePath = path.join(process.cwd(), "public", asset.url);
  const outDir = path.join(process.cwd(), "public", "uploads", "thumbs");

  try {
    const duration = await getVideoDurationSeconds(filePath);
    const timestamps = evenlySpacedTimestamps(duration, 6);
    const files = await extractFrames(filePath, outDir, asset.id, timestamps);
    const urls = files.map((f) => `/uploads/thumbs/${path.basename(f)}`);

    if (!asset.durationSeconds) {
      await prisma.mediaAsset.update({ where: { id: asset.id }, data: { durationSeconds: duration } });
    }

    return NextResponse.json({ thumbnails: urls });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
