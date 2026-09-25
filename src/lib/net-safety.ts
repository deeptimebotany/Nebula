// Garde « anti-SSRF » : avant que le serveur appelle une adresse fournie par
// un utilisateur (webhook, import de média par URL via l'API ou un CSV), on
// vérifie qu'elle est en https et qu'elle pointe vers Internet — jamais vers
// le serveur lui-même, un réseau privé ou les services internes de
// l'hébergeur (169.254.169.254…).
//
// Renforcé par l'audit sécurité (lot 1) :
//  - classement des adresses par la BlockList de Node : les formes IPv6 qui
//    cachent une adresse IPv4 privée ([::ffff:127.0.0.1], NAT64 64:ff9b::,
//    6to4, Teredo…) ne passent plus ;
//  - l'adresse est vérifiée AU MOMENT DE LA CONNEXION (résolution DNS faite
//    par notre propre fonction dans l'agent HTTP) : un domaine qui change
//    d'adresse entre la vérification et l'appel (« DNS rebinding ») ne peut
//    plus viser le réseau interne ;
//  - chaque redirection est revérifiée, y compris vers une IP écrite en clair.
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "dns";
import { BlockList, isIP } from "net";
import { Agent, fetch as undiciFetch } from "undici";

export class UnsafeUrlError extends Error {}

// Deux listes séparées : une liste unique qui contiendrait des règles IPv6
// sur les adresses IPv4 mappées (::ffff:0:0/96) bloquerait aussi toutes les
// adresses IPv4 publiques (Node compare les IPv4 sous leur forme mappée).
const BLOCKED_V4 = new BlockList();
const BLOCKED_V6 = new BlockList();
const IPV4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8], // « ce réseau »
  ["10.0.0.0", 8], // privé
  ["100.64.0.0", 10], // NAT des opérateurs
  ["127.0.0.0", 8], // boucle locale
  ["169.254.0.0", 16], // lien local (métadonnées cloud)
  ["172.16.0.0", 12], // privé
  ["192.0.0.0", 24], // IETF
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // relais 6to4
  ["192.168.0.0", 16], // privé
  ["198.18.0.0", 15], // bancs de test
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4] // réservé + diffusion
];
const IPV6_BLOCKED: Array<[string, number]> = [
  ["::", 96], // non spécifiée, boucle locale, IPv4 « compatibles » (::a.b.c.d)
  ["::ffff:0:0", 96], // IPv4 mappées (::ffff:127.0.0.1) : toutes refusées
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48], // NAT64 local
  ["100::", 64], // à jeter
  ["2001::", 32], // Teredo (IPv4 cachée)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (IPv4 cachée)
  ["fc00::", 7], // privé (ULA)
  ["fe80::", 10], // lien local
  ["fec0::", 10], // ancien « site local »
  ["ff00::", 8] // multicast
];
for (const [net, prefix] of IPV4_BLOCKED) BLOCKED_V4.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of IPV6_BLOCKED) BLOCKED_V6.addSubnet(net, prefix, "ipv6");

/** Vrai si l'adresse IP n'est pas une adresse publique d'Internet (ou n'est pas une IP). */
export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return BLOCKED_V4.check(ip, "ipv4");
  if (family === 6) return BLOCKED_V6.check(ip, "ipv6");
  return true;
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
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
  const host = hostOf(url).toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("Adresse locale refusée : elle doit être joignable depuis Internet.");
  }
  if (isIP(host) && isPrivateIp(host)) throw new UnsafeUrlError("Adresse d'un réseau privé refusée.");
  return url;
}

/** Vérifie la forme ET que le domaine pointe vers une adresse publique. */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  const url = checkUrlShape(raw);
  const host = hostOf(url);
  if (isIP(host)) return url;
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) =>
    dnsLookup(host, { all: true }, (err, list) => (err ? reject(new UnsafeUrlError("Nom de domaine introuvable.")) : resolve(list)))
  );
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("Adresse d'un réseau privé refusée.");
  }
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * Résolution DNS utilisée par l'agent HTTP au moment de se connecter : si
 * une seule des adresses du domaine est privée, la connexion est refusée.
 */
export function safeLookup(hostname: string, options: LookupOptions | number | undefined, callback: LookupCallback): void {
  const opts: LookupOptions = typeof options === "number" ? { family: options } : { ...(options ?? {}) };
  dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateIp(a.address))) {
      const blocked = new UnsafeUrlError("Adresse d'un réseau privé refusée.") as NodeJS.ErrnoException;
      blocked.code = "EPRIVATEADDRESS";
      return callback(blocked, "");
    }
    if (opts.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

// Agent HTTP dédié aux adresses fournies par les utilisateurs.
let publicAgent: Agent | null = null;
function agent(): Agent {
  if (!publicAgent) publicAgent = new Agent({ connect: { lookup: safeLookup as never }, connections: 16 });
  return publicAgent;
}

function isBlockedConnection(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i++) {
    if (current instanceof UnsafeUrlError || (current as { code?: string }).code === "EPRIVATEADDRESS") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export interface PublicFetchInit {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Suivre les redirections (GET uniquement, 6 au plus, chacune revérifiée). */
  followRedirects?: boolean;
}

/**
 * Appel d'une adresse publique fournie par un utilisateur. Chaque saut de
 * redirection est revérifié, et l'IP est contrôlée à la connexion.
 */
export async function fetchPublic(raw: string, init: PublicFetchInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const follow = init.followRedirects ?? method === "GET";
  let current = raw;
  for (let hop = 0; hop < 7; hop++) {
    checkUrlShape(current);
    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(current, {
        method,
        headers: init.headers,
        body: init.body,
        redirect: "manual",
        dispatcher: agent(),
        ...(init.timeoutMs ? { signal: AbortSignal.timeout(init.timeoutMs) } : {})
      });
    } catch (err) {
      if (isBlockedConnection(err)) throw new UnsafeUrlError("Adresse d'un réseau privé refusée.");
      throw err;
    }
    if (follow && res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!location) throw new UnsafeUrlError("Redirection sans destination.");
      current = new URL(location, current).toString();
      continue;
    }
    return res as unknown as Response;
  }
  throw new UnsafeUrlError("Trop de redirections.");
}

/** Lit le corps d'une réponse en s'arrêtant dès que la taille maximale est dépassée. */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("fichier trop volumineux");
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("fichier trop volumineux");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
