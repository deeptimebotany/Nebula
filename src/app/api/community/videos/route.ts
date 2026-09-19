import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// "Vidéos du jour" — fil public des vidéos que des utilisateurs ont choisi de
// partager depuis leurs publications déjà en ligne. On ne stocke jamais le
// fichier : uniquement le lien externe vers la plateforme d'origine et sa
// miniature, recopiés au moment du partage (partage 100% volontaire, geste
// explicite depuis la page d'une publication publiée).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const videos = await prisma.sharedVideo.findMany({
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json({ videos });
}

// POST { postTargetId, note? } — partage volontaire d'une publication déjà
// publiée par l'utilisateur courant (vérifié via son appartenance à la marque).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { postTargetId, note } = await req.json();
  if (!postTargetId) return NextResponse.json({ error: "postTargetId requis." }, { status: 400 });

  const userId = (session.user as { id: string }).id;

  const target = await prisma.postTarget.findUnique({
    where: { id: postTargetId },
    include: {
      post: { include: { brand: true, media: { include: { mediaAsset: true }, orderBy: { order: "asc" } } } },
      connection: true
    }
  });
  if (!target) return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });
  if (target.status !== "PUBLISHED" || !target.externalUrl) {
    return NextResponse.json({ error: "Seule une publication réellement en ligne peut être partagée." }, { status: 400 });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_brandId: { userId, brandId: target.post.brandId } }
  });
  if (!membership) {
    return NextResponse.json({ error: "Vous n'avez pas accès à cette publication." }, { status: 403 });
  }

  const videoAsset = target.post.media.find((m: (typeof target.post.media)[number]) => m.mediaAsset.type === "VIDEO");
  const thumbnailUrl = videoAsset?.mediaAsset.thumbnailUrl ?? target.post.media[0]?.mediaAsset.thumbnailUrl ?? null;

  const shared = await prisma.sharedVideo.create({
    data: {
      authorId: userId,
      postTargetId: target.id,
      network: target.network,
      title: target.titleOverride || target.post.title || target.post.caption.slice(0, 80) || "Vidéo sans titre",
      externalUrl: target.externalUrl,
      thumbnailUrl,
      note: typeof note === "string" ? note.trim().slice(0, 300) || null : null
    },
    include: { author: { select: { id: true, name: true } } }
  });

  return NextResponse.json({ ok: true, video: shared });
}
