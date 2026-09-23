import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import type { Network } from "@/lib/types";
import { METRIC_KEYS, NETWORK_METRIC_SUPPORT, type MetricKey } from "@/lib/engagement-metrics";

// Page /engagements — les MÉTRIQUES d'engagement (vues, likes, commentaires,
// partages, enregistrements) de toutes les publications synchronisées des
// comptes d'une marque (voir PostMetric dans schema.prisma et
// /api/engagements/sync pour l'actualisation). Distinct de /api/engagement
// (le TEXTE des commentaires, page /comments).
//
// Le serveur calcule les totaux et la répartition par réseau : le navigateur
// ne fait qu'afficher, et un compte en plus n'y change rien.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  const connections = await prisma.socialConnection.findMany({
    where: { brandId, brand: ownedBy(userId) },
    orderBy: { connectedAt: "asc" }
  });

  const metrics = await prisma.postMetric.findMany({
    where: { connectionId: { in: connections.map((c) => c.id) } },
    orderBy: [{ publishedAt: "desc" }],
    take: 400
  });

  const sum = (rows: typeof metrics, key: MetricKey) => rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
  const prevKey = (key: MetricKey) => `prev${key.charAt(0).toUpperCase()}${key.slice(1)}` as "prevViews" | "prevLikes" | "prevComments" | "prevShares" | "prevSaves";
  // Delta « depuis la dernière actualisation » : seulement sur les
  // publications qui ont une valeur précédente (sinon un nouveau post ferait
  // exploser le delta).
  const delta = (rows: typeof metrics, key: MetricKey) =>
    rows.reduce((acc, r) => {
      const prev = r[prevKey(key)];
      const cur = r[key];
      return prev === null || cur === null ? acc : acc + (cur - prev);
    }, 0);

  const totals = Object.fromEntries(METRIC_KEYS.map((k) => [k, { value: sum(metrics, k), delta: delta(metrics, k) }]));

  const byNetwork = (["YOUTUBE", "INSTAGRAM", "FACEBOOK", "TIKTOK"] as Network[])
    .map((network) => {
      const rows = metrics.filter((m) => m.network === network);
      return {
        network,
        posts: rows.length,
        accounts: connections.filter((c) => c.network === network).length,
        supports: NETWORK_METRIC_SUPPORT[network],
        totals: Object.fromEntries(METRIC_KEYS.map((k) => [k, sum(rows, k)]))
      };
    })
    .filter((n) => n.accounts > 0);

  const lastSyncedAt = connections.map((c) => c.lastMetricsSyncedAt).filter(Boolean).sort().at(-1) ?? null;

  return NextResponse.json({
    connections: connections.map((c) => ({
      id: c.id,
      network: c.network,
      displayName: c.displayName,
      handle: c.handle,
      status: c.status,
      lastSyncedAt: c.lastMetricsSyncedAt,
      supportsMetrics: Boolean(getSocialClient(c.network as Network).fetchPostMetrics)
    })),
    totals,
    byNetwork,
    lastSyncedAt,
    posts: metrics.map((m) => ({
      id: m.id,
      connectionId: m.connectionId,
      network: m.network,
      postExternalId: m.postExternalId,
      title: m.title,
      permalink: m.permalink,
      thumbnailUrl: m.thumbnailUrl,
      publishedAt: m.publishedAt,
      views: m.views,
      likes: m.likes,
      comments: m.comments,
      shares: m.shares,
      saves: m.saves,
      prevViews: m.prevViews,
      prevLikes: m.prevLikes,
      prevComments: m.prevComments,
      prevShares: m.prevShares,
      prevSaves: m.prevSaves,
      capturedAt: m.capturedAt
    }))
  });
}
