// Statistiques de groupe anonymes (29/09/2026) — lecture en base et
// enregistrement des résultats (table AnonStat). Calcul : aggregate.ts.
//
// Ne lit QUE les comptes qui ont donné leur accord (User.statsConsent) et,
// pour eux, QUE des données propres à Nebula : publications programmées
// (réseaux visés, date prévue, type des médias joints, longueur du texte,
// hashtags) et fonctions activées. Aucune table remplie par les API des
// réseaux (PostMetric, AnalyticsSnapshot, EngagementItem, VideoInsight…)
// n'est lue ici — le test tests/quality/anon-stats.test.ts le vérifie.
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { aggregateAnonStats, countHashtags, type AnonAccountRow, type AnonFormat, type AnonPostRow } from "@/lib/anon-stats/aggregate";

/** Mois « AAAA-MM » (UTC) → bornes [début, fin). */
export function monthBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function periodOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function localSlot(date: Date, timeZone: string): { weekday: number; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const weekday = WEEKDAY_INDEX[parts.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 0;
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
    return { weekday, hour };
  } catch {
    return { weekday: (date.getUTCDay() + 6) % 7, hour: date.getUTCHours() };
  }
}

/**
 * Lit les lignes d'un mois. Les identifiants de compte sont remplacés par
 * une empreinte salée au hasard À CHAQUE CALCUL : rien de ce qui sort d'ici
 * ne peut être relié à un compte, même d'un mois à l'autre.
 */
export async function loadAnonRows(period: string): Promise<{ posts: AnonPostRow[]; accounts: AnonAccountRow[] }> {
  const { start, end } = monthBounds(period);
  const salt = randomBytes(16).toString("hex");
  const opaque = (userId: string) => createHash("sha256").update(`${salt}:${userId}`).digest("hex").slice(0, 16);

  const consenting = await prisma.user.findMany({ where: { statsConsent: true }, select: { id: true } });
  if (!consenting.length) return { posts: [], accounts: [] };
  const memberships = await prisma.membership.findMany({
    where: { role: "OWNER", userId: { in: consenting.map((u) => u.id) } },
    select: { userId: true, brandId: true, brand: { select: { timezone: true } } }
  });
  const ownerOf = new Map<string, string>();
  const tzOf = new Map<string, string>();
  for (const m of memberships) {
    // Une marque à plusieurs propriétaires : on garde le premier (un seul compte compté).
    if (!ownerOf.has(m.brandId)) ownerOf.set(m.brandId, m.userId);
    tzOf.set(m.brandId, m.brand.timezone || "Europe/Paris");
  }
  const brandIds = [...ownerOf.keys()];

  const [posts, linkPages, kits, studio, reports, shares] = await Promise.all([
    prisma.post.findMany({
      where: { brandId: { in: brandIds }, status: { not: "DRAFT" }, scheduledAt: { gte: start, lt: end } },
      select: {
        brandId: true,
        caption: true,
        scheduledAt: true,
        targets: { select: { network: true } },
        media: { select: { mediaAsset: { select: { type: true } } } }
      },
      take: 200_000
    }),
    prisma.linkPage.findMany({ where: { brandId: { in: brandIds }, published: true }, select: { brandId: true } }),
    prisma.mediaKit.findMany({ where: { brandId: { in: brandIds }, published: true }, select: { brandId: true } }),
    prisma.studioGeneration.findMany({ where: { brandId: { in: brandIds }, createdAt: { gte: start, lt: end } }, select: { brandId: true }, distinct: ["brandId"] }),
    prisma.brandReport.findMany({ where: { brandId: { in: brandIds }, enabled: true }, select: { brandId: true } }),
    prisma.calendarShare.findMany({ where: { brandId: { in: brandIds }, enabled: true }, select: { brandId: true } })
  ]);

  const postRows: AnonPostRow[] = [];
  for (const p of posts) {
    const owner = ownerOf.get(p.brandId);
    if (!owner || !p.scheduledAt) continue;
    const networks = [...new Set(p.targets.map((t) => t.network))];
    if (!networks.length) continue;
    const types = p.media.map((m) => m.mediaAsset.type.toUpperCase());
    const format: AnonFormat = types.includes("VIDEO") ? "VIDEO" : types.length ? "IMAGE" : "TEXT";
    const { weekday, hour } = localSlot(p.scheduledAt, tzOf.get(p.brandId) ?? "Europe/Paris");
    postRows.push({ owner: opaque(owner), networks, weekday, hour, format, captionLength: p.caption.length, hashtagCount: countHashtags(p.caption) });
  }

  const usedBy = (rows: { brandId: string }[]) => new Set(rows.map((r) => ownerOf.get(r.brandId)).filter(Boolean) as string[]);
  const withBio = usedBy(linkPages);
  const withKit = usedBy(kits);
  const withStudio = usedBy(studio);
  const withReports = usedBy(reports);
  const withShare = usedBy(shares);
  const accounts: AnonAccountRow[] = [...new Set(memberships.map((m) => m.userId))].map((userId) => ({
    owner: opaque(userId),
    features: {
      page_bio: withBio.has(userId),
      media_kit: withKit.has(userId),
      studio_ia: withStudio.has(userId),
      rapports_clients: withReports.has(userId),
      calendrier_partage: withShare.has(userId)
    }
  }));
  return { posts: postRows, accounts };
}

/** Calcule un mois et REMPLACE ses résultats (une valeur passée sous le seuil disparaît). */
export async function computeAnonStats(period: string): Promise<{ cells: number }> {
  const { posts, accounts } = await loadAnonRows(period);
  const cells = aggregateAnonStats(posts, accounts);
  const computedAt = new Date();
  await prisma.$transaction([
    prisma.anonStat.deleteMany({ where: { period } }),
    prisma.anonStat.createMany({ data: cells.map((c) => ({ ...c, period, computedAt })) })
  ]);
  return { cells: cells.length };
}

/** Tâche quotidienne : mois en cours et mois précédent. */
export async function refreshAnonStats(now = new Date()): Promise<{ current: number; previous: number }> {
  const current = periodOf(now);
  const previous = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
  const [a, b] = [await computeAnonStats(current), await computeAnonStats(previous)];
  return { current: a.cells, previous: b.cells };
}
