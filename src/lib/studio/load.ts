// Studio IA — lecture en base des données d'une marque, puis calcul des
// faits (facts.ts). Serveur uniquement.
//
// Sources : statistiques par publication (PostMetric, synchronisées par
// Engagements), analyses de rétention déjà faites (VideoInsight, page
// Rétention IA), meilleurs créneaux (mêmes règles que la Vue d'ensemble),
// dates des publications envoyées par Nebula.
import { prisma } from "@/lib/prisma";
import { getAnalyticsInsights } from "@/lib/server-data/brand-data";
import { NETWORKS, type Network } from "@/lib/types";
import { STUDIO_WINDOW_DAYS, computeStudioFacts, type MetricRow, type RetentionRow, type StudioFacts } from "./facts";

const DAY = 86_400_000;

function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

const isNetwork = (n: string): n is Network => (NETWORKS as readonly string[]).includes(n);

export async function loadStudioFacts(brandId: string, now: Date = new Date()): Promise<StudioFacts> {
  // Les comptes déconnectés gardent leur historique de chiffres, mais ne
  // comptent pas comme réseaux « connectés » (idées proposées pour eux).
  const connections = (await prisma.socialConnection.findMany({ where: { brandId }, select: { id: true, network: true, status: true } })) as { id: string; network: string; status: string }[];
  const ids = connections.map((c) => c.id);
  const since = new Date(now.getTime() - STUDIO_WINDOW_DAYS * DAY);

  const [metrics, insights, targets, slots] = await Promise.all([
    ids.length
      ? (prisma.postMetric.findMany({
          where: { connectionId: { in: ids }, publishedAt: { gte: since } },
          select: { network: true, title: true, permalink: true, thumbnailUrl: true, publishedAt: true, views: true, likes: true, comments: true, shares: true },
          orderBy: { publishedAt: "desc" },
          take: 400
        }) as Promise<(Omit<MetricRow, "network"> & { network: string })[]>)
      : Promise.resolve([]),
    // Analyses rattachées à un compte de la marque, ou à une de ses publications.
    prisma.videoInsight.findMany({
      where: { OR: [...(ids.length ? [{ connectionId: { in: ids } }] : []), { postTarget: { post: { brandId } } }] },
      select: { retentionCurve: true, recommendations: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10
    }) as Promise<{ retentionCurve: string; recommendations: string; createdAt: Date }[]>,
    prisma.postTarget.findMany({
      where: { status: "PUBLISHED", publishedAt: { not: null }, post: { brandId } },
      select: { postId: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 120
    }) as Promise<{ postId: string; publishedAt: Date | null }[]>,
    getAnalyticsInsights(brandId).catch(() => null)
  ]);

  // Une publication envoyée sur plusieurs réseaux compte une fois (sa première mise en ligne).
  const firstByPost = new Map<string, Date>();
  for (const t of targets) {
    if (!t.publishedAt) continue;
    const prev = firstByPost.get(t.postId);
    if (!prev || t.publishedAt < prev) firstByPost.set(t.postId, t.publishedAt);
  }

  const retention: RetentionRow[] = insights.map((i) => ({
    curve: parseJson<{ timeRatio: number; watchRatio: number }[]>(i.retentionCurve, []).filter((p) => typeof p?.timeRatio === "number" && typeof p?.watchRatio === "number"),
    notes: parseJson<unknown[]>(i.recommendations, []).filter((r): r is string => typeof r === "string"),
    createdAt: new Date(i.createdAt)
  }));

  return computeStudioFacts({
    metrics: metrics.filter((m) => isNetwork(m.network)).map((m) => ({ ...m, network: m.network as Network })),
    retention,
    bestSlots: (slots?.perNetwork ?? [])
      .filter((s: { network: string; bestHour: number | null }) => s.bestHour !== null && isNetwork(s.network))
      .map((s: { network: string; bestHour: number | null }) => ({ network: s.network as Network, hour: s.bestHour as number })),
    publishedDates: Array.from(firstByPost.values()),
    connectedNetworks: connections.filter((c) => c.status !== "DISCONNECTED").map((c) => c.network).filter(isNetwork),
    now
  });
}
