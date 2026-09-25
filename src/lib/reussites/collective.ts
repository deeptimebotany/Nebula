// Défi collectif du mois (Réussites v2, lot C) — serveur uniquement.
//
// Un objectif commun à tous les créateurs Nebula : un nombre de vidéos mises
// en ligne dans le mois (toutes marques, tous réseaux ; une publication sur
// plusieurs réseaux compte une fois). Objectif automatique (choix de Lucas,
// lot C) : le total du mois précédent + 10 %, au moins 10 ; le
// propriétaire du site peut le changer (/admin/reussites).
//
// Objectif atteint : chaque participant (au moins une vidéo en ligne dans le
// mois) reçoit le badge collectif du mois et 50 XP (ChallengeCompletion kind
// « COLLECTIVE », clé « collective ») — même s'il revient le mois suivant.
// Jamais de classement : la page montre le total, le nombre de créateurs et
// la part de chacun, pas celle des autres.
import { prisma } from "@/lib/prisma";
import { challengeCompletionDb } from "@/lib/prisma-extra";
import { monthOf, type Period } from "./periods";

export const COLLECTIVE_XP = 50;
export const COLLECTIVE_MIN_TARGET = 10;
export const COLLECTIVE_GROWTH = 1.1;
export const COLLECTIVE_KEY = "collective";
const CACHE_MS = 60_000;
const DAY = 86_400_000;

export interface CollectiveRow {
  id: string;
  month: string;
  metric: string;
  target: number;
  source: string;
  reachedAt: Date | null;
}

interface CollectiveDelegate {
  findUnique(args: unknown): Promise<CollectiveRow | null>;
  create(args: unknown): Promise<CollectiveRow>;
  upsert(args: unknown): Promise<CollectiveRow>;
  updateMany(args: unknown): Promise<{ count: number }>;
}
const collectiveDb = (prisma as unknown as { collectiveChallenge: CollectiveDelegate }).collectiveChallenge;

/** Objectif automatique à partir du total du mois précédent. */
export function autoTarget(previousTotal: number): number {
  // En entiers (× 11 / 10) : 100 × 1,1 donnerait 110,000…01, donc 111.
  return Math.max(COLLECTIVE_MIN_TARGET, Math.ceil((previousTotal * Math.round(COLLECTIVE_GROWTH * 10)) / 10));
}

export interface MonthTotals {
  total: number;
  participants: number;
  byUser: Map<string, number>;
}

const cache = new Map<string, { at: number; value: MonthTotals }>();

/** Vide le cache des totaux (tests, ou après un changement d'objectif). */
export function clearCollectiveCache(): void {
  cache.clear();
}

/** Vidéos mises en ligne dans le mois, par compte (cache d'une minute). */
export async function monthTotals(period: Period, opts: { fresh?: boolean } = {}): Promise<MonthTotals> {
  const hit = cache.get(period.id);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const groups = (await prisma.post.groupBy({
    by: ["createdById"],
    where: {
      targets: { some: { status: "PUBLISHED", publishedAt: { gte: period.start, lt: period.end } } },
      media: { some: { mediaAsset: { type: "VIDEO" } } }
    },
    _count: { _all: true }
  })) as unknown as { createdById: string; _count: { _all: number } }[];
  const byUser = new Map(groups.map((g) => [g.createdById, g._count._all]));
  const value = { total: groups.reduce((n, g) => n + g._count._all, 0), participants: groups.length, byUser };
  cache.set(period.id, { at: Date.now(), value });
  return value;
}

/** Défi du mois : créé à la première lecture du mois, objectif automatique. */
export async function ensureCollective(period: Period): Promise<CollectiveRow> {
  const existing = await collectiveDb.findUnique({ where: { month: period.id } });
  if (existing) return existing;
  const previous = monthOf(new Date(period.start.getTime() - DAY));
  const prevTotals = await monthTotals(previous);
  try {
    return await collectiveDb.create({ data: { month: period.id, metric: "videos", target: autoTarget(prevTotals.total), source: "auto" } });
  } catch {
    const again = await collectiveDb.findUnique({ where: { month: period.id } });
    if (again) return again;
    throw new Error("défi collectif introuvable");
  }
}

/** Objectif fixé par le propriétaire du site (mois en cours). */
export async function setCollectiveTarget(target: number, now: Date = new Date()): Promise<CollectiveRow> {
  const period = monthOf(now);
  await ensureCollective(period);
  const row = await collectiveDb.upsert({
    where: { month: period.id },
    update: { target, source: "admin" },
    create: { month: period.id, metric: "videos", target, source: "admin" }
  });
  cache.delete(period.id);
  return row;
}

export interface CollectiveState {
  month: string;
  target: number;
  source: string;
  total: number;
  participants: number;
  mine: number;
  reachedAt: Date | null;
  /** Badge collectif de ce mois déjà reçu par ce compte. */
  earned: boolean;
}

export interface CollectiveFresh {
  month: string;
  total: number;
  participants: number;
}

async function tryGrant(userId: string, month: string, celebrated: boolean): Promise<boolean> {
  try {
    await challengeCompletionDb.create({
      data: { userId, period: month, challengeKey: COLLECTIVE_KEY, kind: "COLLECTIVE", xp: COLLECTIVE_XP, celebratedAt: celebrated ? new Date() : null }
    });
    return true;
  } catch {
    return false; // déjà reçu
  }
}

/**
 * Défi collectif pour ce compte : marque l'objectif atteint (une fois), et
 * accorde le badge aux participants — pour le mois en cours et, s'il revient
 * plus tard, pour le mois précédent.
 */
export async function evaluateCollective(
  userId: string,
  now: Date,
  opts: { record: boolean; celebrated?: boolean }
): Promise<{ state: CollectiveState; fresh: CollectiveFresh[] }> {
  const period = monthOf(now);
  const row = await ensureCollective(period);
  const totals = await monthTotals(period);
  let reachedAt = row.reachedAt;
  if (!reachedAt && totals.total >= row.target && opts.record) {
    await collectiveDb.updateMany({ where: { id: row.id, reachedAt: null }, data: { reachedAt: now } });
    reachedAt = now;
  }
  const fresh: CollectiveFresh[] = [];
  const mine = totals.byUser.get(userId) ?? 0;
  let earned = Boolean(await challengeCompletionDb.findFirst({ where: { userId, period: period.id, challengeKey: COLLECTIVE_KEY } }));
  if (opts.record && reachedAt && mine > 0 && !earned && (await tryGrant(userId, period.id, Boolean(opts.celebrated)))) {
    earned = true;
    fresh.push({ month: period.id, total: totals.total, participants: totals.participants });
  }

  // Mois précédent : objectif atteint pendant l'absence du créateur.
  if (opts.record) {
    const previous = monthOf(new Date(period.start.getTime() - DAY));
    const prevRow = await collectiveDb.findUnique({ where: { month: previous.id } });
    if (prevRow?.reachedAt && !(await challengeCompletionDb.findFirst({ where: { userId, period: previous.id, challengeKey: COLLECTIVE_KEY } }))) {
      const prevTotals = await monthTotals(previous);
      if ((prevTotals.byUser.get(userId) ?? 0) > 0 && (await tryGrant(userId, previous.id, Boolean(opts.celebrated)))) {
        fresh.push({ month: previous.id, total: prevTotals.total, participants: prevTotals.participants });
      }
    }
  }

  return {
    state: { month: period.id, target: row.target, source: row.source, total: totals.total, participants: totals.participants, mine, reachedAt, earned },
    fresh
  };
}
