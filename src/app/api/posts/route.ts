import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPost } from "@/lib/publish";
import { assertPostQuota } from "@/lib/billing/plan";
import { assertBrandWritable } from "@/lib/billing/trial-expiry";
import { requireBrandMembership, PUBLIC_CONNECTION_SELECT } from "@/lib/brand-access";
import { z } from "zod";

const targetSchema = z.object({
  connectionId: z.string(),
  network: z.string(),
  titleOverride: z.string().optional(),
  captionOverride: z.string().optional(),
  // Préréglages propres à ce réseau (ex. YoutubeOptions du composer) —
  // stockés tels quels en JSON (voir schema.prisma → PostTarget.metadata),
  // aucune validation de forme ici : chaque client (youtube.ts, etc.)
  // n'applique que les clés qu'il connaît et retombe sur ses valeurs par
  // défaut pour le reste.
  metadata: z.record(z.any()).optional()
});
const bodySchema = z.object({
  brandId: z.string(),
  title: z.string().default(""),
  caption: z.string().default(""),
  firstComment: z.string().max(2200).optional(),
  scheduledAt: z.string().datetime().optional(),
  mediaAssetIds: z.array(z.string()).default([]),
  targets: z.array(targetSchema).min(1),
  publishNow: z.boolean().default(false)
});

// GET /api/posts?brandId=... — liste (utilisé par le calendrier)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  // Appartenance vérifiée côté serveur : sans ça, n'importe quel compte
  // connecté pouvait lister les publications (et, avant le `select` ci-dessous,
  // les jetons OAuth) de n'importe quelle marque en devinant son brandId.
  const userId = (session.user as { id: string }).id;
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  const posts = await prisma.post.findMany({
    where: { brandId },
    include: {
      media: { include: { mediaAsset: true } },
      targets: { include: { connection: { select: PUBLIC_CONNECTION_SELECT } } }
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }]
  });

  return NextResponse.json({ posts });
}

// POST /api/posts — crée UNE publication (éventuellement multi-médias pour
// un carrousel), distribuée vers un ou plusieurs réseaux cibles. Envoyée
// immédiatement si publishNow=true et aucune scheduledAt, sinon programmée
// pour le worker planifié.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { brandId, title, caption, firstComment, scheduledAt, mediaAssetIds, targets, publishNow } = parsed.data;
  const userId = (session.user as { id: string }).id;

  // 1) La marque doit être une des marques de l'utilisateur.
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  // 2) Les comptes ciblés et les médias joints doivent appartenir à CETTE
  // marque : sinon, en envoyant le connectionId d'un compte social d'une
  // autre marque avec publishNow, on publierait sur ce compte-là avec ses
  // jetons — c'est la faille la plus grave de l'ancienne version.
  const connectionIds = Array.from(new Set(targets.map((t) => t.connectionId)));
  const okConnections = await prisma.socialConnection.count({
    where: { id: { in: connectionIds }, brandId }
  });
  if (okConnections !== connectionIds.length) {
    return NextResponse.json({ error: "Un des comptes ciblés n'appartient pas à cette marque." }, { status: 400 });
  }
  const assetIds = Array.from(new Set(mediaAssetIds));
  if (assetIds.length > 0) {
    const okAssets = await prisma.mediaAsset.count({ where: { id: { in: assetIds }, brandId } });
    if (okAssets !== assetIds.length) {
      return NextResponse.json({ error: "Un des médias n'appartient pas à cette marque." }, { status: 400 });
    }
  }

  // Marque au-delà de la limite du palier (fin d'essai, rétrogradation) :
  // lecture seule — brief growth, lot G2.a. `reason` ouvre la bonne modale.
  const writable = await assertBrandWritable(brandId);
  if (!writable.ok) return NextResponse.json({ error: writable.message, reason: "second_brand" }, { status: 402 });

  try {
    await assertPostQuota(brandId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, reason: "post_quota" }, { status: 402 });
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : undefined;
  const status = scheduledDate ? "SCHEDULED" : publishNow ? "PUBLISHING" : "DRAFT";

  const post = await prisma.post.create({
    data: {
      brandId,
      createdById: userId,
      title,
      caption,
      firstComment: firstComment?.trim() || null,
      status,
      scheduledAt: scheduledDate,
      media: { create: mediaAssetIds.map((id, order) => ({ mediaAssetId: id, order })) },
      targets: {
        create: targets.map((t) => ({
          connectionId: t.connectionId,
          network: t.network,
          titleOverride: t.titleOverride,
          captionOverride: t.captionOverride,
          metadata: t.metadata,
          status: scheduledDate ? "SCHEDULED" : "PENDING"
        }))
      }
    }
  });

  let milestone: number | null = null;
  // "publishedStatus" ci-dessous : uniquement pour que le Composer sache si
  // la publication immédiate a vraiment réussi (PUBLISHED) — utilisé pour le
  // son de décollage optionnel (voir cosmic-audio.ts / easter egg
  // "publish-sound-unlock") — jamais pour l'affichage lui-même, qui repart
  // toujours vers /posts/[id] qui a sa propre vérité.
  let publishedStatus: string | null = null;
  if (!scheduledDate && publishNow) {
    // Erreurs déjà enregistrées par cible (voir publishPost) — seul le
    // palier franchi, s'il y en a un, doit remonter jusqu'ici pour
    // déclencher l'animation côté client.
    await publishPost(post.id)
      .then((r) => {
        milestone = r.milestone;
        publishedStatus = r.status;
      })
      .catch(() => undefined);
  }

  return NextResponse.json({ ok: true, postId: post.id, milestone, status: publishedStatus });
}
