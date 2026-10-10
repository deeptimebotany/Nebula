// Bilan du mois (03/10/2026) : chargement des relevés d'une marque pour un
// mois, puis calcul (build.ts). Serveur uniquement. Aucune donnée inventée :
// seulement ce que Nebula a relevé par les API officielles.
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/billing/plan";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { findTier, levelName, rankAt } from "@/lib/reussites/catalog";
import { buildSummary, type NebulaTargetIn, type PostMetricIn, type SnapIn } from "./build";
import { monthBounds, monthKeyOf, nextMonth, previousMonth, type MonthKey } from "./period";
import type { MonthlySummaryData } from "./types";

const DAY = 86_400_000;

/** Total actuel des clics de la page bio de la marque (null sans page). */
export async function bioClicksTotal(brandId: string): Promise<number | null> {
  const page = await prisma.linkPage.findUnique({ where: { brandId }, select: { links: { select: { clicks: true } } } });
  if (!page) return null;
  return page.links.reduce((s: number, l: { clicks: number }) => s + l.clicks, 0);
}

/** Réussites du mois pour un compte : XP, missions, badges, rang. */
async function reussitesOf(userId: string, start: Date, end: Date): Promise<MonthlySummaryData["reussites"]> {
  const [unlocks, completions, user] = await Promise.all([
    prisma.achievementUnlock.findMany({ where: { userId, unlockedAt: { gte: start, lt: end } }, select: { key: true, xp: true } }),
    prisma.challengeCompletion.findMany({ where: { userId, completedAt: { gte: start, lt: end } }, select: { kind: true, xp: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { creatorXp: true, creatorLevel: true } })
  ]);
  const xp = unlocks.reduce((s: number, u: { xp: number }) => s + u.xp, 0) + completions.reduce((s: number, c: { xp: number }) => s + c.xp, 0);
  const missions = completions.filter((c: { kind: string }) => c.kind === "MISSION").length;
  const badges: string[] = [];
  for (const u of unlocks as { key: string }[]) {
    const rank = /^rank-(\d+)$/.exec(u.key);
    if (rank) badges.push(`rang ${levelName(Number(rank[1]))}`);
    else {
      const tier = findTier(u.key);
      if (tier) badges.push(tier.title);
    }
  }
  if (xp === 0 && missions === 0 && badges.length === 0) return null;
  const progress = user ? rankAt(user.creatorXp, user.creatorLevel) : null;
  return {
    xp,
    missions,
    badges: badges.slice(0, 3),
    rank: progress?.name ?? null,
    nextRank: progress?.nextName ?? null,
    xpToNext: progress?.nextXp != null ? Math.max(0, progress.nextXp - progress.xp) : null
  };
}

/**
 * Bilan d'une marque pour un mois. `userId` : la personne qui le reçoit
 * (palier, Réussites) ; `withReussites` : ses Réussites ne figurent que
 * dans un de ses bilans (elles ne dépendent pas de la marque).
 */
export async function loadMonthlySummary(brandId: string, month: MonthKey, opts: { userId: string; withReussites?: boolean }): Promise<MonthlySummaryData | null> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true, slug: true, timezone: true } });
  if (!brand) return null;
  const tz = brand.timezone || DEFAULT_TIMEZONE;
  const { start, end } = monthBounds(month, tz);
  const prevStart = monthBounds(previousMonth(month), tz).start;
  const next = monthBounds(nextMonth(month), tz);
  // Relevés : un peu avant le mois précédent, pour la valeur de départ des compteurs.
  const from = new Date(prevStart.getTime() - 10 * DAY);

  // Comptes déconnectés exclus (10/10/2026) : leurs chiffres sont effacés.
  const connections = (await prisma.socialConnection.findMany({
    where: { brandId, status: { not: "DISCONNECTED" } },
    select: { id: true, network: true, displayName: true, handle: true },
    orderBy: { connectedAt: "asc" }
  })) as { id: string; network: string; displayName: string; handle: string | null }[];
  const ids = connections.map((c) => c.id);

  const [snapshots, metrics, targets, scheduled, comments, replies, bioTotal, lastSummary, upsell, reussites] = await Promise.all([
    prisma.analyticsSnapshot.findMany({
      where: { connectionId: { in: ids }, capturedAt: { gte: from, lt: end } },
      select: { connectionId: true, capturedAt: true, followers: true, impressions: true },
      orderBy: { capturedAt: "asc" }
    }) as Promise<SnapIn[]>,
    prisma.postMetric.findMany({
      where: { connectionId: { in: ids }, publishedAt: { gte: prevStart, lt: end } },
      select: { connectionId: true, postExternalId: true, title: true, permalink: true, thumbnailUrl: true, publishedAt: true, views: true, likes: true, comments: true, shares: true, saves: true, durationSeconds: true }
    }),
    prisma.postTarget.findMany({
      where: { connectionId: { in: ids }, status: "PUBLISHED", publishedAt: { gte: prevStart, lt: end } },
      select: {
        postId: true,
        connectionId: true,
        externalPostId: true,
        externalUrl: true,
        publishedAt: true,
        post: { select: { title: true, caption: true, media: { orderBy: { order: "asc" }, take: 1, select: { mediaAsset: { select: { type: true, url: true, thumbnailUrl: true } } } } } }
      }
    }),
    prisma.post.findMany({ where: { brandId, status: "SCHEDULED", scheduledAt: { gte: next.start, lt: next.end } }, select: { scheduledAt: true } }),
    prisma.engagementItem.count({ where: { connectionId: { in: ids }, type: "COMMENT", publishedAt: { gte: start, lt: end } } }),
    prisma.engagementItem.count({ where: { connectionId: { in: ids }, type: "COMMENT", ownerRepliedAt: { gte: start, lt: end } } }),
    bioClicksTotal(brandId),
    prisma.monthlySummary.findFirst({ where: { brandId, bioClicks: { not: null }, month: { lt: month } }, orderBy: { month: "desc" }, select: { bioClicks: true } }),
    getUserPlan(opts.userId)
      .then((p) => !p.paid && !p.comp)
      .catch(() => false),
    opts.withReussites ? reussitesOf(opts.userId, start, end) : Promise.resolve(null)
  ]);

  const postMetrics: PostMetricIn[] = (metrics as (Omit<PostMetricIn, "publishedAt"> & { publishedAt: Date | null })[])
    .filter((m): m is PostMetricIn => m.publishedAt instanceof Date)
    .map((m) => ({ ...m }));
  const targetRows: NebulaTargetIn[] = (
    targets as {
      postId: string;
      connectionId: string;
      externalPostId: string | null;
      externalUrl: string | null;
      publishedAt: Date | null;
      post: { title: string; caption: string; media: { mediaAsset: { type: string; url: string; thumbnailUrl: string | null } }[] };
    }[]
  )
    .filter((t) => t.publishedAt instanceof Date)
    .map((t) => {
      const media = t.post.media[0]?.mediaAsset ?? null;
      return {
        postId: t.postId,
        connectionId: t.connectionId,
        externalPostId: t.externalPostId,
        externalUrl: t.externalUrl,
        publishedAt: t.publishedAt as Date,
        mediaType: media?.type ?? null,
        title: t.post.title || t.post.caption.split("\n")[0] || "",
        thumbnailUrl: media ? media.thumbnailUrl || (media.type === "IMAGE" ? media.url : null) : null
      };
    });

  return buildSummary({
    month,
    tz,
    brand: { id: brand.id, name: brand.name, slug: brand.slug },
    accounts: connections.map((c) => ({ id: c.id, network: c.network, name: c.handle ? `@${c.handle.replace(/^@/, "")}` : c.displayName })),
    upsell,
    snapshots,
    postMetrics,
    targets: targetRows,
    scheduledNext: (scheduled as { scheduledAt: Date | null }[]).map((p) => p.scheduledAt).filter((d): d is Date => d instanceof Date),
    community: comments > 0 || replies > 0 ? { comments, replies } : null,
    bio: bioTotal !== null && bioTotal > 0 ? { total: bioTotal, delta: lastSummary?.bioClicks != null ? Math.max(0, bioTotal - lastSummary.bioClicks) : null } : null,
    reussites,
    appOrigin: (process.env.NEXTAUTH_URL || "https://nebulahub.space").replace(/\/$/, "")
  });
}

/**
 * Mois qui ont des données pour la marque (premier relevé ou première mise en
 * ligne), du plus récent au plus ancien, 12 au plus, mois en cours compris.
 */
export async function availableMonths(brandId: string, current: MonthKey): Promise<MonthKey[]> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { timezone: true } });
  const tz = brand?.timezone || DEFAULT_TIMEZONE;
  const [snap, target, metric] = await Promise.all([
    prisma.analyticsSnapshot.findFirst({ where: { connection: { brandId } }, orderBy: { capturedAt: "asc" }, select: { capturedAt: true } }),
    prisma.postTarget.findFirst({ where: { connection: { brandId }, status: "PUBLISHED", publishedAt: { not: null } }, orderBy: { publishedAt: "asc" }, select: { publishedAt: true } }),
    prisma.postMetric.findFirst({ where: { connection: { brandId }, publishedAt: { not: null } }, orderBy: { publishedAt: "asc" }, select: { publishedAt: true } })
  ]);
  const dates = [snap?.capturedAt, target?.publishedAt, metric?.publishedAt].filter((d): d is Date => d instanceof Date);
  if (dates.length === 0) return [current];
  const first = monthKeyOf(new Date(Math.min(...dates.map((d) => d.getTime()))), tz);
  const out: MonthKey[] = [];
  let m = current;
  while (out.length < 12) {
    out.push(m);
    if (m <= first) break;
    m = previousMonth(m);
  }
  return out;
}
