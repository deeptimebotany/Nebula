import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// Limitation de débit par IP pour les routes publiques sensibles
// (inscription, connexion par mot de passe, mot de passe oublié). Réutilise
// la table PublicToolUsage (voir public-tools-limit.ts pour les outils IA
// gratuits) : `tool` = clé de la limite, `day` = fenêtre de temps (bucket),
// `count` = tentatives dans cette fenêtre. L'IP n'est jamais stockée en
// clair, seulement son empreinte SHA-256.
//
// Volontairement simple et sans dépendance externe : sur Vercel, chaque
// instance serverless a sa propre mémoire, donc un compteur en mémoire ne
// protégerait rien — la base est le seul point commun. Les lignes périmées
// sont purgées par /api/cron (voir purgeExpiredRateLimits).

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined | null;

function readHeader(headers: HeaderSource, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
  const value = (headers as Record<string, string | string[] | undefined>)[name] ?? (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function clientIpFromHeaders(headers: HeaderSource): string {
  // Sur Vercel (et la plupart des proxys), l'IP réelle du visiteur est le
  // premier élément de x-forwarded-for.
  const forwarded = readHeader(headers, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return readHeader(headers, "x-real-ip") || "unknown";
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Consomme une tentative pour `subject` (IP, ou IP+email) sur la limite
 * `key`, avec au plus `limit` tentatives par fenêtre de `windowMinutes`.
 * Renvoie ok=false SANS incrémenter davantage une fois la limite atteinte.
 * En cas d'erreur de base de données, laisse passer (on préfère un service
 * disponible à un blocage total si la base a un hoquet).
 */
export async function consumeRateLimit(
  key: string,
  subject: string,
  limit: number,
  windowMinutes: number
): Promise<RateLimitResult> {
  const windowMs = windowMinutes * 60 * 1000;
  const bucketIndex = Math.floor(Date.now() / windowMs);
  const day = `w${windowMinutes}:${bucketIndex}`;
  const ipHash = hashKey(subject);
  const tool = `ratelimit:${key}`;
  const retryAfterSeconds = Math.max(1, Math.ceil(((bucketIndex + 1) * windowMs - Date.now()) / 1000));

  try {
    const existing = await prisma.publicToolUsage.findUnique({ where: { ipHash_tool_day: { ipHash, tool, day } } });
    if (existing && existing.count >= limit) {
      return { ok: false, remaining: 0, limit, retryAfterSeconds };
    }
    const updated = await prisma.publicToolUsage.upsert({
      where: { ipHash_tool_day: { ipHash, tool, day } },
      update: { count: { increment: 1 } },
      create: { ipHash, tool, day, count: 1 }
    });
    return { ok: true, remaining: Math.max(0, limit - updated.count), limit, retryAfterSeconds };
  } catch (err) {
    console.error("[rate-limit] base indisponible, tentative laissée passer :", (err as Error).message);
    return { ok: true, remaining: limit, limit, retryAfterSeconds };
  }
}

export const RATE_LIMIT_MESSAGE = "Trop de tentatives. Réessayez dans quelques minutes.";

// Purge des fenêtres périmées (appelée par /api/cron) : les buckets de
// rate-limit n'ont d'intérêt que pendant leur fenêtre ; on garde 2 jours de
// marge, comme pour les quotas des outils gratuits.
export async function purgeExpiredRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.publicToolUsage.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  return count;
}
