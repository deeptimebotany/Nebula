// Échéances des API (veille, 02/10/2026) : règles pures, testées sans base.
// Rappels au propriétaire à 90, 30 et 7 jours de la date de revue ou de la
// fin de vie (la plus proche), puis le jour même. Un seul rappel par seuil :
// une veille mise en place à 25 jours d'une échéance n'envoie pas d'un coup
// les rappels de 90 et de 30 jours, seulement celui de 30.
import { WATCHED_APIS, type WatchedApi } from "./registry";

const DAY = 86_400_000;
export const DEADLINE_THRESHOLDS = [90, 30, 7, 0] as const;

export type DeadlineLevel = "ok" | "bientot" | "urgent" | "depasse";

export interface DeadlineStatus {
  api: WatchedApi;
  /** Échéance la plus proche : revue ou fin de vie. */
  kind: "revue" | "fin";
  date: string;
  days: number;
  level: DeadlineLevel;
}

/** Jours entiers entre aujourd'hui et une date AAAA-MM-JJ (à minuit UTC). */
export function daysUntil(date: string, now: Date): number {
  const target = Date.parse(`${date}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / DAY);
}

export function levelOf(days: number): DeadlineLevel {
  if (days < 0) return "depasse";
  if (days <= 30) return "urgent";
  if (days <= 90) return "bientot";
  return "ok";
}

export function deadlineOf(api: WatchedApi, now: Date): DeadlineStatus {
  const review = { kind: "revue" as const, date: api.reviewBy, days: daysUntil(api.reviewBy, now) };
  const sunset = api.sunset ? { kind: "fin" as const, date: api.sunset, days: daysUntil(api.sunset, now) } : null;
  const next = sunset && sunset.days < review.days ? sunset : review;
  return { api, ...next, level: levelOf(next.days) };
}

/** Toutes les échéances, la plus proche d'abord. */
export function deadlineStatuses(now: Date, apis: WatchedApi[] = WATCHED_APIS): DeadlineStatus[] {
  return apis.map((a) => deadlineOf(a, now)).sort((a, b) => a.days - b.days);
}

/** Libellé « dans 25 jours », « aujourd'hui », « dépassée de 3 jours ». */
export function daysLabel(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days < 0) return `dépassée de ${-days} jour${days < -1 ? "s" : ""}`;
  return `dans ${days} jour${days > 1 ? "s" : ""}`;
}

export interface DeadlineAlert {
  key: string;
  threshold: number;
  title: string;
  body: string;
  status: DeadlineStatus;
}

/** Rappels à envoyer maintenant (le plus petit seuil franchi par échéance). */
export function dueDeadlineAlerts(now: Date, apis: WatchedApi[] = WATCHED_APIS): DeadlineAlert[] {
  const out: DeadlineAlert[] = [];
  for (const status of deadlineStatuses(now, apis)) {
    const crossed = DEADLINE_THRESHOLDS.filter((t) => status.days <= t);
    if (crossed.length === 0) continue;
    const threshold = Math.min(...crossed);
    const what = status.kind === "fin" ? "Fin de vie" : "Revue à faire";
    const { api } = status;
    out.push({
      // La version fait partie de la clé : après une montée de version, les rappels repartent.
      key: `api-deadline:${api.id}:${api.inUse}:${status.kind}:${status.date}:${threshold}`,
      threshold,
      status,
      title: `${what} ${daysLabel(status.days)} : ${api.label}`,
      body: `${api.label}, ${api.inUse} : ${status.kind === "fin" ? "fin de vie annoncée" : "date de revue"} le ${new Date(`${status.date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.${api.sunsetNote ? ` ${api.sunsetNote}` : ""} À faire : ${api.howTo}`
    });
  }
  return out;
}
