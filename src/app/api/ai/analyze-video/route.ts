import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";
import { readFile } from "fs/promises";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchRetention } from "@/lib/social/youtube";
import { checkFfmpegAvailable, extractFrames, getVideoDurationSeconds } from "@/lib/video/frames";
import { isAiEnabled, analyzeVideoRetention, type RetentionPoint } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";
import { z } from "zod";

const bodySchema = z.object({ postTargetId: z.string() });

// POST /api/ai/analyze-video — analyse de rétention façon "YouTube Studio
// AI Insights" : récupère la vraie courbe de rétention (YouTube Analytics
// API), extrait les frames de la vidéo aux plus grosses chutes (ffmpeg), et
// demande à Gemini d'expliquer ce qui se passe à l'écran à ces instants.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isAiEnabled()) {
    return NextResponse.json({ error: "L'assistant IA n'est pas configuré (GEMINI_API_KEY manquant)." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const target = await prisma.postTarget.findUnique({
    where: { id: parsed.data.postTargetId },
    include: {
      connection: true,
      post: { include: { media: { include: { mediaAsset: true }, orderBy: { order: "asc" } } } }
    }
  });
  if (!target) return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });
  if (target.network !== "YOUTUBE") {
    return NextResponse.json({ error: "L'analyse de rétention n'est disponible que pour YouTube." }, { status: 400 });
  }
  if (!target.externalPostId) {
    return NextResponse.json({ error: "Cette vidéo n'a pas encore été publiée." }, { status: 400 });
  }

  const { limits } = await getBrandPlan(target.post.brandId);
  if (!limits.aiEnabled) {
    return NextResponse.json({ error: "L'analyse IA fait partie des paliers Pro/Agence." }, { status: 402 });
  }

  try {
    const retentionCurve: RetentionPoint[] = await fetchRetention(target.connection, target.externalPostId);

    // Sélectionne les 4 plus grosses chutes de rétention entre deux points
    // consécutifs pour savoir où extraire des frames.
    const drops = retentionCurve
      .map((p, i) => ({ point: p, delta: i > 0 ? retentionCurve[i - 1].watchRatio - p.watchRatio : 0 }))
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 4)
      .map((d) => d.point)
      .sort((a, b) => a.timeRatio - b.timeRatio);

    const videoAsset = target.post.media.find((m: { mediaAsset: { type: string } }) => m.mediaAsset.type === "VIDEO")?.mediaAsset;
    const frames: { timeRatio: number; base64: string; mimeType: string }[] = [];

    if (videoAsset && !videoAsset.url.startsWith("http") && (await checkFfmpegAvailable())) {
      const filePath = path.join(process.cwd(), "public", videoAsset.url);
      const duration = videoAsset.durationSeconds ?? (await getVideoDurationSeconds(filePath));
      const outDir = path.join(process.cwd(), "public", "uploads", "insights");
      const timestamps = drops.map((d) => d.timeRatio * duration);
      const files = await extractFrames(filePath, outDir, `${target.id}-insight`, timestamps);
      for (let i = 0; i < files.length; i++) {
        const buffer = await readFile(files[i]);
        frames.push({ timeRatio: drops[i].timeRatio, base64: buffer.toString("base64"), mimeType: "image/jpeg" });
      }
    }

    const analysis = await analyzeVideoRetention({
      title: target.titleOverride || target.post.title,
      caption: target.captionOverride || target.post.caption,
      retentionCurve,
      frames
    });

    const insight = await prisma.videoInsight.create({
      data: {
        postTargetId: target.id,
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
