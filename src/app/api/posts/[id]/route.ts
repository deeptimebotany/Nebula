import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPost } from "@/lib/publish";
import { ownedBy, PUBLIC_CONNECTION_SELECT } from "@/lib/brand-access";
import { deleteUploadedFile } from "@/lib/storage";
import { PAST_SCHEDULE_ERROR, isPastSchedule } from "@/lib/schedule-guard";

// Toutes les actions ci-dessous commencent par retrouver le post PARMI LES
// MARQUES DE L'UTILISATEUR (`brand: ownedBy(userId)`) : un identifiant de
// post appartenant à une autre marque renvoie 404, exactement comme un
// identifiant inexistant. Sans ce filtre, n'importe quel compte pouvait lire,
// modifier, supprimer ou PUBLIER le post d'un autre client.
async function findOwnPost(userId: string, postId: string) {
  return prisma.post.findFirst({ where: { id: postId, brand: ownedBy(userId) }, select: { id: true, brandId: true, status: true } });
}

const notFound = () => NextResponse.json({ error: "Post introuvable" }, { status: 404 });

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const post = await prisma.post.findFirst({
    where: { id: params.id, brand: ownedBy(userId) },
    include: {
      media: { include: { mediaAsset: true }, orderBy: { order: "asc" } },
      targets: {
        include: {
          // Jamais la connexion complète : elle contient les jetons OAuth.
          connection: { select: PUBLIC_CONNECTION_SELECT },
          insights: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    }
  });
  if (!post) return notFound();
  return NextResponse.json({ post });
}

// POST /api/posts/[id] { action: "publish-now" | "cancel" | "duplicate" }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const own = await findOwnPost(userId, params.id);
  if (!own) return notFound();

  const { action } = await req.json();

  if (action === "cancel") {
    await prisma.post.update({ where: { id: own.id }, data: { status: "DRAFT", scheduledAt: null } });
    return NextResponse.json({ ok: true });
  }

  if (action === "publish-now") {
    try {
      const result = await publishPost(own.id);
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
      where: { id: own.id },
      include: { media: true, targets: true }
    });
    if (!source) return notFound();

    const copy = await prisma.post.create({
      data: {
        brandId: source.brandId,
        createdById: userId,
        title: source.title,
        caption: source.caption,
        firstComment: source.firstComment,
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
            metadata: t.metadata ?? undefined,
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
  const userId = (session.user as { id: string }).id;

  const existing = await findOwnPost(userId, params.id);
  if (!existing) return notFound();
  if (!["DRAFT", "SCHEDULED"].includes(existing.status)) {
    return NextResponse.json({ error: "Cette publication a déjà été envoyée, elle ne peut plus être modifiée." }, { status: 409 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.caption === "string") data.caption = body.caption;
  if (typeof body.scheduledAt === "string") {
    const when = new Date(body.scheduledAt);
    if (Number.isNaN(when.getTime())) return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    if (isPastSchedule(when)) return NextResponse.json({ error: PAST_SCHEDULE_ERROR, reason: "past_schedule" }, { status: 400 });
    data.scheduledAt = when;
    data.status = "SCHEDULED";
  }

  if (Object.keys(data).length) {
    await prisma.post.update({ where: { id: existing.id }, data });
  }
  if (Array.isArray(body.mediaAssetIds)) {
    const mediaAssetIds = (body.mediaAssetIds as unknown[]).filter((v): v is string => typeof v === "string");
    // Les médias de remplacement doivent appartenir à la même marque que le post.
    const uniqueIds = Array.from(new Set(mediaAssetIds));
    if (uniqueIds.length > 0) {
      const okAssets = await prisma.mediaAsset.count({ where: { id: { in: uniqueIds }, brandId: existing.brandId } });
      if (okAssets !== uniqueIds.length) {
        return NextResponse.json({ error: "Un des médias n'appartient pas à cette marque." }, { status: 400 });
      }
    }

    // Fichier(s) que ce post utilisait AVANT le remplacement (ex. "Remplacer
    // le fichier" depuis la modale du calendrier) — mêmes principe et raison
    // que dans DELETE ci-dessous : sans ça, l'ancien fichier reste en base et
    // sur Vercel Blob pour toujours, même si plus aucune publication ne
    // l'utilise, jusqu'à remplir le quota de stockage.
    const previousMediaAssetIds = (
      await prisma.postMedia.findMany({ where: { postId: existing.id }, select: { mediaAssetId: true } })
    ).map((m: { mediaAssetId: string }) => m.mediaAssetId);

    await prisma.postMedia.deleteMany({ where: { postId: existing.id } });
    if (mediaAssetIds.length > 0) {
      await prisma.postMedia.createMany({
        data: mediaAssetIds.map((mediaAssetId, order) => ({ postId: existing.id, mediaAssetId, order }))
      });
    }

    const stillReferenced = new Set(mediaAssetIds);
    const candidates = previousMediaAssetIds.filter((id: string) => !stillReferenced.has(id));
    if (candidates.length > 0) {
      const stillUsedElsewhere = await prisma.postMedia.findMany({
        where: { mediaAssetId: { in: candidates } },
        select: { mediaAssetId: true }
      });
      const usedIds = new Set(stillUsedElsewhere.map((m: { mediaAssetId: string }) => m.mediaAssetId));
      const orphaned = candidates.filter((id: string) => !usedIds.has(id));
      if (orphaned.length > 0) {
        const assets = await prisma.mediaAsset.findMany({ where: { id: { in: orphaned } } });
        for (const asset of assets) {
          await deleteUploadedFile(asset.url);
          if (asset.thumbnailUrl) await deleteUploadedFile(asset.thumbnailUrl);
        }
        await prisma.mediaAsset.deleteMany({ where: { id: { in: orphaned } } });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const own = await findOwnPost(userId, params.id);
  if (!own) return notFound();

  // Fichiers (vidéo/image) potentiellement libérés par cette suppression —
  // capturés AVANT de supprimer le post, pour savoir ensuite lesquels ne sont
  // plus utilisés par aucune autre publication (un même fichier peut être
  // réutilisé par "Dupliquer", voir POST ci-dessus).
  const mediaAssetIds = (
    await prisma.postMedia.findMany({ where: { postId: own.id }, select: { mediaAssetId: true } })
  ).map((m: { mediaAssetId: string }) => m.mediaAssetId);

  await prisma.post.delete({ where: { id: own.id } });

  // Le post est supprimé (cascade sur PostMedia, voir schema.prisma) : pour
  // chaque fichier qu'il utilisait, on vérifie s'il est encore référencé par
  // une AUTRE publication. Si non, on le supprime vraiment (base + Vercel
  // Blob) plutôt que de le laisser occuper le quota de stockage pour rien —
  // c'est ce qui, faute de nettoyage, avait fini par remplir le 1 Go gratuit
  // de Vercel Blob et bloquer tout nouvel envoi.
  if (mediaAssetIds.length > 0) {
    const stillUsed = await prisma.postMedia.findMany({
      where: { mediaAssetId: { in: mediaAssetIds } },
      select: { mediaAssetId: true }
    });
    const stillUsedIds = new Set(stillUsed.map((m: { mediaAssetId: string }) => m.mediaAssetId));
    const orphaned = mediaAssetIds.filter((id: string) => !stillUsedIds.has(id));
    if (orphaned.length > 0) {
      const assets = await prisma.mediaAsset.findMany({ where: { id: { in: orphaned } } });
      for (const asset of assets) {
        await deleteUploadedFile(asset.url);
        if (asset.thumbnailUrl) await deleteUploadedFile(asset.thumbnailUrl);
      }
      await prisma.mediaAsset.deleteMany({ where: { id: { in: orphaned } } });
    }
  }

  return NextResponse.json({ ok: true });
}
