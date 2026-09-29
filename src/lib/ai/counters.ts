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
