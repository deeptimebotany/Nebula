import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPost } from "@/lib/publish";
import { assertPostQuota } from "@/lib/billing/plan";
import { z } from "zod";

const targetSchema = z.object({
  connectionId: z.string(),
  network: z.string(),
  titleOverride: z.string().optional(),
  captionOverride: z.string().optional()
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

  const posts = await prisma.post.findMany({
    where: { brandId },
    include: { media: { include: { mediaAsset: true } }, targets: { include: { connection: true } } },
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

  try {
    await assertPostQuota(brandId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 402 });
  }

  const userId = (session.user as { id: string }).id;
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
          status: scheduledDate ? "SCHEDULED" : "PENDING"
        }))
      }
    }
  });

  let milestone: number | null = null;
  if (!scheduledDate && publishNow) {
    // Erreurs déjà enregistrées par cible (voir publishPost) — seul le
    // palier franchi, s'il y en a un, doit remonter jusqu'ici pour
    // déclencher l'animation côté client.
    milestone = await publishPost(post.id)
      .then((r) => r.milestone)
      .catch(() => null);
  }

  return NextResponse.json({ ok: true, postId: post.id, milestone });
}
