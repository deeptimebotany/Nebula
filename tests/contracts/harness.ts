// Banc d'essai des contrats réseau (lot 7).
//
// Remplace `fetch` par un faux réseau qui répond avec les réponses types de
// tests/contracts/fixtures (une par appel, d'après la documentation
// officielle de chaque réseau). Chaque requête envoyée est enregistrée pour
// vérifier CE QUE Nebula envoie (adresse, version, jeton, contenu), et toute
// requête imprévue fait échouer le test.
//
// Pour remplacer une réponse type par une vraie réponse (copiée des journaux
// ou de l'explorateur du réseau) : remplacer le fichier JSON en gardant son
// nom, en retirant toute donnée personnelle, puis `npm test`.
import { readFileSync } from "fs";
import path from "path";
import { vi } from "vitest";

const FIXTURES = path.join(__dirname, "fixtures");

/** Texte brut d'une réponse type (garde les grands entiers intacts). */
export function fixtureText(name: string): string {
  return readFileSync(path.join(FIXTURES, `${name}.json`), "utf8");
}

/** Réponse type lue en objet (pour la modifier dans un test de dérive). */
export function fixture<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(fixtureText(name)) as T;
}

/** Copie d'un objet sans le champ `dotted` (« data.0.id »). */
export function without<T>(value: T, dotted: string): T {
  const copy = structuredClone(value) as Record<string, unknown>;
  const keys = dotted.split(".");
  let cur: Record<string, unknown> = copy;
  for (const key of keys.slice(0, -1)) cur = cur[key] as Record<string, unknown>;
  delete cur[keys[keys.length - 1]];
  return copy as T;
}

/** Copie d'un objet avec `dotted` remplacé par `v`. */
export function withValue<T>(value: T, dotted: string, v: unknown): T {
  const copy = structuredClone(value) as Record<string, unknown>;
  const keys = dotted.split(".");
  let cur: Record<string, unknown> = copy;
  for (const key of keys.slice(0, -1)) cur = cur[key] as Record<string, unknown>;
  cur[keys[keys.length - 1]] = v;
  return copy as T;
}

export interface SentRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
  /** Corps texte (JSON ou formulaire), vide pour un fichier. */
  body: string;
  json?: unknown;
  form?: URLSearchParams;
  /** Taille d'un corps binaire (envoi de fichier). */
  bytes?: number;
}

export interface Route {
  method?: string;
  /** Hôte + chemin (« graph.facebook.com/v25.0/ACC/media »), texte exact ou expression régulière. */
  url: string | RegExp;
  status?: number;
  headers?: Record<string, string>;
  /** Nom d'une réponse type, objet, texte brut, ou fonction de la requête. */
  fixture?: string;
  body?: unknown;
  raw?: string;
  /** Réponse binaire (image…). */
  bytes?: Uint8Array;
  reply?: (req: SentRequest) => { status?: number; body?: unknown; raw?: string; headers?: Record<string, string> };
  /** Nombre d'utilisations (par défaut : illimité). Utile pour une suite de réponses. */
  times?: number;
}

function headersOf(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  const h = init?.headers;
  if (!h) return out;
  if (h instanceof Headers) h.forEach((v, k) => (out[k.toLowerCase()] = v));
  else if (Array.isArray(h)) for (const [k, v] of h) out[k.toLowerCase()] = v;
  else for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
  return out;
}

function describe(init?: RequestInit): Pick<SentRequest, "body" | "json" | "form" | "bytes"> {
  const body = init?.body;
  if (body === undefined || body === null) return { body: "" };
  if (typeof body === "string") {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      json = undefined;
    }
    return { body, json, form: json === undefined ? new URLSearchParams(body) : undefined };
  }
  if (body instanceof URLSearchParams) return { body: body.toString(), form: body };
  if (body instanceof ArrayBuffer) return { body: "", bytes: body.byteLength };
  if (ArrayBuffer.isView(body)) return { body: "", bytes: body.byteLength };
  if (body instanceof FormData) return { body: "", bytes: -1 };
  return { body: "" };
}

/**
 * Installe le faux réseau. Les routes sont essayées dans l'ordre ; une route
 * avec `times` s'épuise, ce qui permet d'enchaîner « en cours » puis « terminé ».
 */
export function installNetwork(routes: Route[]) {
  const sent: SentRequest[] = [];
  const unmatched: string[] = [];
  const remaining = routes.map((r) => r.times ?? Infinity);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const method = (init?.method ?? "GET").toUpperCase();
      const req: SentRequest = { method, url, headers: headersOf(init), ...describe(init) };
      sent.push(req);
      const target = `${url.host}${url.pathname}`;
      const index = routes.findIndex(
        (r, i) => remaining[i] > 0 && (r.method ?? "GET").toUpperCase() === method && (typeof r.url === "string" ? r.url === target : r.url.test(target))
      );
      if (index === -1) {
        unmatched.push(`${method} ${target}`);
        throw new TypeError(`Requête imprévue dans le test de contrat : ${method} ${target}`);
      }
      remaining[index]--;
      const route = routes[index];
      const replied = route.reply?.(req);
      const status = replied?.status ?? route.status ?? 200;
      const headers = { "content-type": "application/json", ...(route.headers ?? {}), ...(replied?.headers ?? {}) };
      const raw =
        replied?.raw ??
        (replied?.body !== undefined ? JSON.stringify(replied.body) : undefined) ??
        route.raw ??
        (route.fixture ? fixtureText(route.fixture) : undefined) ??
        (route.body !== undefined ? JSON.stringify(route.body) : "");
      if (route.bytes && !replied) return new Response(route.bytes as unknown as BodyInit, { status, headers });
      return new Response(status === 204 ? null : raw, { status, headers });
    })
  );
  return {
    sent,
    unmatched,
    /** Requêtes envoyées vers une adresse (expression régulière sur hôte + chemin). */
    to(pattern: RegExp, method?: string): SentRequest[] {
      return sent.filter((r) => pattern.test(`${r.url.host}${r.url.pathname}`) && (!method || r.method === method.toUpperCase()));
    }
  };
}
