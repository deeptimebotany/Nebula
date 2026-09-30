// Compteurs du jour de l'IA (lot E2, 29/09/2026) : quotas par compte et
// budget global de l'essai et du Gratuit. Réservation ATOMIQUE avant chaque
// appel à Gemini — un seul ordre SQL qui n'incrémente que sous la limite :
//   INSERT … ON CONFLICT DO UPDATE SET count = count + 1 WHERE count < limite RETURNING count
// Rien de réservé → pas d'appel. Si l'appel échoue sans réponse facturée, la
// réservation est rendue (release).
//
// Réutilise la table PublicToolUsage (déjà purgée chaque jour) : la « clé »
// est une empreinte (compte, adresse IP) ou un nom fixe (budget global), le
// « compteur » est le type d'appel, le jour est celui de Paris.
import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

/** Jour « AAAA-MM-JJ » à Paris : les quotas repartent à minuit, heure de Paris. */
export function parisDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Empreinte d'un compte pour les compteurs (jamais l'identifiant en clair). */
export function accountCounterKey(userId: string): string {
  return createHash("sha256").update(`user:${userId}`).digest("hex");
}

/**
 * Réserve une unité : renvoie le nouveau total, ou null si la limite du jour
 * est déjà atteinte (rien n'est alors réservé). `limit` ≤ 0 → toujours null.
 */
export async function reserveCounter(key: string, counter: string, day: string, limit: number, amount = 1): Promise<number | null> {
  if (limit <= 0 || amount > limit) return null;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "PublicToolUsage" ("id", "ipHash", "tool", "day", "count", "updatedAt")
    VALUES (${randomUUID()}, ${key}, ${counter}, ${day}, ${amount}, NOW())
    ON CONFLICT ("ipHash", "tool", "day")
    DO UPDATE SET "count" = "PublicToolUsage"."count" + ${amount}, "updatedAt" = NOW()
    WHERE "PublicToolUsage"."count" + ${amount} <= ${limit}
    RETURNING "count"`;
  return rows.length ? Number(rows[0].count) : null;
}

/** Rend une réservation (l'appel a échoué sans réponse facturée). */
export async function releaseCounter(key: string, counter: string, day: string, amount = 1): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "PublicToolUsage" SET "count" = GREATEST(0, "count" - ${amount}), "updatedAt" = NOW()
    WHERE "ipHash" = ${key} AND "tool" = ${counter} AND "day" = ${day}`.catch(() => undefined);
}

/** Valeurs du jour de plusieurs compteurs d'une même clé (0 si absents). */
export async function readCounters(key: string, counters: string[], day: string): Promise<Record<string, number>> {
  const rows = await prisma.publicToolUsage.findMany({ where: { ipHash: key, day, tool: { in: counters } }, select: { tool: true, count: true } });
  return Object.fromEntries(counters.map((c) => [c, rows.find((r) => r.tool === c)?.count ?? 0]));
}

// --- Quotas MENSUELS (30/09/2026) --------------------------------------------
// Table à part (AiMonthlyUsage) : PublicToolUsage est purgée après 8 jours
// sans activité, ce qui remettrait à zéro un compteur du mois resté quelques
// jours sans usage. Même réservation atomique que ci-dessus.

/** Mois « AAAA-MM » à Paris : les quotas mensuels repartent le 1er à minuit. */
export function parisMonth(now: Date = new Date()): string {
  return parisDay(now).slice(0, 7);
}

/** Premier jour du mois suivant (« AAAA-MM-01 »), pour l'affichage. */
export function nextParisMonthStart(now: Date = new Date()): string {
  const [y, m] = parisMonth(now).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** Période d'un essai : toute sa durée (clé stable = son dernier jour). */
export function trialPeriod(trialEndsAt: Date): string {
  return `essai:${parisDay(trialEndsAt)}`;
}

export async function reserveMonthly(key: string, period: string, kind: string, limit: number, amount = 1): Promise<number | null> {
  if (limit <= 0 || amount > limit) return null;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "AiMonthlyUsage" ("id", "keyHash", "period", "kind", "count", "updatedAt")
    VALUES (${randomUUID()}, ${key}, ${period}, ${kind}, ${amount}, NOW())
    ON CONFLICT ("keyHash", "period", "kind")
    DO UPDATE SET "count" = "AiMonthlyUsage"."count" + ${amount}, "updatedAt" = NOW()
    WHERE "AiMonthlyUsage"."count" + ${amount} <= ${limit}
    RETURNING "count"`;
  return rows.length ? Number(rows[0].count) : null;
}

export async function releaseMonthly(key: string, period: string, kind: string, amount = 1): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "AiMonthlyUsage" SET "count" = GREATEST(0, "count" - ${amount}), "updatedAt" = NOW()
    WHERE "keyHash" = ${key} AND "period" = ${period} AND "kind" = ${kind}`.catch(() => undefined);
}

export async function readMonthly(key: string, period: string, kinds: string[]): Promise<Record<string, number>> {
  const rows = await prisma.aiMonthlyUsage.findMany({ where: { keyHash: key, period, kind: { in: kinds } }, select: { kind: true, count: true } });
  return Object.fromEntries(kinds.map((k) => [k, rows.find((r) => r.kind === k)?.count ?? 0]));
}

/** Purge (cron) : compteurs du mois sans usage depuis plus de 62 jours (période forcément finie). */
export async function purgeMonthlyCounters(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 62 * 24 * 60 * 60 * 1000);
  const r = await prisma.aiMonthlyUsage.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  return r.count;
}

// --- Analyses Rétention achetées (recharges) ---------------------------------

/** Utilise une analyse achetée : true si le solde le permettait (atomique). */
export async function takeRetentionCredit(userId: string): Promise<boolean> {
  const n = await prisma.$executeRaw`UPDATE "User" SET "retentionCredits" = "retentionCredits" - 1 WHERE "id" = ${userId} AND "retentionCredits" > 0`;
  return n > 0;
}

/** Rend une analyse achetée (l'appel a échoué sans être facturé). */
export async function giveBackRetentionCredit(userId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "User" SET "retentionCredits" = "retentionCredits" + 1 WHERE "id" = ${userId}`.catch(() => undefined);
}
