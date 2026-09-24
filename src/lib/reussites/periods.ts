// Périodes des défis (semaine du lundi au dimanche, mois civil), toujours
// en heure de Paris : les défis sont les mêmes pour tout le monde, au même
// moment. Importable côté client et serveur.
import { utcToWallClock, wallClockToUtc } from "@/lib/timezone";

export const REUSSITES_TZ = "Europe/Paris";
const DAY = 86_400_000;
// Lundi 5 janvier 1970 : origine du numéro de semaine (rotation des défis).
const EPOCH_MONDAY_DAY = 4;

export interface Period {
  /** « 2026-W39 » ou « 2026-09 ». */
  id: string;
  start: Date;
  end: Date;
  /** Semaine : n° depuis 1970 ; mois : année × 12 + mois (0–11). */
  index: number;
}

function wallDay(date: Date) {
  const w = utcToWallClock(date, REUSSITES_TZ);
  return { y: w.year, m: w.month, d: w.day };
}

function dayNumber(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / DAY);
}

function fromDayNumber(n: number) {
  const dt = new Date(n * DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const midnight = (n: number) => {
  const { y, m, d } = fromDayNumber(n);
  return wallClockToUtc({ year: y, month: m, day: d, hour: 0, minute: 0 }, REUSSITES_TZ);
};

/** Clé de jour « AAAA-MM-JJ » (heure de Paris). */
export function parisDayKey(date: Date): string {
  const { y, m, d } = wallDay(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Numéro du jour (heure de Paris), pour compter des jours consécutifs. */
export function parisDayNumber(date: Date): number {
  const { y, m, d } = wallDay(date);
  return dayNumber(y, m, d);
}

/** Semaine (lundi → dimanche, heure de Paris) contenant cette date. */
export function weekOf(date: Date = new Date()): Period {
  const { y, m, d } = wallDay(date);
  const n = dayNumber(y, m, d);
  const weekday = (new Date(n * DAY).getUTCDay() + 6) % 7; // lundi = 0
  const monday = n - weekday;
  // Numéro ISO : l'année et la semaine du jeudi.
  const thursday = fromDayNumber(monday + 3);
  const jan4 = dayNumber(thursday.y, 1, 4);
  const jan4Monday = jan4 - ((new Date(jan4 * DAY).getUTCDay() + 6) % 7);
  const isoWeek = Math.floor((monday - jan4Monday) / 7) + 1;
  return {
    id: `${thursday.y}-W${String(isoWeek).padStart(2, "0")}`,
    start: midnight(monday),
    end: midnight(monday + 7),
    index: Math.floor((monday - EPOCH_MONDAY_DAY) / 7)
  };
}

/** Mois civil (heure de Paris) contenant cette date. */
export function monthOf(date: Date = new Date()): Period {
  const { y, m } = wallDay(date);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return {
    id: `${y}-${String(m).padStart(2, "0")}`,
    start: wallClockToUtc({ year: y, month: m, day: 1, hour: 0, minute: 0 }, REUSSITES_TZ),
    end: wallClockToUtc({ year: next.y, month: next.m, day: 1, hour: 0, minute: 0 }, REUSSITES_TZ),
    index: y * 12 + (m - 1)
  };
}

/** Numéro de semaine « continue » d'une date (pour les séries de semaines). */
export function weekIndexOf(date: Date): number {
  return weekOf(date).index;
}

/** « 3 j 14 h » / « 5 h » / « 12 min » avant la fin d'une période. */
export function timeLeftLabel(end: Date, now: Date = new Date()): string {
  const ms = Math.max(0, end.getTime() - now.getTime());
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / 3_600_000);
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min`;
}

/** Jours restants (arrondi supérieur) avant la fin d'une période. */
export function daysLeft(end: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY));
}

/** Samedi 00:00 et lundi 00:00 (heure de Paris) du week-end de cette semaine. */
export function weekendOf(week: Period): { start: Date; end: Date } {
  const mondayN = parisDayNumber(new Date(week.start.getTime() + 3_600_000));
  return { start: midnight(mondayN + 5), end: week.end };
}
