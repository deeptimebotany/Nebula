import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPost } from "@/lib/publish";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: {
      media: { include: { mediaAsset: true }, orderBy: { order: "asc" } },
      targets: { include: { connection: true, insights: { orderBy: { createdAt: "desc" }, take: 1 } } }
    }
  });
  if (!post) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
  return NextResponse.json({ post });
}

// POST /api/posts/[id] { action: "publish-now" | "cancel" | "duplicate" }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { action } = await req.json();

  if (action === "cancel") {
    await prisma.post.update({ where: { id: params.id }, data: { status: "DRAFT", scheduledAt: null } });
    return NextResponse.json({ ok: true });
  }

  if (action === "publish-now") {
    try {
      const result = await publishPost(params.id);
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  // "duplicate" : recrée immédiatement une copie en brouillon (aucun statut
  // "PUBLISHED"/"FAILED" hérité, aucun identifiant externe hérité) — utile
  // pour réessayer une publication restée bloquée "en attente" ou en échec,
  // sans tout ressaisir dans le composer.
  if (action === "duplicate") {
    const source = await prisma.post.findUnique({
      where: { id: params.id },
      include: { media: true, targets: true }
    });
    if (!source) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });

    const userId = (session.user as { id: string }).id;
    const copy = await prisma.post.create({
      data: {
        brandId: source.brandId,
        createdById: userId,
        title: source.title,
        caption: source.caption,
        status: "DRAFT",
        duplicatedFromId: source.id,
        media: {
          create: source.media.map((m: (typeof source.media)[number]) => ({ mediaAssetId: m.mediaAssetId, order: m.order }))
        },
        targets: {
          create: source.targets.map((t: (typeof source.targets)[number]) => ({
            connectionId: t.connectionId,
            network: t.network,
            titleOverride: t.titleOverride,
            captionOverride: t.captionOverride,
            status: "PENDING"
          }))
        }
      }
    });

    return NextResponse.json({ ok: true, postId: copy.id });
  }

  return NextResponse.json({ error: "action inconnue" }, { status: 400 });
}

// PATCH /api/posts/[id] { title?, caption?, scheduledAt?, mediaAssetIds? } —
// édition rapide depuis la modale du calendrier (titre, légende, date, ou
// remplacement du fichier média). Uniquement pour un post pas encore publié
// (DRAFT/SCHEDULED) : une fois envoyé, on ne réécrit plus l'historique.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const existing = await prisma.post.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
  if (!["DRAFT", "SCHEDULED"].includes(existing.status)) {
    return NextResponse.json({ error: "Cette publication a déjà été envoyée, elle ne peut plus être modifiée." }, { status: 409 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.caption === "string") data.caption = body.caption;
  if (typeof body.scheduledAt === "string") {
    data.scheduledAt = new Date(body.scheduledAt);
    data.status = "SCHEDULED";
  }

  if (Object.keys(data).length) {
    await prisma.post.update({ where: { id: params.id }, data });
  }
  if (Array.isArray(body.mediaAssetIds)) {
    await prisma.postMedia.deleteMany({ where: { postId: params.id } });
    await prisma.postMedia.createMany({
      data: body.mediaAssetIds.map((mediaAssetId: string, order: number) => ({
        postId: params.id,
        mediaAssetId,
        order
      }))
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  await prisma.post.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
