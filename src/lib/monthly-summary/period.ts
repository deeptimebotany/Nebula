// Bilan du mois (03/10/2026) : mois calendaires dans le fuseau de la marque
// (Paris par défaut). Fichier PUR (aucun accès à la base), testé seul.
import { DEFAULT_TIMEZONE, utcToWallClock, wallClockToUtc } from "@/lib/timezone";

export type MonthKey = string; // « 2026-09 »

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export function isMonthKey(value: string | null | undefined): value is MonthKey {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function parts(key: MonthKey): { year: number; month: number } {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

function keyOf(year: number, month: number): MonthKey {
  const y = year + Math.floor((month - 1) / 12);
  const m = ((((month - 1) % 12) + 12) % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Mois (heure murale du fuseau) d'un instant. */
export function monthKeyOf(date: Date, tz: string = DEFAULT_TIMEZONE): MonthKey {
  const w = utcToWallClock(date, tz);
  return keyOf(w.year, w.month);
}

export function previousMonth(key: MonthKey): MonthKey {
  const { year, month } = parts(key);
  return keyOf(year, month - 1);
}

export function nextMonth(key: MonthKey): MonthKey {
  const { year, month } = parts(key);
  return keyOf(year, month + 1);
}

export function daysInMonth(key: MonthKey): number {
  const { year, month } = parts(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Début (1er à 0 h) et fin (1er du mois suivant à 0 h) du mois, dans le fuseau. */
export function monthBounds(key: MonthKey, tz: string = DEFAULT_TIMEZONE): { start: Date; end: Date } {
  const { year, month } = parts(key);
  const next = parts(nextMonth(key));
  return {
    start: wallClockToUtc({ year, month, day: 1, hour: 0, minute: 0 }, tz),
    end: wallClockToUtc({ year: next.year, month: next.month, day: 1, hour: 0, minute: 0 }, tz)
  };
}

/** Jour du mois (0 = le 1er) d'un instant situé dans le mois, ou -1. */
export function dayIndexOf(date: Date, key: MonthKey, tz: string = DEFAULT_TIMEZONE): number {
  const w = utcToWallClock(date, tz);
  if (keyOf(w.year, w.month) !== key) return -1;
  return w.day - 1;
}

/** Jour de la semaine (0 = lundi) et heure murale d'un instant. */
export function weekdayAndHour(date: Date, tz: string = DEFAULT_TIMEZONE): { weekday: number; hour: number } {
  const w = utcToWallClock(date, tz);
  const weekday = (new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7;
  return { weekday, hour: w.hour };
}

/** « septembre 2026 » */
export function monthLabel(key: MonthKey): string {
  const { year, month } = parts(key);
  return `${MONTHS[month - 1]} ${year}`;
}

/** « septembre » */
export function monthName(key: MonthKey): string {
  return MONTHS[parts(key).month - 1];
}

/** « Septembre 2026 » */
export function monthTitle(key: MonthKey): string {
  const label = monthLabel(key);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** « 14 sept. » */
export function dayLabel(key: MonthKey, dayIndex: number): string {
  return `${dayIndex + 1 === 1 ? "1er" : dayIndex + 1} ${MONTHS_SHORT[parts(key).month - 1]}`;
}

/** « 14 septembre » */
export function dayLongLabel(key: MonthKey, dayIndex: number): string {
  return `${dayIndex + 1 === 1 ? "1er" : dayIndex + 1} ${MONTHS[parts(key).month - 1]}`;
}

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? "";
}

/** « d'août » / « de septembre » (élision devant une voyelle). */
export function ofMonth(key: MonthKey): string {
  const name = monthName(key);
  return /^[aeiouyéèêàâîôû]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/** « qu'en août » / « qu'en septembre » */
export function thanInMonth(key: MonthKey): string {
  return `qu'en ${monthName(key)}`;
}
