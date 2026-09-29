// SEO technique (29/09/2026) : titres et descriptions dans les longueurs
// lues par Google, uniques, canoniques ; données structurées sans note ni
// avis inventés, prix repris de PLAN_LIMITS ; JSON-LD impossible à casser.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { META_DESCRIPTION_MAX, clampDescription, pageMetadata, serializeJsonLd, softwareApplicationLd, toolStructuredData, ldGraph } from "@/lib/seo";
import { SEO_ALTERNATIVES, SEO_CONTACT, SEO_DISCOVER, SEO_HOME, SEO_LEGAL, SEO_LOGIN, SEO_NETWORKS, SEO_PRICING, SEO_REGISTER, SEO_SECURITY, SEO_TOOLS, SEO_TOOLS_HUB, type SeoPage } from "@/lib/seo-pages";
import { PLAN_LIMITS } from "@/lib/plans";

const PAGES: SeoPage[] = [SEO_HOME, SEO_PRICING, SEO_TOOLS_HUB, ...Object.values(SEO_TOOLS), SEO_CONTACT, SEO_SECURITY, SEO_LEGAL, SEO_REGISTER, SEO_LOGIN, SEO_ALTERNATIVES, SEO_NETWORKS, ...Object.values(SEO_DISCOVER)];

describe("balises des pages publiques", () => {
  it("titres de 60 caractères au plus, descriptions de 155 au plus (jamais coupées)", () => {
    for (const p of PAGES) {
      expect(p.title.length, p.path).toBeLessThanOrEqual(60);
      expect(p.description.length, p.path).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
      expect(p.description.length, p.path).toBeGreaterThanOrEqual(70);
    }
  });

  it("titres, descriptions et adresses uniques", () => {
    for (const key of ["title", "description", "path"] as const) {
      const values = PAGES.map((p) => p[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
  });

  it("chaque page a sa canonique et ses propres aperçus de partage", () => {
    const m = pageMetadata(SEO_TOOLS.hashtags);
    expect(m.alternates?.canonical).toBe("/outils/hashtags");
    expect(m.openGraph).toMatchObject({ url: "/outils/hashtags", title: `${SEO_TOOLS.hashtags.title} — Nebula`, description: SEO_TOOLS.hashtags.description });
    expect(m.description).toBe(SEO_TOOLS.hashtags.description);
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
    const home = pageMetadata({ ...SEO_HOME, absoluteTitle: true });
    expect(home.title).toEqual({ absolute: SEO_HOME.title });
  });

  it("chaque outil du plan du site a ses balises et ses données structurées", () => {
    const sitemap = readFileSync(path.join(process.cwd(), "src/app/sitemap.ts"), "utf8");
    const tools = [...sitemap.matchAll(/\/outils\/([a-z-]+)`/g)].map((m) => m[1]);
    expect(tools.length).toBe(8);
    for (const t of tools) {
      expect(SEO_TOOLS[t], t).toBeDefined();
      const [app, crumbs] = toolStructuredData(SEO_TOOLS[t]);
      expect(app).toMatchObject({ "@type": "WebApplication", isAccessibleForFree: true });
      expect(crumbs).toMatchObject({ "@type": "BreadcrumbList" });
    }
  });

  it("les outils IA disent qu'il faut un compte gratuit pour générer", () => {
    for (const key of ["legendes", "miniatures", "bio-instagram", "hashtags"]) expect(SEO_TOOLS[key].description).toMatch(/compte gratuit/);
  });

  it("clampDescription coupe au mot et ajoute « … »", () => {
    const long = "mot ".repeat(80);
    const c = clampDescription(long);
    expect(c.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    expect(c.endsWith("…")).toBe(true);
    expect(clampDescription("court")).toBe("court");
  });
});

describe("données structurées", () => {
  it("application : prix réels de chaque palier, aucune note ni avis", () => {
    const app = softwareApplicationLd() as { offers: { price: string; priceCurrency: string }[] };
    expect(app.offers.map((o) => Number(o.price))).toEqual([PLAN_LIMITS.FREE.tiers[0].priceMonthly, PLAN_LIMITS.PRO.tiers[0].priceMonthly, PLAN_LIMITS.AGENCY.tiers[0].priceMonthly]);
    expect(app.offers.every((o) => o.priceCurrency === "EUR")).toBe(true);
    const raw = JSON.stringify(app);
    expect(raw).not.toMatch(/aggregateRating|"review"/);
  });

  it("un texte ne peut jamais fermer la balise <script>", () => {
    const out = serializeJsonLd(ldGraph({ name: "</script><script>alert(1)</script>" }));
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)["@graph"][0].name).toBe("</script><script>alert(1)</script>");
  });
});
