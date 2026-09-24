// Garde « anti-SSRF » (lot 4, 25/09/2026) : avant que le serveur appelle une
// adresse fournie par un utilisateur (webhook, import de média par URL via
// l'API), on vérifie qu'elle est en https et qu'elle pointe vers Internet —
// jamais vers le serveur lui-même, un réseau privé ou les services internes
// de l'hébergeur. Le nom de domaine est résolu à chaque appel (protection
// contre un domaine qui changerait d'adresse entre deux vérifications).
import { lookup } from "dns/promises";
import { isIP } from "net";

export class UnsafeUrlError extends Error {}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
}

export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true;
}

/** Vérifie la forme de l'adresse (sans résolution DNS) — pour valider une saisie. */
export function checkUrlShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Adresse invalide.");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("L'adresse doit commencer par https://");
  if (url.username || url.password) throw new UnsafeUrlError("L'adresse ne doit pas contenir d'identifiants.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("Adresse locale refusée : elle doit être joignable depuis Internet.");
  }
  if (isIP(host) && isPrivateIp(host)) throw new UnsafeUrlError("Adresse d'un réseau privé refusée.");
  return url;
}

/** Vérifie la forme ET que le domaine pointe vers une adresse publique. */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  const url = checkUrlShape(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return url;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("Nom de domaine introuvable.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("Adresse d'un réseau privé refusée.");
  }
  return url;
}

/** GET d'une adresse publique, en revérifiant chaque redirection (6 au plus). */
export async function fetchPublic(raw: string, init: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop < 6; hop++) {
    await assertPublicHttpsUrl(current);
    const res = await fetch(current, {
      headers: init.headers,
      redirect: "manual",
      cache: "no-store",
      ...(init.timeoutMs ? { signal: AbortSignal.timeout(init.timeoutMs) } : {})
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new UnsafeUrlError("Redirection sans destination.");
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("Trop de redirections.");
}
