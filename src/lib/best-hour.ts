// Meilleur créneau de publication d'après les relevés réels d'un compte
// (croissance + engagement moyens par heure de la journée). Partagé par le
// widget « Meilleur créneau du jour » de la Vue d'ensemble
// (server-data/brand-data.ts) et l'étoile Portée ★2 « Au bon moment »
// (reussites/skill-metrics.ts), pour qu'ils parlent de la même heure.
//
// L'heure est celle du fuseau de la marque (Brand.timezone, Paris par
// défaut). Avant le 27/09/2026, elle était lue dans le fuseau du serveur
// (UTC sur Vercel) : « 18h » affiché voulait dire 20 h à Paris.
import { DEFAULT_TIMEZONE, utcToWallClock } from "@/lib/timezone";

export interface HourSnapshot {
  capturedAt: Date;
  followersDelta: number;
  engagementRate: number;
}

/** Relevés minimum pour parler d'un créneau personnel. */
export const MIN_SNAPSHOTS_FOR_SLOT = 5;

/** Heure (0–23) de cette date dans ce fuseau. */
export function wallHour(date: Date, tz: string | null | undefined): number {
  return utcToWallClock(new Date(date), tz || DEFAULT_TIMEZONE).hour;
}

/** Meilleure heure d'un ensemble de relevés, ou null si la liste est vide. */
export function bestHourOf(list: HourSnapshot[], tz: string | null | undefined): { hour: number; avg: number } | null {
  const byHour = new Map<number, { total: number; count: number }>();
  for (const s of list) {
    const h = wallHour(s.capturedAt, tz);
    const bucket = byHour.get(h) ?? { total: 0, count: 0 };
    bucket.total += s.followersDelta + s.engagementRate;
    bucket.count += 1;
    byHour.set(h, bucket);
  }
  let best: { hour: number; avg: number } | null = null;
  for (const [hour, { total, count }] of Array.from(byHour)) {
    const avg = total / count;
    if (!best || avg > best.avg || (avg === best.avg && hour < best.hour)) best = { hour, avg };
  }
  return best;
}

/** Écart en heures entre deux heures de la journée (23 h et 0 h : 1). */
export function hourGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
}
