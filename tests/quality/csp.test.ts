// CSP en deux niveaux et pages pré-générées (lot 11) : chaque page est
// classée, les pages à nonce sont rendues à chaque visite, les pages de la
// vitrine peuvent être pré-générées, et le middleware pose la bonne
// politique.
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ token: null as null | Record<string, unknown> }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => auth.token) }));

import { NextRequest } from "next/server";
import { STATIC_PAGES, buildCsp, needsStrictDocument, usesStrictCsp, APP_PREFIXES, USER_CONTENT_PREFIXES } from "@/lib/csp";
import { middleware } from "@/middleware";

const APP_DIR = path.join(__dirname, "../../src/app");

/** Toutes les pages : adresse (groupes « (x) » retirés) → fichiers page + layouts de la racine à la page. */
function listPages() {
  const pages: { route: string; file: string; chain: string[] }[] = [];
  const walk = (dir: string, segments: string[], layouts: string[]) => {
    const layout = path.join(dir, "layout.tsx");
    const chain = existsSync(layout) ? [...layouts, layout] : layouts;
    const page = path.join(dir, "page.tsx");
    if (existsSync(page)) {
      const route = "/" + segments.filter((s) => !/^\(.*\)$/.test(s)).join("/");
      pages.push({ route, file: page, chain: [...chain, page] });
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "api") walk(path.join(dir, entry.name), [...segments, entry.name], chain);
    }
  };
  walk(APP_DIR, [], []);
  return pages;
}
const pages = listPages();
const read = (f: string) => readFileSync(f, "utf8");
const FORCE_DYNAMIC = /export const dynamic = ["']force-dynamic["']/;
const rel = (f: string) => path.relative(APP_DIR, f);

describe("classement des pages", () => {
  it("chaque page est soit à CSP stricte, soit listée dans STATIC_PAGES (nouvelle page = décision explicite)", () => {
    const unclassified = pages.filter((p) => !usesStrictCsp(p.route) && !(STATIC_PAGES as readonly string[]).includes(p.route)).map((p) => p.route);
    expect(unclassified).toEqual([]);
    const both = pages.filter((p) => usesStrictCsp(p.route) && (STATIC_PAGES as readonly string[]).includes(p.route)).map((p) => p.route);
    expect(both).toEqual([]);
  });

  it("chaque page de STATIC_PAGES existe", () => {
    const routes = new Set(pages.map((p) => p.route));
    expect(STATIC_PAGES.filter((r) => !routes.has(r))).toEqual([]);
  });

  it("pages à CSP stricte : rendues à chaque visite (sinon le nonce serait figé et les scripts bloqués)", () => {
    const rootLayout = path.join(APP_DIR, "layout.tsx");
    const missing = pages
      .filter((p) => usesStrictCsp(p.route))
      .filter((p) => !p.chain.some((f) => f !== rootLayout && FORCE_DYNAMIC.test(read(f))))
      .map((p) => rel(p.file));
    expect(missing).toEqual([]);
  });

  it("pages de la vitrine : rien qui force un rendu par visite (session, cookies, en-têtes, paramètres d'adresse)", () => {
    const offenders = pages
      .filter((p) => (STATIC_PAGES as readonly string[]).includes(p.route))
      .flatMap((p) =>
        p.chain
          .filter((f) => /export const dynamic\s*=|getServerSession|headers\(\)|cookies\(\)|searchParams|@\/lib\/prisma/.test(read(f)))
          .map((f) => `${p.route} ← ${rel(f)}`)
      );
    expect(offenders).toEqual([]);
    expect(read(path.join(APP_DIR, "layout.tsx"))).not.toMatch(/export const dynamic\s*=/);
  });

  it("pages de la vitrine à paramètre : liste fixe, adresse inconnue → 404 sans rendu", () => {
    for (const route of STATIC_PAGES.filter((r) => r.includes("["))) {
      const code = read(pages.find((p) => p.route === route)!.file);
      expect(code, route).toMatch(/generateStaticParams/);
      expect(code, route).toMatch(/export const dynamicParams = false/);
    }
  });

  it("une page qui exige un document strict est toujours servie avec la CSP stricte (pas de rechargement en boucle)", () => {
    for (const prefix of [...APP_PREFIXES, ...USER_CONTENT_PREFIXES]) {
      expect(needsStrictDocument(prefix)).toBe(true);
      expect(usesStrictCsp(prefix)).toBe(true);
      expect(usesStrictCsp(`${prefix}/x`)).toBe(true);
    }
    expect(needsStrictDocument("/login")).toBe(false);
    expect(needsStrictDocument("/tarifs")).toBe(false);
    // Préfixe exact seulement : « /legal » n'est pas « /l ».
    expect(usesStrictCsp("/legal")).toBe(false);
    expect(usesStrictCsp("/l/cafe-nebula")).toBe(true);
  });
});

describe("politiques", () => {
  const scriptSrc = (csp: string) => csp.split("; ").find((d) => d.startsWith("script-src "))!;
  const others = (csp: string) => csp.split("; ").filter((d) => !d.startsWith("script-src "));

  it("stricte : nonce + strict-dynamic, jamais 'unsafe-inline' ni 'unsafe-eval' en production", () => {
    const s = scriptSrc(buildCsp({ nonce: "abc123", dev: false }));
    expect(s).toContain("'nonce-abc123'");
    expect(s).toContain("'strict-dynamic'");
    expect(s).not.toContain("unsafe-inline");
    expect(s).not.toContain("unsafe-eval");
  });

  it("vitrine : scripts du site et de la page, sans nonce ; toutes les autres règles identiques", () => {
    const vitrine = buildCsp({ nonce: null, dev: false });
    const strict = buildCsp({ nonce: "abc123", dev: false });
    // Un nonce ou 'strict-dynamic' ferait ignorer 'unsafe-inline' : scripts de la page bloqués.
    expect(scriptSrc(vitrine)).toBe("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
    expect(others(vitrine)).toEqual(others(strict));
    expect(vitrine).toContain("object-src 'none'");
    expect(vitrine).toContain("frame-ancestors 'self'");
  });
});

describe("middleware", () => {
  beforeEach(() => {
    auth.token = null;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CSP_MODE", "");
    vi.stubEnv("NEXTAUTH_SECRET", "secret-de-test");
  });
  const run = (url: string) => middleware(new NextRequest(url));

  it("page de la vitrine : CSP vitrine, aucun nonce transmis à Next.js", async () => {
    const res = await run("https://nebulahub.space/tarifs");
    expect(res.headers.get("content-security-policy")).toContain("'unsafe-inline' https://challenges.cloudflare.com");
    expect(res.headers.get("content-security-policy")).not.toContain("nonce-");
    expect(res.headers.get("x-middleware-request-x-nonce")).toBeNull();
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBeNull();
  });

  it("page bio : CSP stricte, même nonce dans la réponse et pour Next.js, différent à chaque requête", async () => {
    const a = await run("https://nebulahub.space/l/cafe-nebula");
    const b = await run("https://nebulahub.space/l/cafe-nebula");
    const nonce = a.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toBeTruthy();
    expect(a.headers.get("content-security-policy")).toContain(`'nonce-${nonce}'`);
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(a.headers.get("content-security-policy"));
    expect(b.headers.get("x-middleware-request-x-nonce")).not.toBe(nonce);
  });

  it("accueil : visiteur connecté → tableau de bord ; anonyme → page (cookie d'attribution posé)", async () => {
    const anonymous = await run("https://nebulahub.space/?utm_source=instagram&via=cafe");
    expect(anonymous.headers.get("location")).toBeNull();
    expect(anonymous.headers.get("set-cookie")).toContain("nb_attr=");
    auth.token = { uid: "u1" };
    const connected = await run("https://nebulahub.space/?utm_source=instagram");
    expect(connected.status).toBe(307);
    expect(connected.headers.get("location")).toBe("https://nebulahub.space/dashboard");
  });

  it("application sans session → /login avec retour ; avec session → CSP stricte", async () => {
    const out = await run("https://nebulahub.space/composer?draft=1");
    expect(out.headers.get("location")).toBe("https://nebulahub.space/login?callbackUrl=%2Fcomposer%3Fdraft%3D1");
    auth.token = { uid: "u1" };
    const inside = await run("https://nebulahub.space/composer");
    expect(inside.headers.get("content-security-policy")).toContain("'strict-dynamic'");
  });

  it("soupape CSP_MODE=report-only : politique en rapport seul", async () => {
    vi.stubEnv("CSP_MODE", "report-only");
    const res = await run("https://nebulahub.space/tarifs");
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("content-security-policy-report-only")).toContain("'unsafe-inline'");
  });
});
