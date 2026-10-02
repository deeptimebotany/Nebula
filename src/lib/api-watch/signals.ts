// Signaux de dépréciation lus dans les VRAIES réponses des API (veille,
// 02/10/2026). Chaque réponse d'un réseau, d'une régie, de Gemini ou d'une
// source d'import passe par sendRequest (src/lib/social/base.ts), qui appelle
// noteApiSignals : en-têtes regardés, jamais le corps ni les jetons.
//
// En-têtes reconnus :
//  - Deprecation (RFC 9745, « @1735689599 » ou une date) et Sunset
//    (RFC 8594, date HTTP) : l'adresse appelée va être retirée ;
//  - X-Ad-Api-Version-Warning (Meta Marketing API) : l'appel a été monté
//    d'office vers une version plus récente, la nôtre est dépréciée ;
//  - Facebook-API-Version différente de la version demandée dans l'adresse
//    (/v25.0/) : Meta a servi une autre version, la nôtre a expiré ;
//  - Warning contenant « 299 » ou « deprecat » (usage HTTP historique).
//
// Ne lève jamais et ne ralentit pas l'appel : l'enregistrement part en
// arrière-plan, et un même signal n'est écrit qu'une fois toutes les 6 h par
// instance (mémoire), puis une seule alerte au propriétaire (cloche + e-mail).
import { endpointLabel } from "@/lib/social/contract";

export type SignalKind = "DEPRECATION" | "SUNSET" | "VERSION_UPGRADED" | "WARNING";

export interface ApiSignalInput {
  kind: SignalKind;
  /** Texte lisible (valeur de l'en-tête, versions…), 300 caractères au plus. */
  detail: string;
  sunsetAt: Date | null;
}

const MAX_DETAIL = 300;
const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL);

/** Date d'un en-tête Deprecation (« @secondes ») ou Sunset (date HTTP). */
export function parseHeaderDate(value: string | null): Date | null {
  if (!value) return null;
  const v = value.trim();
  const unix = /^@(\d{9,11})$/.exec(v);
  if (unix) return new Date(Number(unix[1]) * 1000);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Version Meta demandée dans l'adresse (« /v25.0/ »), ou null. */
export function requestedMetaVersion(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)threads\.(net|com)$/.test(u.hostname)) return null;
    return /^\/(v\d+\.\d+)\//.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Signaux contenus dans les en-têtes d'une réponse (fonction pure). */
export function signalsFromHeaders(url: string, headers: { get(name: string): string | null }): ApiSignalInput[] {
  const out: ApiSignalInput[] = [];
  const deprecation = headers.get("deprecation");
  if (deprecation) {
    const date = parseHeaderDate(deprecation);
    const link = /<([^>]+)>\s*;[^,]*rel="?deprecation"?/i.exec(headers.get("link") ?? "")?.[1];
    out.push({
      kind: "DEPRECATION",
      detail: clip(`Deprecation: ${deprecation}${date ? ` (${date.toISOString().slice(0, 10)})` : ""}${link ? ` — ${link}` : ""}`),
      sunsetAt: null
    });
  }
  const sunset = headers.get("sunset");
  if (sunset) {
    const date = parseHeaderDate(sunset);
    out.push({ kind: "SUNSET", detail: clip(`Sunset: ${sunset}`), sunsetAt: date });
  }
  const adWarning = headers.get("x-ad-api-version-warning");
  if (adWarning) out.push({ kind: "VERSION_UPGRADED", detail: clip(adWarning), sunsetAt: null });
  const asked = requestedMetaVersion(url);
  const served = headers.get("facebook-api-version")?.trim();
  if (asked && served && /^v\d+\.\d+$/.test(served) && served !== asked) {
    out.push({ kind: "VERSION_UPGRADED", detail: `Appel en ${asked} servi en ${served} : la version demandée n'est plus en service.`, sunsetAt: null });
  }
  const warning = headers.get("warning");
  if (warning && /(^|\s)299\s|deprecat/i.test(warning)) out.push({ kind: "WARNING", detail: clip(`Warning: ${warning}`), sunsetAt: null });
  return out;
}

/** Clé stable d'un signal : fournisseur, type, adresse sans identifiants, texte sans chiffres variables. */
export function signalKey(provider: string, endpoint: string, signal: ApiSignalInput): string {
  const stable = signal.detail.replace(/\d{6,}/g, "#");
  return `${provider}:${signal.kind}:${endpoint}:${stable}`.slice(0, 400);
}

const recent = new Map<string, number>();
const MEMORY_MS = 6 * 3_600_000;

/**
 * Appelée par sendRequest pour chaque réponse : rien à faire dans
 * l'immense majorité des cas (aucun en-tête de dépréciation). Sinon,
 * enregistrement en arrière-plan (jamais attendu, jamais d'erreur).
 */
export function noteApiSignals(provider: string, method: string, url: string, res: { headers: { get(name: string): string | null } }): void {
  let signals: ApiSignalInput[];
  try {
    signals = signalsFromHeaders(url, res.headers);
  } catch {
    return;
  }
  if (signals.length === 0) return;
  const endpoint = endpointLabel(method, url);
  const now = Date.now();
  for (const signal of signals) {
    const key = signalKey(provider, endpoint, signal);
    if ((recent.get(key) ?? 0) > now - MEMORY_MS) continue;
    recent.set(key, now);
    void import("./record")
      .then((m) => m.recordApiSignal(provider, endpoint, key, signal))
      .catch((err) => console.error("[veille API] signal non enregistré :", (err as Error).message));
  }
}

/** Pour les tests : oublie les signaux déjà vus par cette instance. */
export function resetSignalMemory(): void {
  recent.clear();
}
