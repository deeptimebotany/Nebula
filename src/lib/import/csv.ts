// Analyse CSV côté navigateur (brief growth, lot G6.a) : RFC 4180 (guillemets,
// retours à la ligne dans une cellule), séparateur détecté (virgule,
// point-virgule ou tabulation), BOM ignoré. Zéro dépendance. Utilisé aussi
// par les tests manuels du serveur : aucun import de React ici.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(text: string, maxRows = 2000): ParsedCsv {
  const src = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > maxRows) break;
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows: rows.slice(0, maxRows), delimiter };
}

// ---------------------------------------------------------------------------
// Mappage des colonnes
// ---------------------------------------------------------------------------

export type Field = "date" | "time" | "datetime" | "text" | "title" | "firstComment" | "mediaUrl" | "networks";
export type Mapping = Partial<Record<Field, number>>;
/** Colonnes booléennes « un réseau par colonne » (format Metricool). */
export type NetworkColumns = Partial<Record<"YOUTUBE" | "INSTAGRAM" | "FACEBOOK" | "TIKTOK", number>>;

export interface DetectedFormat {
  source: "buffer" | "metricool" | "generic";
  mapping: Mapping;
  networkColumns: NetworkColumns;
}

const NETWORK_HEADERS: Record<keyof NetworkColumns, string[]> = {
  YOUTUBE: ["youtube"],
  INSTAGRAM: ["instagram"],
  FACEBOOK: ["facebook"],
  TIKTOK: ["tiktok"]
};

function norm(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function findHeader(headers: string[], candidates: string[]): number | undefined {
  const normalized = headers.map(norm);
  for (const c of candidates) {
    const idx = normalized.indexOf(c);
    if (idx >= 0) return idx;
  }
  return undefined;
}

/** Détection automatique des en-têtes connus (Buffer, Metricool) ou, à
 * défaut, des noms courants en français et en anglais. */
export function detectFormat(headers: string[]): DetectedFormat {
  const n = headers.map(norm);
  // Buffer (bulk upload) : Text, Image URL, Tags, Posting Time
  if (n.includes("text") && n.includes("posting time")) {
    return { source: "buffer", mapping: { text: n.indexOf("text"), datetime: n.indexOf("posting time"), mediaUrl: n.indexOf("image url") >= 0 ? n.indexOf("image url") : undefined }, networkColumns: {} };
  }
  // Metricool : Text, Date, Time, Draft, Facebook, Instagram, TikTok, YouTube, Picture Url 1, First Comment Text, YouTube Video Title…
  if (n.includes("text") && n.includes("date") && n.includes("time") && (n.includes("picture url 1") || n.includes("instagram") || n.includes("draft"))) {
    const networkColumns: NetworkColumns = {};
    for (const key of Object.keys(NETWORK_HEADERS) as (keyof NetworkColumns)[]) {
      const idx = findHeader(headers, NETWORK_HEADERS[key]);
      if (idx !== undefined) networkColumns[key] = idx;
    }
    const title = findHeader(headers, ["youtube video title", "tiktok title", "facebook title", "document title"]);
    return {
      source: "metricool",
      mapping: { text: n.indexOf("text"), date: n.indexOf("date"), time: n.indexOf("time"), mediaUrl: findHeader(headers, ["picture url 1"]), firstComment: findHeader(headers, ["first comment text"]), title },
      networkColumns
    };
  }
  // Colonnes libres (dont exports d'autres outils) : on devine par le nom.
  const mapping: Mapping = {
    datetime: findHeader(headers, ["datetime", "date et heure", "date heure", "scheduled at", "scheduledat", "posting time", "publish at", "publication", "date de publication"]),
    date: findHeader(headers, ["date", "jour", "day"]),
    time: findHeader(headers, ["time", "heure", "hour"]),
    text: findHeader(headers, ["text", "texte", "caption", "legende", "message", "content", "contenu", "description", "body", "post"]),
    title: findHeader(headers, ["title", "titre"]),
    firstComment: findHeader(headers, ["first comment", "premier commentaire", "first comment text", "comment", "commentaire"]),
    mediaUrl: findHeader(headers, ["media url", "media", "image url", "video url", "url du media", "url media", "picture url 1", "image", "video", "url"]),
    networks: findHeader(headers, ["network", "networks", "reseau", "reseaux", "platform", "platforms", "channel", "channels", "profile", "profiles", "social network"])
  };
  const networkColumns: NetworkColumns = {};
  for (const key of Object.keys(NETWORK_HEADERS) as (keyof NetworkColumns)[]) {
    const idx = findHeader(headers, NETWORK_HEADERS[key]);
    if (idx !== undefined) networkColumns[key] = idx;
  }
  return { source: "generic", mapping, networkColumns };
}

// ---------------------------------------------------------------------------
// Lecture d'une ligne selon le mappage
// ---------------------------------------------------------------------------

export type CsvNetwork = keyof NetworkColumns;

export interface ImportRow {
  index: number; // numéro de ligne dans le fichier (1 = première ligne de données)
  title: string;
  caption: string;
  firstComment?: string;
  mediaUrl?: string;
  /** Réseaux demandés par la ligne (vide = laisser l'utilisateur choisir). */
  networks: CsvNetwork[];
  /** Date/heure « murale » (sans fuseau) telle que lue : AAAA-MM-JJTHH:mm, ou null. */
  wallClock: string | null;
  problem?: string;
}

const NETWORK_ALIASES: Record<string, CsvNetwork> = {
  youtube: "YOUTUBE",
  yt: "YOUTUBE",
  instagram: "INSTAGRAM",
  ig: "INSTAGRAM",
  insta: "INSTAGRAM",
  facebook: "FACEBOOK",
  fb: "FACEBOOK",
  tiktok: "TIKTOK",
  tt: "TIKTOK"
};

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "oui" || s === "x" || s === "vrai";
}

/** Normalise une date + heure lues dans le CSV en « AAAA-MM-JJTHH:mm »
 * (heure murale, le fuseau est appliqué côté serveur avec celui de la marque).
 * Formats acceptés : AAAA-MM-JJ, JJ/MM/AAAA, JJ.MM.AAAA, MM/DD/YYYY (si le
 * jour dépasse 12), avec heure HH:mm(:ss) éventuellement collée. */
export function parseWallClock(dateRaw: string | undefined, timeRaw: string | undefined): string | null | "invalid" {
  const raw = `${dateRaw ?? ""} ${timeRaw ?? ""}`.trim();
  if (!raw) return null;
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ]+(\d{1,2}):(\d{2})(?::\d{2})?)?/) ?? null;
  let y: number, mo: number, d: number, h = 0, mi = 0;
  if (m) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
    if (m[4]) {
      h = Number(m[4]);
      mi = Number(m[5]);
    }
  } else {
    const m2 = raw.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[T ]+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
    if (!m2) return "invalid";
    let a = Number(m2[1]);
    let b = Number(m2[2]);
    y = Number(m2[3]);
    // JJ/MM par défaut (France) ; MM/JJ si le premier nombre ne peut pas être un mois.
    if (a > 12 && b <= 12) {
      // a = jour, b = mois
    } else if (b > 12 && a <= 12) {
      const t = a;
      a = b;
      b = t;
    }
    d = a;
    mo = b;
    if (m2[4]) {
      h = Number(m2[4]);
      mi = Number(m2[5]);
    }
  }
  // Heure séparée « 14h30 » / « 14:30 »
  if (!m?.[4] && timeRaw) {
    const t = timeRaw.match(/(\d{1,2})\s*[:h]\s*(\d{2})?/i);
    if (t) {
      h = Number(t[1]);
      mi = Number(t[2] ?? "0");
    }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return "invalid";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

export function readRow(cells: string[], index: number, fmt: DetectedFormat): ImportRow {
  const get = (f: Field) => (fmt.mapping[f] === undefined ? undefined : cells[fmt.mapping[f] as number]);
  const caption = (get("text") ?? "").trim();
  const title = (get("title") ?? "").trim();
  const firstComment = (get("firstComment") ?? "").trim() || undefined;
  const mediaUrlRaw = (get("mediaUrl") ?? "").trim();
  const mediaUrl = /^https?:\/\//i.test(mediaUrlRaw) ? mediaUrlRaw : undefined;

  const networks = new Set<CsvNetwork>();
  for (const key of Object.keys(fmt.networkColumns) as CsvNetwork[]) {
    const idx = fmt.networkColumns[key];
    if (idx !== undefined && truthy(cells[idx])) networks.add(key);
  }
  const listRaw = get("networks");
  if (listRaw) {
    for (const part of listRaw.split(/[,;|/ ]+/)) {
      const k = NETWORK_ALIASES[norm(part)];
      if (k) networks.add(k);
    }
  }

  const wall = fmt.mapping.datetime !== undefined ? parseWallClock(get("datetime"), undefined) : parseWallClock(get("date"), get("time"));
  const row: ImportRow = { index, title, caption, firstComment, mediaUrl, networks: Array.from(networks), wallClock: wall === "invalid" ? null : wall };
  if (!caption && !title) row.problem = "ni texte ni titre";
  else if (wall === "invalid") row.problem = "date illisible";
  return row;
}
