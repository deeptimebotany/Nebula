// Mode clair par défaut (29/09/2026) : script de <head>, empreinte CSP,
// pages au design propre, valeurs par défaut côté serveur.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLOR_MODE_SCRIPT,
  COLOR_MODE_SCRIPT_HASH,
  COLOR_MODE_STORAGE_KEY,
  DEFAULT_COLOR_MODE,
  FORCED_DARK_PREFIXES,
  accountModeScript,
  isForcedDarkPath
} from "@/lib/color-mode";
import { buildCsp } from "@/lib/csp";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Exécute un script de mode dans un faux navigateur ; renvoie le mode posé sur <html>. */
function run(script: string, { pathname = "/", stored = null as string | null, storageThrows = false, initial = "light" as string | undefined } = {}) {
  const dataset: Record<string, string | undefined> = { mode: initial };
  const store = new Map<string, string>();
  if (stored !== null) store.set(COLOR_MODE_STORAGE_KEY, stored);
  const localStorage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error("SecurityError");
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (storageThrows) throw new Error("SecurityError");
      store.set(k, v);
    }
  };
  new Function("document", "location", "localStorage", script)({ documentElement: { dataset } }, { pathname }, localStorage);
  return { mode: dataset.mode, stored: store.get(COLOR_MODE_STORAGE_KEY) ?? null };
}

describe("script de <head>", () => {
  it("clair par défaut, sombre seulement si choisi dans ce navigateur", () => {
    expect(DEFAULT_COLOR_MODE).toBe("light");
    expect(run(COLOR_MODE_SCRIPT).mode).toBe("light");
    expect(run(COLOR_MODE_SCRIPT, { stored: "dark" }).mode).toBe("dark");
    expect(run(COLOR_MODE_SCRIPT, { stored: "light" }).mode).toBe("light");
    expect(run(COLOR_MODE_SCRIPT, { stored: "n'importe quoi" }).mode).toBe("light");
    // Stockage bloqué (navigation privée stricte) : le clair du HTML reste.
    expect(run(COLOR_MODE_SCRIPT, { stored: "dark", storageThrows: true }).mode).toBe("light");
  });

  it("pages au design propre : toujours en sombre (le design d'origine), même si le visiteur a choisi le clair", () => {
    for (const prefix of FORCED_DARK_PREFIXES) {
      expect(run(COLOR_MODE_SCRIPT, { pathname: `${prefix}/abc`, stored: "light" }).mode, prefix).toBe("dark");
      expect(isForcedDarkPath(`${prefix}/abc`)).toBe(true);
    }
    for (const pathname of ["/legal", "/login", "/kits", "/rapports", "/outils", "/decouvrir/page-bio", "/decouvrir/media-kit", "/dashboard"]) {
      expect(run(COLOR_MODE_SCRIPT, { pathname }).mode, pathname).toBe("light");
      expect(isForcedDarkPath(pathname), pathname).toBe(false);
    }
  });

  it("chaque page au design propre existe et remet le sombre en cas d'arrivée par un lien interne", () => {
    for (const prefix of FORCED_DARK_PREFIXES) {
      const layout = `src/app${prefix}/layout.tsx`;
      expect(existsSync(path.join(ROOT, layout)), layout).toBe(true);
      expect(read(layout), layout).toMatch(/<ForcedDarkMode \/>/);
    }
  });

  it("empreinte CSP à jour (sinon : recopier la valeur attendue dans color-mode.ts)", () => {
    const expected = `sha256-${createHash("sha256").update(COLOR_MODE_SCRIPT, "utf8").digest("base64")}`;
    expect(COLOR_MODE_SCRIPT_HASH).toBe(expected);
  });

  it("CSP stricte : le script est autorisé par son empreinte ; la vitrine reste en 'unsafe-inline' sans empreinte", () => {
    const scriptSrc = (csp: string) => csp.split("; ").find((d) => d.startsWith("script-src "))!;
    const strict = scriptSrc(buildCsp({ nonce: "abc123", dev: false }));
    expect(strict).toContain(`'${COLOR_MODE_SCRIPT_HASH}'`);
    expect(strict).not.toContain("unsafe-inline");
    // Une empreinte dans la CSP vitrine ferait ignorer 'unsafe-inline' (scripts de Next.js bloqués).
    expect(buildCsp({ nonce: null, dev: false })).not.toContain("sha256-");
  });

  it("mise en page racine : HTML écrit en clair, script tel quel dans <head>", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toMatch(/data-mode=\{DEFAULT_COLOR_MODE\}/);
    expect(layout).toMatch(/suppressHydrationWarning/);
    expect(layout).toMatch(/<head>\s*<script dangerouslySetInnerHTML=\{\{ __html: COLOR_MODE_SCRIPT \}\} \/>\s*<\/head>/);
    expect(layout).toMatch(/colorScheme: "light"/);
  });
});

describe("mode du compte", () => {
  it("script du tableau de bord : applique et mémorise le mode du compte", () => {
    expect(run(accountModeScript("dark")).mode).toBe("dark");
    expect(run(accountModeScript("dark")).stored).toBe("dark");
    expect(run(accountModeScript("light"), { initial: "dark", stored: "dark" })).toEqual({ mode: "light", stored: "light" });
    // Stockage bloqué : le mode est quand même appliqué.
    expect(run(accountModeScript("dark"), { storageThrows: true }).mode).toBe("dark");
    // Seules deux valeurs possibles dans le script (jamais de texte venu d'ailleurs).
    expect(accountModeScript("x" as never)).toBe(accountModeScript("light"));
  });

  it("valeurs par défaut serveur en clair (schéma, migration, /api/me, /api/settings/mode)", () => {
    expect(read("prisma/schema.prisma")).toMatch(/colorMode String @default\("light"\)/);
    expect(read("prisma/migrations/20261003090000_light_mode_default/migration.sql")).toMatch(/SET DEFAULT 'light'/);
    expect(read("src/lib/me.ts")).toMatch(/mode: user\.colorMode === "dark" \? "dark" : "light"/);
    expect(read("src/app/api/settings/mode/route.ts")).toMatch(/colorMode === "dark" \? "dark" : "light"/);
    expect(read("src/components/mode-provider.tsx")).toMatch(/DEFAULT_COLOR_MODE as DEFAULT_MODE/);
  });
});
