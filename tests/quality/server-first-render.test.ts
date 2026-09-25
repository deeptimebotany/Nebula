// Premier affichage préparé par le serveur (lot 10) : marque active lue
// dans un cookie (vérifiée côté serveur), données « semées » dans le cache
// sans appel en double, et séparation code serveur / code du navigateur.
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// React 18 stable n'expose `cache` qu'aux composants serveur (Next fournit sa
// propre version) : ici, simple passage.
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T>(fn: T) => fn }));
const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: (name: string) => (name === "nb_brand" && jar.value ? { name, value: jar.value } : undefined) }) }));
const db = vi.hoisted(() => ({ memberships: [] as unknown[] }));
vi.mock("@/lib/prisma", () => ({ prisma: { membership: { findMany: vi.fn(async () => db.memberships) } } }));

import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { ACTIVE_BRAND_COOKIE, activeBrandFromCookie, rememberActiveBrand } from "@/lib/active-brand";
import { SEED_FRESH_MS, SeededData, useSeedIsFresh, useSeededMount } from "@/lib/data/swr-config";
import { resolveActiveBrand } from "@/lib/server-data/brands";

const membership = (id: string, name: string, connections = 0) => ({
  role: "OWNER",
  brand: { id, name, slug: id, logoUrl: null, timezone: null, _count: { connections } }
});

describe("marque active (cookie nb_brand)", () => {
  beforeEach(() => {
    jar.value = undefined;
    db.memberships = [membership("brand_a", "Studio Nova", 3), membership("brand_b", "Atelier Lune")];
  });

  it("le serveur prend la marque du cookie si elle appartient au compte", async () => {
    jar.value = "brand_b";
    const res = await resolveActiveBrand("user_1");
    expect(res.activeBrand?.name).toBe("Atelier Lune");
    expect(res.fromCookie).toBe(true);
    expect(res.brands.map((b) => [b.id, b.connectionsCount, b.timezone])).toEqual([
      ["brand_a", 3, "Europe/Paris"],
      ["brand_b", 0, "Europe/Paris"]
    ]);
  });

  it("cookie d'une marque d'un AUTRE compte (ou inventé) : ignoré, première marque du compte", async () => {
    jar.value = "brand_d_un_autre_compte";
    const res = await resolveActiveBrand("user_1");
    expect(res.activeBrand?.id).toBe("brand_a");
    expect(res.fromCookie).toBe(false);
  });

  it("pas de cookie : première marque ; aucun accès : aucune marque", async () => {
    expect((await resolveActiveBrand("user_1")).activeBrand?.id).toBe("brand_a");
    db.memberships = [];
    expect((await resolveActiveBrand("user_1")).activeBrand).toBeNull();
  });
});

describe("mémorisation dans le navigateur", () => {
  let written: string[];
  let stored: Record<string, string>;
  beforeEach(() => {
    written = [];
    stored = {};
    const doc = { cookie: "" };
    Object.defineProperty(doc, "cookie", {
      get: () => "autre=1; nb_brand=brand_b",
      set: (v: string) => written.push(v)
    });
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    vi.stubGlobal("localStorage", { setItem: (k: string, v: string) => (stored[k] = v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("cookie d'un an, tout le site, Secure en https ; localStorage aussi", () => {
    rememberActiveBrand("cmufwz5i90001hgelvadv0i3x");
    expect(written).toEqual([`${ACTIVE_BRAND_COOKIE}=cmufwz5i90001hgelvadv0i3x; Path=/; Max-Age=31536000; SameSite=Lax; Secure`]);
    expect(stored["nebula:activeBrandId"]).toBe("cmufwz5i90001hgelvadv0i3x");
    expect(activeBrandFromCookie()).toBe("brand_b");
  });

  it("identifiant anormal : aucun cookie écrit (pas d'attribut injecté)", () => {
    rememberActiveBrand("x; Domain=exemple.com");
    expect(written).toEqual([]);
  });
});

describe("données préparées par le serveur (SeededData)", () => {
  const KEY = "/api/analytics?brandId=brand_a";
  function probe(key: string) {
    let seen: { fresh: boolean; mount: boolean | undefined } | null = null;
    function Probe() {
      seen = { fresh: useSeedIsFresh(key), mount: useSeededMount(key) };
      return null;
    }
    return { element: createElement(Probe), result: () => seen };
  }
  const seeded = (entries: Record<string, unknown>, at: number, child: ReactNode) => createElement(SeededData, { entries, at, children: child });

  it("donnée tout juste préparée : pas de nouvel appel au montage", () => {
    const p = probe(KEY);
    renderToString(seeded({ [KEY]: { connections: [] } }, Date.now(), p.element));
    expect(p.result()).toEqual({ fresh: true, mount: false });
  });

  it("donnée âgée de plus de SEED_FRESH_MS : chargement normal", () => {
    const p = probe(KEY);
    renderToString(seeded({ [KEY]: { connections: [] } }, Date.now() - SEED_FRESH_MS - 1000, p.element));
    expect(p.result()).toEqual({ fresh: false, mount: undefined });
  });

  it("adresse non préparée (ou hors SeededData) : chargement normal", () => {
    const p = probe("/api/connections?brandId=brand_a");
    renderToString(seeded({ [KEY]: {} }, Date.now(), p.element));
    expect(p.result()).toEqual({ fresh: false, mount: undefined });
    const alone = probe(KEY);
    renderToString(alone.element);
    expect(alone.result()).toEqual({ fresh: false, mount: undefined });
  });

  it("imbriqués (layout + page) : les deux jeux de données restent connus", () => {
    const layoutKey = "/api/connections?brandId=brand_a";
    const a = probe(layoutKey);
    const b = probe(KEY);
    renderToString(seeded({ [layoutKey]: {} }, Date.now(), seeded({ [KEY]: {} }, Date.now(), [a.element, b.element])));
    expect(a.result()?.fresh).toBe(true);
    expect(b.result()?.fresh).toBe(true);
  });
});

describe("séparation serveur / navigateur", () => {
  const root = path.join(__dirname, "../../src");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  walk(root);
  const isClient = (code: string) => /^\s*["']use client["']/.test(code);

  it("aucun composant « use client » n'importe du code serveur (base, cookies, données préparées)", () => {
    const offenders = files.filter((f) => {
      const code = readFileSync(f, "utf8");
      return isClient(code) && /from ["'](@\/lib\/prisma|@\/lib\/server-data\/[^"']+|next\/headers|@\/lib\/premium-server)["']/.test(code);
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("les modules partagés avec le serveur (clés de cache, marque active, accueils) restent sans « use client »", () => {
    // Une valeur importée d'un module « use client » par un composant
    // serveur devient une référence client : la clé ne vaudrait plus rien.
    for (const shared of ["lib/data/keys.ts", "lib/active-brand.ts", "lib/dashboard-greetings.ts"]) {
      expect(isClient(readFileSync(path.join(root, shared), "utf8")), shared).toBe(false);
    }
  });
});
