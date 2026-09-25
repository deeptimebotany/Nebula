// Bilan de la semaine (Réussites v2, lot B) — serveur uniquement.
//
// Trois chiffres de la semaine passée (abonnés gagnés, publication la plus
// vue, publications mises en ligne) et UN cap choisi pour la semaine en
// cours parmi quatre propositions tirées de ces chiffres. Fait une fois par
// semaine (on peut changer de cap ensuite) ; enregistré sur la ligne des
// missions de la semaine (WeeklyMissions.reviewedAt / reviewFocus). Compte
// pour les étoiles Stratégie ★1, ★2 (3 semaines d'affilée) et ★5 (8 bilans).
import { prisma } from "@/lib/prisma";
import { ownedBy } from "@/lib/brand-access";
import { weeklyMissionsDb, type WeeklyMissionsRow } from "@/lib/prisma-extra";
import { wallHour } from "@/lib/best-hour";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { NETWORK_META, type Network } from "@/lib/types";
import { parisDayKey, weekOf, type Period } from "./periods";
import type { PublishedPost } from "./posts";
import type { ActionResult } from "./weekly";

const DAY = 86_400_000;

export const REVIEW_FOCUS = ["format", "slot", "rhythm", "new"] as const;
export type ReviewFocus = (typeof REVIEW_FOCUS)[number];

export function isReviewFocus(value: unknown): value is ReviewFocus {
  return typeof value === "string" && (REVIEW_FOCUS as readonly string[]).includes(value);
}

export interface ReviewTop {
  title: string;
  views: number;
  network: string;
  permalink: string | null;
  hour: number | null;
}

export interface ReviewFigures {
  /** Semaine passée (celle dont on fait le bilan). */
  week: Period;
  posts: number;
  days: number;
  /** null : pas assez de relevés pour le dire. */
  followersGained: number | null;
  top: ReviewTop | null;
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « du 21 au 27 septembre » (heure de Paris). */
export function weekRangeLabel(week: Period): string {
  const [, m1, d1] = parisDayKey(week.start).split("-").map(Number);
  const [, m2, d2] = parisDayKey(new Date(week.end.getTime() - 3_600_000)).split("-").map(Number);
  return m1 === m2 ? `du ${d1} au ${d2} ${MONTHS[m2 - 1]}` : `du ${d1} ${MONTHS[m1 - 1]} au ${d2} ${MONTHS[m2 - 1]}`;
}

function excerpt(text: string | null | undefined, max = 48): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "votre meilleure publication";
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Propositions de cap, formulées à partir des chiffres de la semaine passée. */
export function focusOptions(f: Pick<ReviewFigures, "days" | "top">): { key: ReviewFocus; label: string }[] {
  const top = f.top;
  const network = top ? (NETWORK_META[top.network as Network]?.label ?? top.network) : null;
  return [
    { key: "format", label: top ? `Refaire le format de « ${excerpt(top.title)} » (${network})` : "Refaire le format de votre publication préférée" },
    {
      key: "slot",
      label: top && top.hour !== null ? `Publier vers ${top.hour} h, l'heure de votre publication la plus vue` : "Garder le même créneau que la semaine passée"
    },
    { key: "rhythm", label: `Publier sur ${Math.min(7, f.days + 1)} jour${f.days + 1 > 1 ? "s" : ""} différent${f.days + 1 > 1 ? "s" : ""} cette semaine` },
    { key: "new", label: "Tester un format ou un sujet nouveau" }
  ];
}

/** Les trois chiffres de la semaine passée. */
export async function reviewFigures(userId: string, posts: PublishedPost[], now: Date = new Date()): Promise<ReviewFigures> {
  const current = weekOf(now);
  const week = weekOf(new Date(current.start.getTime() - DAY));
  const inWeek = posts.filter((p) => p.firstAt >= week.start && p.firstAt < week.end);
  const [snaps, metrics] = await Promise.all([
    prisma.analyticsSnapshot.findMany({
      where: { connection: { brand: ownedBy(userId) }, capturedAt: { gte: new Date(week.start.getTime() - 14 * DAY), lt: week.end } },
      select: { connectionId: true, capturedAt: true, followers: true },
      orderBy: { capturedAt: "asc" }
    }) as Promise<{ connectionId: string; capturedAt: Date; followers: number }[]>,
    prisma.postMetric.findMany({
      where: { connection: { brand: ownedBy(userId) }, publishedAt: { gte: week.start, lt: week.end }, views: { not: null } },
      select: { title: true, views: true, network: true, permalink: true, publishedAt: true, connection: { select: { brand: { select: { timezone: true } } } } },
      orderBy: { views: "desc" },
      take: 1
    }) as unknown as Promise<{ title: string | null; views: number | null; network: string; permalink: string | null; publishedAt: Date | null; connection: { brand: { timezone: string | null } | null } }[]>
  ]);

  // Abonnés : dernier relevé avant la semaine (ou premier de la semaine) →
  // dernier relevé de la semaine, compte par compte.
  let gained: number | null = null;
  const byConnection = new Map<string, { capturedAt: Date; followers: number }[]>();
  for (const s of snaps) {
    const list = byConnection.get(s.connectionId) ?? [];
    list.push(s);
    byConnection.set(s.connectionId, list);
  }
  for (const list of Array.from(byConnection.values())) {
    const before = list.filter((s) => s.capturedAt < week.start);
    const during = list.filter((s) => s.capturedAt >= week.start);
    const from = before[before.length - 1] ?? during[0];
    const to = during[during.length - 1];
    if (!from || !to || from === to) continue;
    gained = (gained ?? 0) + (to.followers - from.followers);
  }

  const m = metrics[0];
  const top: ReviewTop | null = m
    ? {
        title: m.title ?? "",
        views: m.views ?? 0,
        network: m.network,
        permalink: m.permalink,
        hour: m.publishedAt ? wallHour(m.publishedAt, m.connection?.brand?.timezone || DEFAULT_TIMEZONE) : null
      }
    : null;

  return { week, posts: inWeek.length, days: new Set(inWeek.map((p) => parisDayKey(p.firstAt))).size, followersGained: gained, top };
}

/** Enregistre le bilan de la semaine en cours (ou change de cap). */
export async function saveReview(userId: string, focus: string, now: Date = new Date()): Promise<ActionResult> {
  if (!isReviewFocus(focus)) return { ok: false, status: 400, error: "Cap inconnu." };
  const week = weekOf(now);
  const row = (await weeklyMissionsDb.findUnique({ where: { userId_week: { userId, week: week.id } } })) as WeeklyMissionsRow | null;
  if (!row) return { ok: false, status: 404, error: "Ouvrez la page Réussites pour recevoir votre semaine." };
  await weeklyMissionsDb.update({ where: { id: row.id }, data: { reviewFocus: focus, ...(row.reviewedAt ? {} : { reviewedAt: now }) } });
  return { ok: true };
}
