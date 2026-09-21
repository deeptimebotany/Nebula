import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { assertBrandMembership } from "@/lib/brand-access";
import { getBrandPlan } from "@/lib/billing/plan";
import { isAiEnabled, analyzeVideoRetentionByThumbnail } from "@/lib/ai/gemini";
import { fetchRetention, fetchVideoMetadata } from "@/lib/social/youtube";

// GET/POST /api/ai/analyze-channel-video — version autonome de
// /api/ai/analyze-video (voir ce fichier) : au lieu d'un postTargetId
// (donc une vidéo déjà publiée via le Composer Nebula), on prend un couple
// { connectionId, videoId } — n'importe quelle vidéo de la chaîne YouTube
// connectée. Voir /retention pour l'UI et src/lib/ai/gemini.ts ::
// analyzeVideoRetentionByThumbnail pour la différence de méthode d'analyse
// (miniature publique au lieu de frames ffmpeg, faute de fichier source).
async function resolveConnection(userId: string, connectionId: string) {
  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.network !== "YOUTUBE") return null;
  if (!(await assertBrandMembership(userId, connection.brandId))) return null;
  return connection;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!connectionId || !videoId) return NextResponse.json({ error: "connectionId et videoId requis" }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  const connection = await resolveConnection(userId, connectionId);
  if (!connection) return NextResponse.json({ error: "Connexion introuvable." }, { status: 404 });

  const insight = await prisma.videoInsight.findFirst({
    where: { connectionId, videoId },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ insight });
}

const bodySchema = z.object({ connectionId: z.string().min(1), videoId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "L'assistant IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const { connectionId, videoId } = parsed.data;

  const userId = (session.user as { id: string }).id;
  const connection = await resolveConnection(userId, connectionId);
  if (!connection) return NextResponse.json({ error: "Connexion introuvable." }, { status: 404 });

  const { limits } = await getBrandPlan(connection.brandId);
  if (!limits.aiEnabled) {
    return NextResponse.json(
      { error: "L'analyse de rétention IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." },
      { status: 402 }
    );
  }

  try {
    const [retentionCurve, metadata] = await Promise.all([
      fetchRetention(connection, videoId),
      fetchVideoMetadata(connection, videoId)
    ]);

    const thumbRes = await fetch(metadata.thumbnailUrl);
    if (!thumbRes.ok) throw new Error("Impossible de récupérer la miniature de la vidéo.");
    const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
    const thumbnailMimeType = thumbRes.headers.get("content-type") || "image/jpeg";

    const sorted = [...retentionCurve].sort((a, b) => a.timeRatio - b.timeRatio);
    const deltas = sorted.slice(1).map((p, i) => ({ point: p, delta: sorted[i].watchRatio - p.watchRatio }));
    const topDrops = deltas
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 4)
      .map((d) => d.point)
      .sort((a, b) => a.timeRatio - b.timeRatio);

    const analysis = await analyzeVideoRetentionByThumbnail({
      title: metadata.title,
      description: metadata.description,
      retentionCurve: topDrops.length ? topDrops : sorted,
      thumbnailBase64: thumbBuffer.toString("base64"),
      thumbnailMimeType
    });

    const insight = await prisma.videoInsight.create({
      data: {
        connectionId,
        videoId,
        summary: analysis.summary,
        dropOffPoints: JSON.stringify(analysis.dropOffPoints),
        recommendations: JSON.stringify(analysis.recommendations),
        retentionCurve: JSON.stringify(retentionCurve)
      }
    });

    return NextResponse.json({ insight });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
