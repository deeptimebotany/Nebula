// Extraction des liens d'une page Linktree publique (brief growth, lot
// G6.b) : __NEXT_DATA__ si présent (objets { title, url }), sinon les
// balises <a>. Fonctions pures, testables, sans accès réseau — la route
// /api/link-in-bio/import-linktree fait le téléchargement.

export interface ExtractedLink {
  label: string;
  url: string;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function isExternalHttp(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && !/linktr\.ee$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** Parcourt récursivement le JSON de __NEXT_DATA__ à la recherche d'objets
 * { title, url } (forme des liens Linktree), sans dépendre de leur chemin. */
function collectFromJson(node: unknown, out: ExtractedLink[], depth = 0) {
  if (!node || depth > 12) return;
  if (Array.isArray(node)) {
    for (const item of node) collectFromJson(item, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.title === "string" && typeof o.url === "string" && isExternalHttp(o.url)) {
      out.push({ label: o.title.trim().slice(0, 60), url: o.url.trim().slice(0, 500) });
    }
    for (const v of Object.values(o)) collectFromJson(v, out, depth + 1);
  }
}

export function extractLinktreeLinks(html: string): ExtractedLink[] {
  const found: ExtractedLink[] = [];
  const nextData = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    try {
      collectFromJson(JSON.parse(nextData[1]), found);
    } catch {
      // JSON illisible : on retombe sur les balises <a>
    }
  }
  if (found.length === 0) {
    const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && found.length < 200) {
      const url = decodeEntities(m[1]);
      const label = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      if (!isExternalHttp(url) || !label) continue;
      found.push({ label: label.slice(0, 60), url: url.slice(0, 500) });
    }
  }
  const seen = new Set<string>();
  return found.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

