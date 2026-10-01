import { NextRequest, NextResponse } from "next/server";
import { deletePostAndOrphanMedia } from "@/lib/posts/delete-post";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPost, PublishInProgressError, retryWaitingTargetsNow, stopWaitingTargets } from "@/lib/publish";
import { ownedBy, PUBLIC_CONNECTION_SELECT } from "@/lib/brand-access";
import { deleteBrandMediaFile } from "@/lib/media-files";
import { PAST_SCHEDULE_ERROR, isPastSchedule } from "@/lib/schedule-guard";
import { assertBrandWritable, assertConnectionsWritable } from "@/lib/billing/trial-expiry";
import { tiktokOptionsProblem } from "@/lib/social/tiktok-direct-post";
import { z } from "zod";
import { deleteTargetsOnNetworks } from "@/lib/posts/remote-delete";
import { instagramDeleteEnabled } from "@/lib/social/meta";
import { isOnlineTarget, remoteDeleteSupport } from "@/lib/social/remote-delete-support";

/**
 * Marque ou comptes en veille (lot E4) : ni « Publier maintenant » ni
 * nouvelle date. TikTok sans confidentialité choisie (règles Direct Post,
 * 30/09/2026 — brouillon importé par CSV…) : non plus.
 */
async function writableError(postId: string, brandId: string): Promise<NextResponse | null> {
  const brand = await assertBrandWritable(brandId);
  if (!brand.ok) return NextResponse.json({ error: brand.message, reason: brand.reason }, { status: 402 });
  const targets = await prisma.postTarget.findMany({ where: { postId }, select: { connectionId: true, network: true, status: true, metadata: true } });
  const conn = await assertConnectionsWritable(targets.map((t) => t.connectionId));
  if (!conn.ok) return NextResponse.json({ error: conn.message, reason: conn.reason }, { status: 402 });
  const tiktok = targets.find((t) => t.network === "TIKTOK" && t.status !== "PUBLISHED" && tiktokOptionsProblem((t.metadata as { tiktok?: unknown } | null)?.tiktok));
  if (tiktok) {
    return NextResponse.json(
      {
        error: "Cette publication part sur TikTok sans confidentialité choisie : utilisez « Réutiliser » pour l'ouvrir dans Publier et choisir qui peut voir la vidéo.",
        reason: "tiktok_options"
      },
      { status: 400 }
    );
  }
  return null;
}

// Publication immédiate : jusqu'à 60 s (limite du plan Vercel Hobby).
export const maxDuration = 60;

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
          // Les permissions (scopes) servent seulement à calculer ce que la
          // case « Supprimer aussi sur … » permet, puis sont retirées.
          connection: { select: { ...PUBLIC_CONNECTION_SELECT, scopes: true } },
          insights: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    }
  });
  if (!post) return notFound();
  const igDelete = instagramDeleteEnabled();
  const targets = post.targets.map((t: (typeof post.targets)[number]) => {
    const { scopes: _scopes, ...connection } = t.connection;
    return {
      ...t,
      connection,
      // Publication en ligne : suppression possible depuis Nebula, ou marche à suivre (01/10/2026).
      remoteDelete: isOnlineTarget(t) ? remoteDeleteSupport(t, t.connection, { instagramDeleteEnabled: igDelete }) : null
    };
  });
  return NextResponse.json({ post: { ...post, targets } });
}

// POST /api/posts/[id] { action: "publish-now" | "cancel" | "duplicate" | "retry-now" | "stop-retries" }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const own = await findOwnPost(userId, params.id);
  if (!own) return notFound();

  const { action } = await req.json();

  if (action === "cancel") {
    // Jamais pendant un envoi en cours (lot 2) : seulement une publication
    // programmée ou un brouillon.
    const { count } = await prisma.post.updateMany({
      where: { id: own.id, status: { in: ["SCHEDULED", "DRAFT"] } },
      // Annulée à la main : plus de reprogrammation au passage en Pro (lot E4).
      data: { status: "DRAFT", scheduledAt: null, dormantScheduledAt: null }
    });
    if (count === 0) return NextResponse.json({ error: "Cette publication est déjà en cours d'envoi ou terminée." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  // Relances automatiques (lot 5) : les lancer tout de suite, ou les arrêter.
  if (action === "retry-now") {
    const result = await retryWaitingTargetsNow(own.id);
    return NextResponse.json({ ok: true, ...result });
  }
  if (action === "stop-retries") {
    const result = await stopWaitingTargets(own.id);
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "publish-now") {
    const blocked = await writableError(own.id, own.brandId);
    if (blocked) return blocked;
    try {
      const result = await publishPost(own.id);
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof PublishInProgressError) return NextResponse.json({ error: err.message }, { status: 409 });
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
    const blocked = await writableError(existing.id, existing.brandId);
    if (blocked) return blocked;
    data.scheduledAt = when;
    data.status = "SCHEDULED";
    data.dormantScheduledAt = null;
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
          // Seulement les fichiers de cette marque (audit sécurité, lot 1).
          await deleteBrandMediaFile(asset.url, asset.brandId);
          await deleteBrandMediaFile(asset.thumbnailUrl, asset.brandId);
        }
        await prisma.mediaAsset.deleteMany({ where: { id: { in: orphaned } } });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/posts/[id] { alsoDeleteOn?: string[] } — supprime la
// publication de Nebula. `alsoDeleteOn` (01/10/2026) : identifiants des
// cibles à retirer AUSSI des réseaux (case « Supprimer aussi sur … »). Si
// un réseau échoue, rien n'est supprimé dans Nebula : la réponse détaille
// chaque réseau ({ deleted: false, results }) pour réessayer ou le faire à
// la main ; ce qui a déjà été retiré reste noté (voir remote-delete.ts).
const deleteBodySchema = z.object({ alsoDeleteOn: z.array(z.string().min(1).max(64)).max(20).optional() });

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const own = await findOwnPost(userId, params.id);
  if (!own) return notFound();

  // Sans corps (ancienne fiche, API) : suppression dans Nebula seulement.
  const raw = await req.text().catch(() => "");
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = deleteBodySchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const results = await deleteTargetsOnNetworks(own.id, parsed.data.alsoDeleteOn ?? []);
  if (results.some((r) => !r.ok)) {
    return NextResponse.json({ ok: false, deleted: false, results });
  }

  // Suppression + nettoyage des fichiers orphelins (voir src/lib/posts/delete-post.ts).
  await deletePostAndOrphanMedia(own.id);

  return NextResponse.json({ ok: true, deleted: true, results });
}
