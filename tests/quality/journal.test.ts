// Journal des mises à jour (02/10/2026) : la consigne « mettre le journal à
// jour à chaque envoi du zip » est vérifiée ici. Chaque élément du README
// (section 4) et chaque migration de la base doivent avoir leur entrée, et
// chaque lien doit mener à une page qui existe.
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { JOURNAL_ENTRIES, JOURNAL_UPDATED_AT } from "@/lib/journal/journal";
import { JOURNAL_CATEGORIES } from "@/lib/journal/journal-types";
import { filterJournal, journalByDay, journalMarkdown } from "@/lib/journal/journal-format";
import { OWNER_NAV_ITEMS } from "@/components/dashboard/navigation";

const ROOT = path.join(__dirname, "../..");

/** Routes des pages de l'application (groupes « (…) » retirés), en motifs. */
function pageRoutes(): RegExp[] {
  const out: RegExp[] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full, /^\(.*\)$/.test(name) ? segments : [...segments, name]);
      } else if (name === "page.tsx") {
        const pattern = segments.map((s) => (/^\[.+\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
        out.push(new RegExp(`^/${pattern}$`));
      }
    }
  };
  walk(path.join(ROOT, "src/app"), []);
  return out;
}

/** Numéros des éléments de la section 4 du README. */
function readmeItems(): number[] {
  const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
  const section = readme.slice(readme.indexOf("## 4."), readme.indexOf("## 5."));
  return Array.from(section.matchAll(/^(\d+)\. \*\*/gm)).map((m) => Number(m[1]));
}

describe("journal des mises à jour", () => {
  it("entrées complètes : identifiant unique, date, catégorie, 1 à 4 pages, résultat et modification", () => {
    expect(JOURNAL_ENTRIES.length).toBeGreaterThan(90);
    const ids = JOURNAL_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of JOURNAL_ENTRIES) {
      expect(e.id, e.id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(e.id.startsWith(e.date), e.id).toBe(true);
      expect(Number.isNaN(Date.parse(`${e.date}T00:00:00Z`)), e.id).toBe(false);
      expect(JOURNAL_CATEGORIES, e.id).toContain(e.category);
      expect(e.links.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.links.length, e.id).toBeLessThanOrEqual(4);
      expect(e.title.length, e.id).toBeGreaterThan(5);
      expect(e.result.length, e.id).toBeGreaterThan(40);
      expect(e.change.length, e.id).toBeGreaterThan(40);
    }
  });

  it("du plus récent au plus ancien ; date du journal = date de la dernière entrée", () => {
    for (let i = 1; i < JOURNAL_ENTRIES.length; i++) expect(JOURNAL_ENTRIES[i].date <= JOURNAL_ENTRIES[i - 1].date, JOURNAL_ENTRIES[i].id).toBe(true);
    expect(JOURNAL_UPDATED_AT).toBe(JOURNAL_ENTRIES[0].date);
  });

  it("chaque lien mène à une page qui existe", () => {
    const routes = pageRoutes();
    for (const e of JOURNAL_ENTRIES) {
      for (const l of e.links) {
        expect(l.href.startsWith("/"), `${e.id} ${l.href}`).toBe(true);
        const pathname = l.href.split(/[?#]/)[0];
        expect(routes.some((r) => r.test(pathname)), `${e.id} : ${l.href}`).toBe(true);
        expect(l.label.length).toBeGreaterThan(1);
      }
    }
  });

  it("CONSIGNE : chaque élément du README (10, 12 à 14, puis 15 et suivants) a son entrée, une seule", () => {
    const items = readmeItems();
    const max = Math.max(...items);
    const required = [10, 12, 13, 14, ...Array.from({ length: max - 14 }, (_, i) => 15 + i)];
    const used = JOURNAL_ENTRIES.filter((e) => e.readme !== undefined).map((e) => e.readme as number);
    for (const n of required) expect(used.filter((u) => u === n).length, `README n° ${n} : ajoutez son entrée au journal (src/lib/journal/journal-data.ts)`).toBe(1);
    for (const n of used) expect(items, `README n° ${n} inexistant`).toContain(n);
  });

  it("CONSIGNE : chaque migration de la base a son entrée, une seule", () => {
    const dirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d));
    const used = JOURNAL_ENTRIES.flatMap((e) => e.migrations);
    for (const d of dirs) expect(used.filter((u) => u === d).length, `migration ${d} : ajoutez-la à son entrée du journal`).toBe(1);
    for (const u of used) expect(dirs, `migration ${u} inexistante`).toContain(u);
  });

  it("recherche sans accents, regroupement par jour, Markdown avec les liens complets", () => {
    expect(filterJournal(JOURNAL_ENTRIES, "reussites v3", null).some((e) => e.id === "2026-10-02-reussites-v3")).toBe(true);
    expect(filterJournal(JOURNAL_ENTRIES, "", "Sécurité").every((e) => e.category === "Sécurité")).toBe(true);
    expect(filterJournal(JOURNAL_ENTRIES, "zzzz introuvable", null)).toEqual([]);
    const days = journalByDay(JOURNAL_ENTRIES);
    expect(days[0].date).toBe(JOURNAL_UPDATED_AT);
    expect(days.reduce((n, d) => n + d.entries.length, 0)).toBe(JOURNAL_ENTRIES.length);
    const md = journalMarkdown(JOURNAL_ENTRIES.slice(0, 1), "https://nebulahub.space/");
    expect(md).toContain("[Veille des API](https://nebulahub.space/admin/api)");
    expect(md).toContain("Résultat : ");
  });

  it("menu du propriétaire : Journal et Veille des API", () => {
    expect(OWNER_NAV_ITEMS.map((i) => i.href)).toEqual(expect.arrayContaining(["/admin/journal", "/admin/api"]));
  });
});
