// Adresses canoniques (07/10/2026, Search Console : « Page en double sans URL
// canonique sélectionnée par l'utilisateur »). Toute page publique
// indexable déclare son adresse canonique (pageMetadata ou alternates
// .canonical) ; les autres portent « noindex ». Sinon, les liens partagés
// avec ?fbclid=…, ?utm_… ou ?ref=… sont vus par Google comme des doublons.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "(dashboard)" || n === "api" ? [] : pages(p);
    return n === "page.tsx" ? [p] : [];
  });
}

/** La page ou un layout parent fixe-t-il la canonique ou « noindex » ? */
function declared(page: string): boolean {
  const ok = (src: string) => /pageMetadata\(|canonical|index: false/.test(src);
  if (ok(readFileSync(page, "utf8"))) return true;
  for (let d = dirname(page); d.startsWith(join("src", "app")) && d !== join("src", "app"); d = dirname(d)) {
    const layout = join(d, "layout.tsx");
    if (existsSync(layout) && ok(readFileSync(layout, "utf8"))) return true;
  }
  return false;
}

describe("adresses canoniques des pages publiques", () => {
  it("chaque page publique déclare sa canonique ou « noindex »", () => {
    const missing = pages(join("src", "app")).filter((p) => !declared(p));
    expect(missing).toEqual([]);
  });

  it("page bio /l/<marque> : canonique sans paramètres (fbclid, utm…)", () => {
    const src = readFileSync("src/app/l/[slug]/page.tsx", "utf8");
    expect(src).toContain("const canonical = `/l/${encodeURIComponent(params.slug)}`;");
    expect(src).toContain("alternates: { canonical }");
  });
});

describe("sitemap et pré-lancement", () => {
  it("/register n'est dans le sitemap que site ouvert (sinon il renvoie vers /bientot, noindex)", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const prev = process.env.NEXT_PUBLIC_SITE_OPEN;
    try {
      process.env.NEXT_PUBLIC_SITE_OPEN = "";
      expect(sitemap().some((e) => e.url.endsWith("/register"))).toBe(false);
      process.env.NEXT_PUBLIC_SITE_OPEN = "true";
      expect(sitemap().some((e) => e.url.endsWith("/register"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_OPEN;
      else process.env.NEXT_PUBLIC_SITE_OPEN = prev;
    }
  });
});
