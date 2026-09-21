import { prisma } from "@/lib/prisma";
import { sendReportEmail } from "@/lib/email";

// Rapports clients automatiques (produit n°6 de la feuille de route) — voir
// BrandReport dans prisma/schema.prisma. Une marque n'a jamais plus d'un
// BrandReport (relation 1-1) : ce helper le crée à la volée au premier accès
// (depuis l'éditeur dans /reports), exactement comme getOrCreateLinkPage()
// pour la page "link in bio".
export async function getOrCreateBrandReport(brandId: string) {
  const existing = await prisma.brandReport.findUnique({ where: { brandId } });
  if (existing) return existing;
  return prisma.brandReport.create({ data: { brandId } });
}

export interface ReportData {
  brandId: string;
  periodDays: number;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  totals: {
    followers: number;
    followersDelta: number;
    avgEngagementRate: number;
    impressions: number;
    reach: number;
  };
  byNetwork: { network: string; followers: number; followersDelta: number }[];
  growthSeries: { date: string; followers: number }[];
  postsPublished: { id: string; title: string; network: string; publishedAt: string; url: string | null }[];
}

// Toujours recalculé à la volée à partir des données déjà collectées
// (AnalyticsSnapshot, Post/PostTarget) — jamais un instantané figé en base :
// la page publique reste donc à jour même entre deux envois email. "Delta"
// par réseau = comparaison entre le premier et le dernier instantané captés
// dans la fenêtre demandée (pas de baseline antérieure conservée).
export async function computeReportData(brandId: string, periodDays: number): Promise<ReportData> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const connections = await prisma.socialConnection.findMany({
    where: { brandId },
    select: {
      id: true,
      network: true,
      analytics: {
        where: { capturedAt: { gte: periodStart } },
        orderBy: { capturedAt: "asc" }
      }
    }
  });

  let followers = 0;
  let followersDelta = 0;
  let impressions = 0;
  let reach = 0;
  let engagementSum = 0;
  let engagementCount = 0;
  const byNetwork: { network: string; followers: number; followersDelta: number }[] = [];
  const growthByDay = new Map<string, number>();

  for (const conn of connections) {
    const snaps = conn.analytics;
    if (snaps.length === 0) continue;
    const latest = snaps[snaps.length - 1];
    const earliest = snaps[0];
    followers += latest.followers;
    followersDelta += latest.followers - earliest.followers;
    byNetwork.push({ network: conn.network, followers: latest.followers, followersDelta: latest.followers - earliest.followers });

    for (const s of snaps) {
      impressions += s.impressions;
      reach += s.reach;
      engagementSum += s.engagementRate;
      engagementCount += 1;
      const day = s.capturedAt.toISOString().slice(0, 10);
      growthByDay.set(day, (growthByDay.get(day) ?? 0) + s.followers);
    }
  }

  const growthSeries = Array.from(growthByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, followers: value }));

  const targets = await prisma.postTarget.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { gte: periodStart },
      connection: { brandId }
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
    select: {
      id: true,
      network: true,
      publishedAt: true,
      externalUrl: true,
      titleOverride: true,
      post: { select: { title: true } }
    }
  });

  const postsPublished = targets.map((t: {
    id: string;
    network: string;
    publishedAt: Date | null;
    externalUrl: string | null;
    titleOverride: string | null;
    post: { title: string };
  }) => ({
    id: t.id,
    title: t.titleOverride || t.post.title || "(sans titre)",
    network: t.network,
    publishedAt: (t.publishedAt as Date).toISOString(),
    url: t.externalUrl
  }));

  return {
    brandId,
    periodDays,
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    totals: {
      followers,
      followersDelta,
      avgEngagementRate: engagementCount > 0 ? engagementSum / engagementCount : 0,
      impressions,
      reach
    },
    byNetwork,
    growthSeries,
    postsPublished
  };
}

export function computeNextSendAt(frequency: string, from: Date = new Date()): Date | null {
  if (frequency === "WEEKLY") return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (frequency === "MONTHLY") return new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  return null;
}

function periodLabel(frequency: string): string {
  return frequency === "WEEKLY" ? "hebdomadaire" : "mensuel";
}

// Appelé par /api/cron (voir ce fichier) à chaque passage du scheduler, en
// plus de runDuePosts() : envoie un email de rappel pour chaque BrandReport
// activé dont l'échéance est arrivée, puis reprogramme la prochaine échéance.
// Best-effort par rapport : l'échec de l'un (email non configuré, Resend en
// panne...) ne bloque jamais les autres, et ne fait jamais échouer le cron
// dans son ensemble (voir runDuePosts pour la même logique côté publications).
export async function runDueReports(): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  const due = await prisma.brandReport.findMany({
    where: {
      enabled: true,
      frequency: { not: "OFF" },
      recipientEmail: { not: null },
      nextSendAt: { lte: now }
    },
    include: { brand: { select: { id: true, name: true } } }
  });

  let sent = 0;
  let failed = 0;

  for (const report of due) {
    try {
      const data = await computeReportData(report.brandId, report.periodDays);
      const baseUrl = process.env.NEXTAUTH_URL || "";
      const reportUrl = `${baseUrl}/rapport/${report.token}`;

      const result = await sendReportEmail({
        to: report.recipientEmail!,
        brandName: report.brand.name,
        reportUrl,
        periodLabel: periodLabel(report.frequency),
        followers: data.totals.followers,
        followersDelta: data.totals.followersDelta
      });

      if (result.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    } finally {
      await prisma.brandReport.update({
        where: { id: report.id },
        data: { lastSentAt: now, nextSendAt: computeNextSendAt(report.frequency, now) }
      });
    }
  }

  return { sent, failed };
}
