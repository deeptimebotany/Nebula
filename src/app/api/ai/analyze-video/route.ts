import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { assertBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { isAiEnabled } from "@/lib/ai/gemini";
import { runRetentionAnalysis } from "@/lib/ai/retention-run";

const bodySchema = z.object({ postTargetId: z.string(), force: z.boolean().optional() });

// POST /api/ai/analyze-video — Rétention IA d'une vidéo publiée sur YouTube
// depuis Nebula : même méthode que /api/ai/analyze-channel-video (l'IA
// regarde la vidéo publique ; images extraites ou miniature sinon), voir
// src/lib/ai/retention-run.ts. Réutilise l'analyse déjà faite sauf force.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isAiEnabled()) {
    return NextResponse.json({ error: "L'assistant IA n'est pas configuré (GEMINI_API_KEY manquant)." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const target = await prisma.postTarget.findUnique({
    where: { id: parsed.data.postTargetId },
    include: {
      connection: true,
      post: { include: { media: { include: { mediaAsset: true }, orderBy: { order: "asc" } } } }
    }
  });
  if (!target) return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });
  // La publication doit appartenir à une des marques de l'utilisateur : la
  // connexion YouTube chargée ci-dessus sert ensuite à interroger YouTube.
  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, target.post.brandId))) {
    return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });
  }
  if (target.network !== "YOUTUBE") {
    return NextResponse.json({ error: "L'analyse de rétention n'est disponible que pour YouTube." }, { status: 400 });
  }
  if (!target.externalPostId) {
    return NextResponse.json({ error: "Cette vidéo n'a pas encore été publiée." }, { status: 400 });
  }
  const videoAsset = target.post.media.find((m: { mediaAsset: { type: string } }) => m.mediaAsset.type === "VIDEO")?.mediaAsset;

  return runRetentionAnalysis({
    userId,
    brandId: target.post.brandId,
    connection: target.connection,
    videoId: target.externalPostId,
    postTargetId: target.id,
    titleOverride: target.titleOverride || target.post.title,
    captionOverride: target.captionOverride || target.post.caption,
    localVideoUrl: videoAsset?.url ?? null,
    force: Boolean(parsed.data.force)
  });
}
