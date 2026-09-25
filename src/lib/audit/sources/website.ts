// Audit de présence — source « site ou page bio » : une seule requête vers
// la page (https uniquement), par la garde anti-SSRF du site (fetchPublic :
// adresse publique vérifiée à la connexion, chaque redirection revérifiée),
// 512 Ko lus au plus, 6 s au plus. Lecture du HTML sans dépendance : titre,
// description, image de partage, viewport, langue, liens vers les réseaux.
import { UnsafeUrlError, fetchPublic } from "@/lib/net-safety";
import type { SocialLinkKey, SourceOutcome, WebsiteFacts } from "../types";

const MAX_BYTES = 512 * 1024;
const USER_AGENT = "Mozilla/5.0 (compatible; NebulaAudit/1.0; +https://nebulahub.space/outils/audit)";

/** Lit au plus `max` octets du corps (le début d'une page suffit : <head> et premiers liens). */
async function readUpTo(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).subarray(0, max).toString("utf8");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç" };

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return out;
}

const SOCIAL_HOSTS: [SocialLinkKey, RegExp][] = [
  ["youtube", /^(www\.|m\.)?(youtube\.com|youtu\.be)$/],
  ["instagram", /^(www\.)?instagram\.com$/],
  ["tiktok", /^(www\.|vm\.)?tiktok\.com$/],
  ["facebook", /^(www\.|m\.|fr-fr\.)?(facebook\.com|fb\.com|fb\.me)$/],
  ["x", /^(www\.)?(x\.com|twitter\.com)$/],
  ["linkedin", /^([a-z]{2,3}\.)?linkedin\.com$/],
  ["pinterest", /^([a-z]{2,3}\.)?pinterest\.[a-z.]+$/],
  ["threads", /^(www\.)?threads\.(net|com)$/],
  ["bluesky", /^bsky\.app$/]
];

/** Identifiant lu dans un lien de réseau (« @pseudo », « pseudo »), si le lien pointe vers un compte. */
function handleFromLink(key: SocialLinkKey, url: URL): string | null {
  const [first, second] = url.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  if (!first) return null;
  if (key === "youtube") {
    if (first.startsWith("@")) return first.slice(1).toLowerCase();
    if ((first === "channel" || first === "c" || first === "user") && second) return second.toLowerCase();
    return null;
  }
  if (key === "instagram") return ["p", "reel", "reels", "stories", "explore", "tv"].includes(first) ? null : first.toLowerCase();
  if (key === "tiktok") return first.startsWith("@") ? first.slice(1).toLowerCase() : null;
  return first.toLowerCase();
}

/** Lecture du HTML d'une page (fonction pure, testée sans réseau). */
export function parseHtml(html: string, pageUrl: string): Omit<WebsiteFacts, "responseMs"> {
  const url = new URL(pageUrl);
  const head = html.slice(0, 200_000);
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  let description: string | null = null;
  let ogImage = false;
  let viewport = false;
  let noindex = false;
  for (const m of head.matchAll(/<meta\s[^>]*>/gi)) {
    const a = attributes(m[0]);
    const name = (a.name ?? a.property ?? "").toLowerCase();
    const content = a.content ?? "";
    if (name === "description" && content.trim()) description = decodeEntities(content);
    if ((name === "og:image" || name === "og:image:url" || name === "twitter:image") && content.trim()) ogImage = true;
    if (name === "viewport" && /width\s*=\s*device-width/i.test(content)) viewport = true;
    if (name === "robots" && /noindex/i.test(content)) noindex = true;
  }
  const lang = /<html[^>]*\slang\s*=\s*["']?([a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})?)/i.exec(head)?.[1] ?? null;

  const socialLinks: WebsiteFacts["socialLinks"] = {};
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const href = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (!/^https?:\/\//i.test(href) && !href.startsWith("//")) continue;
    let link: URL;
    try {
      link = new URL(href, url);
    } catch {
      continue;
    }
    const host = link.hostname.toLowerCase();
    for (const [key, pattern] of SOCIAL_HOSTS) {
      if (!pattern.test(host)) continue;
      const handle = handleFromLink(key, link);
      if (handle) socialLinks[key] = handle;
      else if (!socialLinks[key]) socialLinks[key] = true;
    }
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    url: url.toString(),
    host: url.hostname.replace(/^www\./, ""),
    https: url.protocol === "https:",
    title: titleMatch ? decodeEntities(titleMatch[1]) || null : null,
    description,
    ogImage,
    viewport,
    lang,
    noindex,
    textLength: text.length,
    socialLinks
  };
}

export async function auditWebsite(pageUrl: string, timeoutMs = 6_000): Promise<SourceOutcome<WebsiteFacts>> {
  const started = Date.now();
  try {
    const res = await fetchPublic(pageUrl, {
      timeoutMs,
      followRedirects: true,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5" }
    });
    const responseMs = Date.now() - started;
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel().catch(() => undefined);
      return { status: "not_found", message: `Page introuvable (erreur ${res.status}) : vérifiez l'adresse.` };
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      await res.body?.cancel().catch(() => undefined);
      return { status: "unavailable", message: "Ce site refuse les visites automatiques (protection anti-robot) : il n'a pas pu être analysé." };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { status: "unavailable", message: `Le site a répondu par une erreur (${res.status}). Réessayez plus tard.` };
    }
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html/i.test(type)) {
      await res.body?.cancel().catch(() => undefined);
      return { status: "not_found", message: "Cette adresse n'est pas une page web (fichier ou autre contenu)." };
    }
    const html = await readUpTo(res, MAX_BYTES);
    // fetchPublic suit les redirections : l'adresse finale est celle de la réponse.
    const finalUrl = res.url && /^https:\/\//.test(res.url) ? res.url : pageUrl;
    return { status: "ok", facts: { ...parseHtml(html, finalUrl), responseMs } };
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      if (/https/.test(err.message)) {
        return { status: "unavailable", message: "Le site renvoie vers une adresse non sécurisée (http://) : activez HTTPS chez votre hébergeur." };
      }
      return { status: "not_found", message: "Adresse refusée : elle doit mener à un site public." };
    }
    const name = (err as Error).name;
    if (name === "TimeoutError" || name === "AbortError") return { status: "unavailable", message: "Le site a mis plus de 6 secondes à répondre." };
    return { status: "unavailable", message: "Impossible d'ouvrir ce site en https:// (connexion sécurisée) : vérifiez l'adresse." };
  }
}
