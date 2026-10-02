// Enregistrement des relevés d'un compte connecté (Réussites v3, 02/10/2026) :
// partagé par les boutons « Actualiser » (/api/engagements/sync,
// /api/analytics/sync) et la synchro quotidienne automatique (auto-sync.ts).
import { prisma } from "@/lib/prisma";
import type { AnalyticsResult } from "@/lib/types";
import type { PostMetricInput } from "./base";

interface ConnectionRow {
  id: string;
  network: string;
}

/**
 * Métriques par publication (PostMetric) : les valeurs précédentes passent
 * dans prev* (évolution depuis le dernier relevé). Rétention et durée
 * (YouTube) : gardées si le réseau ne les renvoie pas cette fois.
 */
export async function savePostMetrics(connection: ConnectionRow, inputs: PostMetricInput[], now: Date = new Date()): Promise<number> {
  for (const input of inputs) {
    const existing = await prisma.postMetric.findUnique({
      where: { connectionId_postExternalId: { connectionId: connection.id, postExternalId: input.postExternalId } }
    });
    const values = {
      title: input.title ?? existing?.title ?? null,
      permalink: input.permalink ?? existing?.permalink ?? null,
      thumbnailUrl: input.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
      publishedAt: input.publishedAt ?? existing?.publishedAt ?? null,
      views: input.views ?? null,
      likes: input.likes ?? null,
      comments: input.comments ?? null,
      shares: input.shares ?? null,
      saves: input.saves ?? null,
      avgViewPct: input.avgViewPct ?? existing?.avgViewPct ?? null,
      durationSeconds: input.durationSeconds ?? existing?.durationSeconds ?? null,
      capturedAt: now
    };
    if (existing) {
      await prisma.postMetric.update({
        where: { id: existing.id },
        data: {
          ...values,
          prevViews: existing.views,
          prevLikes: existing.likes,
          prevComments: existing.comments,
          prevShares: existing.shares,
          prevSaves: existing.saves,
          prevCapturedAt: existing.capturedAt
        }
      });
    } else {
      await prisma.postMetric.create({
        data: { connectionId: connection.id, network: connection.network, postExternalId: input.postExternalId, ...values }
      });
    }
  }
  await prisma.socialConnection.update({ where: { id: connection.id }, data: { lastMetricsSyncedAt: now } });
  return inputs.length;
}

/** Statistiques du compte (AnalyticsSnapshot : abonnés, portée, impressions…). */
export async function saveAnalyticsSnapshot(connection: ConnectionRow, analytics: AnalyticsResult, now: Date = new Date()): Promise<void> {
  await prisma.analyticsSnapshot.create({
    data: {
      connectionId: connection.id,
      network: connection.network,
      capturedAt: now,
      followers: analytics.followers,
      followersDelta: analytics.followersDelta,
      engagementRate: analytics.engagementRate,
      impressions: analytics.impressions,
      reach: analytics.reach,
      postsCount: analytics.postsCount,
      raw: analytics.raw ? JSON.stringify(analytics.raw) : null
    }
  });
  await prisma.socialConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: now, lastError: null } });
}
