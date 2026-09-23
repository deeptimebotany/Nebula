// Fuseau horaire de programmation (Lot 4). Chaque marque a un fuseau
// (`Brand.timezone`, défaut « Europe/Paris », réglable dans Paramètres →
// Marque) : les heures saisies dans Publier, le calendrier et la fiche
// d'une publication sont interprétées et affichées DANS CE FUSEAU, quel que
// soit celui du navigateur. Avant : tout dépendait du fuseau de l'ordinateur
// qui ouvrait la page — un post programmé « 18 h » depuis un voyage à
// l'étranger partait à une autre heure que prévu.
//
// Sans dépendance : tout repose sur Intl.DateTimeFormat, disponible côté
// serveur (Node) comme côté navigateur.

export const DEFAULT_TIMEZONE = "Europe/Paris";

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Heure « murale » d'un instant, dans le fuseau donné. */
export function utcToWallClock(date: Date, tz: string): WallClock {
  const parts = formatter(tz).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/** Décalage (ms) entre l'heure murale du fuseau et l'UTC à l'instant `ts` : mur = utc + offset. */
function offsetAt(ts: number, tz: string): number {
  const w = utcToWallClock(new Date(ts), tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, 0, 0);
  // On compare à la minute près (les secondes sont ignorées dans w).
  const tsMinute = Math.floor(ts / 60000) * 60000;
  return asUtc - tsMinute;
}

/** Instant UTC correspondant à une heure murale dans le fuseau donné (gère les changements d'heure). */
export function wallClockToUtc(w: WallClock, tz: string): Date {
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, 0, 0);
  // Première estimation avec le décalage en vigueur à cet instant, puis une
  // seconde passe pour les heures situées juste autour d'un changement d'heure.
  let guess = naive - offsetAt(naive, tz);
  guess = naive - offsetAt(guess, tz);
  return new Date(guess);
}

/** « YYYY-MM-DDTHH:mm » (valeur d'un champ date/heure) → instant UTC, l'heure étant celle du fuseau. */
export function localInputToUtc(value: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return wallClockToUtc({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] }, tz);
}

/** Instant UTC → « YYYY-MM-DDTHH:mm » dans le fuseau (pour pré-remplir un champ date/heure). */
export function utcToLocalInput(date: Date, tz: string): string {
  const w = utcToWallClock(date, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Clé de jour « YYYY-MM-DD » et heure « HH:mm » d'un instant, dans le fuseau. */
export function dayKeyAndTime(date: Date, tz: string): { key: string; time: string } {
  const w = utcToWallClock(date, tz);
  return { key: `${w.year}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}` };
}

/** Libellé court du fuseau (« UTC+2 ») à un instant donné, pour l'afficher à côté d'une heure. */
export function timeZoneLabel(tz: string, at: Date = new Date()): string {
  const offsetMin = Math.round(offsetAt(at.getTime(), tz) / 60000);
  const sign = offsetMin >= 0 ? "+" : "−";
  const abs = Math.abs(offsetMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ":" + pad(m) : ""}`;
}

/** Liste de fuseaux proposée dans Paramètres : ceux du navigateur quand il les connaît, sinon une sélection courante. */
export const COMMON_TIMEZONES = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Luxembourg",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Istanbul",
  "Africa/Casablanca",
  "Africa/Algiers",
  "Africa/Tunis",
  "Africa/Dakar",
  "Africa/Abidjan",
  "Africa/Kinshasa",
  "Indian/Antananarivo",
  "Indian/Reunion",
  "Indian/Mauritius",
  "America/Martinique",
  "America/Guadeloupe",
  "America/Cayenne",
  "America/Montreal",
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Noumea",
  "Pacific/Tahiti",
  "UTC"
];

export function timeZoneOptions(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      const all = intl.supportedValuesOf("timeZone");
      if (all.length > 0) return all;
    } catch {
      // navigateur ancien — liste courante ci-dessous
    }
  }
  return COMMON_TIMEZONES;
}
