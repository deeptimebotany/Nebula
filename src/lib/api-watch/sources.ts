// Sources officielles relues par la veille des API (02/10/2026) et lecture
// de leur contenu (fonctions pures, testées sans réseau).
//
// - Flux RSS/Atom (vérifiés le 02/10/2026) : chaque article nouveau devient
//   une annonce ; ceux qui parlent de retrait, de fin de vie ou de
//   changement cassant sont « importants » (alerte au propriétaire).
// - Pages de changelog sans flux : le texte de la page est comparé à celui du
//   relevé précédent ; les lignes nouvelles forment une annonce.
// Le premier relevé d'une source sert de point de départ : rien n'est
// signalé pour ce qui existait déjà.
import { createHash } from "crypto";

export interface WatchSource {
  key: string;
  label: string;
  kind: "feed" | "page";
  url: string;
  /** API concernées (registry.ts). */
  apiIds: string[];
  /** Flux généraliste : seuls les articles qui correspondent sont gardés. */
  filter?: RegExp;
}

export const WATCH_SOURCES: WatchSource[] = [
  // Flux officiels.
  { key: "feed:google-ads", label: "Blog des développeurs Google Ads", kind: "feed", url: "https://feeds.feedburner.com/GoogleAdsDeveloperBlog", apiIds: ["google-ads"] },
  {
    key: "feed:google-developers",
    label: "Google Developers Blog",
    kind: "feed",
    url: "https://developers.googleblog.com/rss/",
    apiIds: ["youtube", "gemini-text", "gemini-image"],
    filter: /youtube|gemini|ai studio|drive api|google analytics|oauth|deprecat|sunset/i
  },
  {
    key: "feed:google-ai",
    label: "Google — annonces pour les développeurs",
    kind: "feed",
    url: "https://blog.google/technology/developers/rss/",
    apiIds: ["gemini-text", "gemini-image", "youtube"],
    filter: /gemini|youtube|api|deprecat|model/i
  },
  { key: "feed:meta-developers", label: "Blog Meta for Developers", kind: "feed", url: "https://developers.facebook.com/blog/feed/", apiIds: ["meta-graph", "meta-marketing", "threads"] },
  { key: "feed:atproto", label: "Blog du protocole AT (Bluesky)", kind: "feed", url: "https://atproto.com/rss.xml", apiIds: ["bluesky"] },
  { key: "feed:stripe", label: "Blog Stripe", kind: "feed", url: "https://stripe.com/blog/feed.rss", apiIds: ["stripe"], filter: /api|version|billing|checkout|subscription|deprecat|webhook/i },
  { key: "feed:resend", label: "Changelog Resend", kind: "feed", url: "https://resend.com/changelog/rss.xml", apiIds: ["resend"] },
  { key: "feed:turnstile", label: "Changelog Cloudflare Turnstile", kind: "feed", url: "https://developers.cloudflare.com/changelog/rss/turnstile.xml", apiIds: ["turnstile"] },
  // Pages de changelog (pas de flux).
  { key: "page:gemini-deprecations", label: "Gemini — modèles retirés", kind: "page", url: "https://ai.google.dev/gemini-api/docs/deprecations", apiIds: ["gemini-text", "gemini-image"] },
  { key: "page:gemini-changelog", label: "Gemini — changelog", kind: "page", url: "https://ai.google.dev/gemini-api/docs/changelog", apiIds: ["gemini-text", "gemini-image"] },
  { key: "page:meta-versions", label: "Meta — versions de la Graph API", kind: "page", url: "https://developers.facebook.com/docs/graph-api/changelog/versions/", apiIds: ["meta-graph", "meta-marketing"] },
  { key: "page:threads-changelog", label: "Threads — changelog", kind: "page", url: "https://developers.facebook.com/docs/threads/changelog", apiIds: ["threads"] },
  { key: "page:youtube-data", label: "YouTube Data API — révisions", kind: "page", url: "https://developers.google.com/youtube/v3/revision_history", apiIds: ["youtube"] },
  { key: "page:youtube-analytics", label: "YouTube Analytics API — révisions", kind: "page", url: "https://developers.google.com/youtube/analytics/revision_history", apiIds: ["youtube"] },
  { key: "page:tiktok-changelog", label: "TikTok for Developers — changelog", kind: "page", url: "https://developers.tiktok.com/doc/changelog", apiIds: ["tiktok"] },
  { key: "page:pinterest-changelog", label: "Pinterest — changelog", kind: "page", url: "https://developers.pinterest.com/docs/changelog/changelog/", apiIds: ["pinterest"] },
  { key: "page:linkedin-migrations", label: "LinkedIn — versions et migrations", kind: "page", url: "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/migrations", apiIds: ["linkedin"] },
  { key: "page:google-ads-sunset", label: "Google Ads — dates de fin des versions", kind: "page", url: "https://developers.google.com/google-ads/api/docs/sunset-dates", apiIds: ["google-ads"] }
];

/** Mots qui font d'une annonce une alerte : retrait, fin de vie, changement cassant… */
export const IMPORTANT_PATTERN =
  /deprecat|sunset|shut ?down|end[- ]of[- ]life|\beol\b|retir|discontinu|no longer (?:be )?(?:supported|available)|breaking|removed?\b|removal|will be (?:removed|turned off|disabled)|migrat|décommission|fin de vie|arrêt|supprim/i;

export function isImportant(text: string): boolean {
  return IMPORTANT_PATTERN.test(text);
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Texte brut d'un fragment HTML (balises retirées, entités décodées, espaces resserrés). */
export function htmlToText(html: string): string {
  return decodeEntities(
    stripCdata(html)
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr|\/div|\/section|\/article|\/td|\/dt|\/dd)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export interface FeedEntry {
  id: string;
  title: string;
  url: string | null;
  publishedAt: Date | null;
  summary: string;
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
  return m ? m[1] : null;
}

/** Articles d'un flux RSS 2.0 ou Atom (lecture tolérante, sans dépendance). */
export function parseFeed(xml: string): FeedEntry[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const out: FeedEntry[] = [];
  for (const block of blocks) {
    const title = htmlToText(tag(block, "title") ?? "").replace(/\n/g, " ").trim();
    let url = tag(block, "link");
    url = url ? decodeEntities(stripCdata(url)).trim() : null;
    if (!url) {
      const alt = /<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(block) ?? /<link\b[^>]*href=["']([^"']+)["']/i.exec(block);
      url = alt ? decodeEntities(alt[1]) : null;
    }
    if (url && !/^https?:\/\//i.test(url)) url = null;
    const guid = tag(block, "guid") ?? tag(block, "id");
    const dateRaw = tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated") ?? tag(block, "dc:date");
    const date = dateRaw ? new Date(stripCdata(dateRaw).trim()) : null;
    // Dans un flux, le HTML de la description est souvent échappé (&lt;p&gt;) : décodé d'abord.
    const rawSummary = stripCdata(tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content") ?? "");
    const summary = htmlToText(/&lt;\/?[a-z]/i.test(rawSummary) ? decodeEntities(rawSummary) : rawSummary).replace(/\n/g, " ").slice(0, 400);
    const id = (guid ? decodeEntities(stripCdata(guid)).trim() : "") || url || sha256(title);
    if (!title) continue;
    out.push({ id: id.slice(0, 300), title: title.slice(0, 300), url, publishedAt: date && !Number.isNaN(date.getTime()) ? date : null, summary });
  }
  return out;
}

/** Lignes de texte d'une page, utiles pour une comparaison (menus et lignes très courtes retirés). */
export function pageLines(html: string): string[] {
  const main = /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0] ?? /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of htmlToText(main).split("\n")) {
    // « Last updated 2026-10-02 UTC » change avec la page : il n'est pas une annonce.
    if (line.length < 25 || seen.has(line) || /^(last updated|dernière mise à jour|was this page helpful|send feedback)/i.test(line)) continue;
    seen.add(line);
    out.push(line.slice(0, 500));
  }
  return out;
}

/** Lignes présentes maintenant mais pas au relevé précédent. */
export function newLines(previous: string[], current: string[]): string[] {
  const before = new Set(previous);
  return current.filter((l) => !before.has(l));
}

/** Ne garde du texte d'une page que ce qui sert à la comparaison (taille bornée en base). */
export const SNAPSHOT_MAX_CHARS = 200_000;
export function snapshotOf(lines: string[]): string {
  let total = 0;
  const kept: string[] = [];
  for (const l of lines) {
    total += l.length + 1;
    if (total > SNAPSHOT_MAX_CHARS) break;
    kept.push(l);
  }
  return kept.join("\n");
}
