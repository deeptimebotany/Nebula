import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const WEEKDAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/**
 * Widget "Insights IA" du tableau de bord : recommande de meilleurs créneaux
 * de publication à partir de VOS VRAIES données — les AnalyticsSnapshot déjà
 * capturées (followersDelta, engagementRate) et l'historique réel de vos
 * publications (Post.scheduledAt). Aucune statistique inventée : si
 * l'historique est trop court pour être significatif, on le dit clairement
 * plutôt que d'afficher un conseil générique déguisé en donnée personnelle.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  const [connections, publishedPosts] = await Promise.all([
    prisma.socialConnection.findMany({
      where: { brandId },
      select: { id: true, network: true, analytics: { select: { capturedAt: true, followersDelta: true, engagementRate: true } } }
    }),
    prisma.post.findMany({
      where: { brandId, status: { in: ["PUBLISHED", "PARTIAL"] }, scheduledAt: { not: null } },
      select: { scheduledAt: true }
    })
  ]);

  const snapshots = connections.flatMap((c: { analytics: { capturedAt: Date; followersDelta: number; engagementRate: number }[] }) => c.analytics);

  const MIN_SNAPSHOTS = 5;
  const MIN_POSTS = 3;

  // 1. Meilleur créneau selon la croissance réelle (followersDelta) autour de
  // chaque capture — regroupé par heure de la journée.
  let bestHour: number | null = null;
  let bestHourScore: number | null = null;
  if (snapshots.length >= MIN_SNAPSHOTS) {
    const byHour = new Map<number, { total: number; count: number }>();
    for (const s of snapshots) {
      const h = new Date(s.capturedAt).getHours();
      const bucket = byHour.get(h) ?? { total: 0, count: 0 };
      bucket.total += s.followersDelta + s.engagementRate;
      bucket.count += 1;
      byHour.set(h, bucket);
    }
    let best: { hour: number; avg: number } | null = null;
    for (const [hour, { total, count }] of byHour) {
      const avg = total / count;
      if (!best || avg > best.avg) best = { hour, avg };
    }
    if (best) {
      bestHour = best.hour;
      bestHourScore = Math.round(best.avg * 10) / 10;
    }
  }

  // 2. Jour de la semaine où vous publiez le plus souvent — descriptif, tiré
  // de votre propre historique réel de publications envoyées.
  let topWeekday: string | null = null;
  let topWeekdayCount = 0;
  if (publishedPosts.length >= MIN_POSTS) {
    const byDay = new Map<number, number>();
    for (const p of publishedPosts) {
      if (!p.scheduledAt) continue;
      const d = new Date(p.scheduledAt).getDay();
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    let best: { day: number; count: number } | null = null;
    for (const [day, count] of byDay) {
      if (!best || count > best.count) best = { day, count };
    }
    if (best) {
      topWeekday = WEEKDAYS_FR[best.day];
      topWeekdayCount = best.count;
    }
  }

  const hasEnoughData = bestHour !== null || topWeekday !== null;

  return NextResponse.json({
    hasEnoughData,
    sampleSize: { snapshots: snapshots.length, posts: publishedPosts.length },
    minRequired: { snapshots: MIN_SNAPSHOTS, posts: MIN_POSTS },
    bestHour,
    bestHourScore,
    topWeekday,
    topWeekdayCount
  });
}
