// Création d'une publication — partagée par Publier (/api/posts) et l'API
// publique v1 (/api/v1/posts), pour que les deux appliquent exactement les
// mêmes règles (lot 4, 25/09/2026) : comptes et médias de la même marque,
// marque en écriture, quota de publications, jamais de date passée.
import { refreshReussites } from "@/lib/reussites/engine";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publishPost } from "@/lib/publish";
import { assertPostQuota } from "@/lib/billing/plan";
import { assertBrandWritable } from "@/lib/billing/trial-expiry";
import { PAST_SCHEDULE_ERROR, isPastSchedule } from "@/lib/schedule-guard";
import { emitWebhookEvent, postPayload } from "@/lib/webhooks";

export interface CreatePostTarget {
  connectionId: string;
  network: string;
  titleOverride?: string;
  captionOverride?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePostInput {
  brandId: string;
  title: string;
  caption: string;
  firstComment?: string;
  scheduledAt?: string;
  mediaAssetIds: string[];
  targets: CreatePostTarget[];
  publishNow: boolean;
}

export type CreatePostResult =
  | { ok: true; postId: string; milestone: number | null; status: string | null }
  | { ok: false; status: number; error: string; reason?: string };

/** L'appartenance de userId à la marque doit avoir été vérifiée par l'appelant. */
export async function createPost(userId: string, input: CreatePostInput): Promise<CreatePostResult> {
  const { brandId, title, caption, firstComment, scheduledAt, mediaAssetIds, targets, publishNow } = input;

  // Les comptes ciblés et les médias joints doivent appartenir à CETTE
  // marque : sinon, en envoyant le connectionId d'un compte social d'une
  // autre marque avec publishNow, on publierait sur ce compte-là avec ses
  // jetons.
  const connectionIds = Array.from(new Set(targets.map((t) => t.connectionId)));
  const okConnections = await prisma.socialConnection.count({ where: { id: { in: connectionIds }, brandId } });
  if (okConnections !== connectionIds.length) {
    return { ok: false, status: 400, error: "Un des comptes ciblés n'appartient pas à cette marque." };
  }
  const assetIds = Array.from(new Set(mediaAssetIds));
  if (assetIds.length > 0) {
    const okAssets = await prisma.mediaAsset.count({ where: { id: { in: assetIds }, brandId } });
    if (okAssets !== assetIds.length) {
      return { ok: false, status: 400, error: "Un des médias n'appartient pas à cette marque." };
    }
  }

  // Marque au-delà de la limite du palier (fin d'essai, rétrogradation) :
  // lecture seule — brief growth, lot G2.a.
  const writable = await assertBrandWritable(brandId);
  if (!writable.ok) return { ok: false, status: 402, error: writable.message, reason: "second_brand" };

  try {
    await assertPostQuota(brandId);
  } catch (err) {
    return { ok: false, status: 402, error: (err as Error).message, reason: "post_quota" };
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : undefined;
  // Jamais de programmation dans le passé (voir src/lib/schedule-guard.ts).
  if (scheduledDate && isPastSchedule(scheduledDate)) {
    return { ok: false, status: 400, error: PAST_SCHEDULE_ERROR, reason: "past_schedule" };
  }
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
          metadata: t.metadata as Prisma.InputJsonValue | undefined,
          status: scheduledDate ? "SCHEDULED" : "PENDING"
        }))
      }
    }
  });

  // Webhooks (lot 4) : création, et programmation le cas échéant. Une
  // publication immédiate enverra post.published / post.failed.
  if (!(publishNow && !scheduledDate)) {
    const payload = await postPayload(post.id);
    await emitWebhookEvent(brandId, "post.created", payload);
    if (scheduledDate) await emitWebhookEvent(brandId, "post.scheduled", payload);
  }

  let milestone: number | null = null;
  let publishedStatus: string | null = null;
  if (!scheduledDate && publishNow) {
    // Erreurs déjà enregistrées par cible (voir publishPost).
    await publishPost(post.id)
      .then((r) => {
        milestone = r.milestone;
        publishedStatus = r.status;
      })
      .catch(() => undefined);
  }
  // Réussites : une publication programmée peut valider « Prévoyant » ou un
  // défi de la semaine (une publication immédiate est évaluée par publishPost).
  if (scheduledDate) await refreshReussites(userId);
  return { ok: true, postId: post.id, milestone, status: publishedStatus };
}
