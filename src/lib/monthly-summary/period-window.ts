// Bilan du mois (03/10/2026) : calendrier d'envoi. Fichier PUR, partagé par
// l'envoi (send.ts) et le relevé automatique des comptes (social/auto-sync.ts).
import { utcToWallClock } from "@/lib/timezone";
import { monthKeyOf, previousMonth, type MonthKey } from "./period";

/** Le bilan d'un mois part le 3 du mois suivant à partir de 9 h (heure de Paris). */
export const SEND_DAY = 3;
export const SEND_HOUR = 9;
export const SEND_TZ = "Europe/Paris";

/** Mois à envoyer à cet instant (à partir du 3 à 9 h, heure de Paris), ou null. */
export function dueMonth(now: Date = new Date()): MonthKey | null {
  const w = utcToWallClock(now, SEND_TZ);
  if (w.day < SEND_DAY || (w.day === SEND_DAY && w.hour < SEND_HOUR)) return null;
  return previousMonth(monthKeyOf(now, SEND_TZ));
}

/** Du 1er au 3 avant l'envoi : relevé de fin de mois des comptes des personnes inscrites. */
export function endOfMonthSyncWindow(now: Date = new Date()): boolean {
  const w = utcToWallClock(now, SEND_TZ);
  return w.day < SEND_DAY || (w.day === SEND_DAY && w.hour < SEND_HOUR);
}
