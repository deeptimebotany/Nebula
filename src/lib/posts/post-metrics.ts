// Statistiques d'UNE publication (24/09/2026) : pour chaque réseau où elle
// est en ligne, les chiffres relevés par la page Engagements (PostMetric :
// vues, j'aime, commentaires, partages, enregistrements).
//
// PostMetric n'est pas relié directement à la publication : on retrouve la
// bonne ligne par le compte (connectionId) et, dans l'ordre :
//   1. l'identifiant renvoyé à la publication (PostTarget.externalPostId) ;
//   2. l'identifiant présent dans le lien public (TikTok : le numéro de la
//      vidéo, différent de l'identifiant de publication) ;
//   3. à défaut, la publication de ce compte mise en ligne le plus près de
//      la même heure (± 20 minutes) — cas de Facebook Reels, dont
//      l'identifiant de vidéo diffère de celui de la publication.
import { prisma } from "@/lib/prisma";
import type { Network } from "@/lib/types";

export interface MetricValues {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

export interface TargetMetrics {
  targetId: string;
  network: Network;
  status: string;
  account: { id: string; name: string; handle: string | null };
  url: string | null;
  publishedAt: string | null;
  error: string | null;
  metrics: (MetricValues & { capturedAt: string; previous: MetricValues | null; previousAt: string | null }) | null;
  /** Relevé des statistiques de ce compte (page Engagements) disponible pour ce réseau. */
  lastSyncedAt: string | null;
}

export interface PostMetricsDTO {
  postId: string;
  brandId: string;
  status: string;
  targets: TargetMetrics[];
  totals: MetricValues & { engagementRate: number | null };
  /** Au moins un réseau en ligne sans chiffres : proposer d'actualiser. */
  missing: number;
}

const MATCH_WINDOW_MS = 20 * 60_000;

interface MetricRow extends MetricValues {
  id: string;
  connectionId: string;
  postExternalId: string;
  permalink: string | null;
  publishedAt: Date | null;
  capturedAt: Date;
  prevViews: number | null;
  prevLikes: number | null;
  prevComments: number | null;
  prevShares: number | null;
  prevSaves: number | null;
  prevCapturedAt: Date | null;
}

/** Identifiant numérique en fin de lien public (ex. …/video/7300112233). */
function idFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = /\/(?:video|reel|p|pin|shorts)\/([A-Za-z0-9_-]+)/.exec(url) ?? /watch\?v=([A-Za-z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}

export async function postMetricsFor(postId: string, userId: string): Promise<PostMetricsDTO | null> {
  const post = (await prisma.post.findFirst({
    where: { id: postId, brand: { memberships: { some: { userId } } } },
    select: {
      id: true,
      brandId: true,
      status: true,
      targets: {
        select: {
          id: true,
          network: true,
          status: true,
          externalPostId: true,
          externalUrl: true,
          publishedAt: true,
          errorMessage: true,
          connectionId: true,
          connection: { select: { id: true, displayName: true, handle: true, lastMetricsSyncedAt: true } }
        }
      }
    }
  })) as {
    id: string;
    brandId: string;
    status: string;
    targets: {
      id: string;
      network: string;
      status: string;
      externalPostId: string | null;
      externalUrl: string | null;
      publishedAt: Date | null;
      errorMessage: string | null;
      connectionId: string;
      connection: { id: string; displayName: string; handle: string | null; lastMetricsSyncedAt: Date | null };
    }[];
  } | null;
  if (!post) return null;

  const connectionIds = Array.from(new Set(post.targets.map((t) => t.connectionId)));
  const rows = connectionIds.length
    ? ((await prisma.postMetric.findMany({ where: { connectionId: { in: connectionIds } } })) as unknown as MetricRow[])
    : [];

  const targets: TargetMetrics[] = post.targets.map((t) => {
    const mine = rows.filter((r) => r.connectionId === t.connectionId);
    const urlId = idFromUrl(t.externalUrl);
    let row =
      (t.externalPostId ? mine.find((r) => r.postExternalId === t.externalPostId) : undefined) ??
      (urlId ? mine.find((r) => r.postExternalId === urlId || r.postExternalId.endsWith(`_${urlId}`)) : undefined) ??
      (t.externalUrl ? mine.find((r) => r.permalink && r.permalink.split("?")[0] === t.externalUrl!.split("?")[0]) : undefined);
    if (!row && t.status === "PUBLISHED" && t.publishedAt) {
      const at = t.publishedAt.getTime();
      const near = mine
        .filter((r) => r.publishedAt && Math.abs(r.publishedAt.getTime() - at) <= MATCH_WINDOW_MS)
        .sort((a, b) => Math.abs(a.publishedAt!.getTime() - at) - Math.abs(b.publishedAt!.getTime() - at));
      row = near[0];
    }
    return {
      targetId: t.id,
      network: t.network as Network,
      status: t.status,
      account: { id: t.connection.id, name: t.connection.displayName, handle: t.connection.handle },
      url: t.externalUrl ?? row?.permalink ?? null,
      publishedAt: t.publishedAt ? t.publishedAt.toISOString() : null,
      error: t.errorMessage,
      lastSyncedAt: t.connection.lastMetricsSyncedAt ? t.connection.lastMetricsSyncedAt.toISOString() : null,
      metrics: row
        ? {
            views: row.views,
            likes: row.likes,
            comments: row.comments,
            shares: row.shares,
            saves: row.saves,
            capturedAt: row.capturedAt.toISOString(),
            previous: row.prevCapturedAt
              ? { views: row.prevViews, likes: row.prevLikes, comments: row.prevComments, shares: row.prevShares, saves: row.prevSaves }
              : null,
            previousAt: row.prevCapturedAt ? row.prevCapturedAt.toISOString() : null
          }
        : null
    };
  });

  const sum = (k: keyof MetricValues) => {
    const values = targets.map((t) => t.metrics?.[k]).filter((v): v is number => typeof v === "number");
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const totals = { views: sum("views"), likes: sum("likes"), comments: sum("comments"), shares: sum("shares"), saves: sum("saves") };
  // Engagement : interactions ÷ vues, seulement sur les réseaux qui donnent les vues.
  const withViews = targets.filter((t) => t.metrics && typeof t.metrics.views === "number" && t.metrics.views > 0);
  const interactions = withViews.reduce((a, t) => a + (t.metrics!.likes ?? 0) + (t.metrics!.comments ?? 0) + (t.metrics!.shares ?? 0) + (t.metrics!.saves ?? 0), 0);
  const views = withViews.reduce((a, t) => a + (t.metrics!.views ?? 0), 0);

  return {
    postId: post.id,
    brandId: post.brandId,
    status: post.status,
    targets,
    totals: { ...totals, engagementRate: views > 0 ? Math.round((interactions / views) * 1000) / 10 : null },
    missing: targets.filter((t) => t.status === "PUBLISHED" && !t.metrics).length
  };
}
