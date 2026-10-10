// 10/10/2026, demandes de Lucas : rangs rééquilibrés (XP des premiers pas
// réduits, seuils relevés), « Abonnement » au lieu de « Facturation »,
// Réussites dans les onglets principaux, et plus aucun nombre de générations
// restantes nulle part.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EGG_XP, SERIES } from "@/lib/reussites/catalog";
import { STAR_XP } from "@/lib/reussites/skills";
import { ACCOUNT_NAV_ITEMS, NAV_GROUPS } from "@/components/dashboard/navigation";

const read = (f: string) => readFileSync(f, "utf8");
const tierXp = (key: string) => SERIES.flatMap((s) => s.tiers).find((t) => t.key === key)?.xp;

describe("rangs rééquilibrés : premiers pas réduits", () => {
  it("étoile ★1 à 15 XP, premières fois à 20, Premier décollage à 50, 3 réseaux à 40, easter egg à 5", () => {
    expect(STAR_XP[0]).toBe(15);
    expect([tierXp("first-post"), tierXp("explorer"), tierXp("first-thread"), tierXp("bio-live")]).toEqual([20, 20, 20, 20]);
    expect(tierXp("launch")).toBe(50);
    expect(tierXp("multi-network")).toBe(40);
    expect(EGG_XP).toBe(5);
  });
  it("recalcul unique des comptes déjà évalués, avec une annonce", () => {
    const engine = read("src/lib/reussites/engine.ts");
    expect(engine).toContain('export const XP_RECALC_KEY = "recalc:xp-2026-10";');
    expect(engine).toContain('dedupeKey: "reussites:recalc-2026-10"');
    expect(engine).toContain("key: { notIn: [MIGRATION_KEY, XP_RECALC_KEY] }");
  });
});

describe("« Abonnement » au lieu de « Facturation »", () => {
  it("menu du profil, titre de la page, Paramètres ; la recherche trouve encore « facturation »", () => {
    const billing = ACCOUNT_NAV_ITEMS.find((i) => i.href === "/billing")!;
    expect(billing.label).toBe("Abonnement");
    expect(billing.keywords).toContain("facturation");
    expect(read("src/app/(dashboard)/billing/page.tsx")).toContain('<PageHeader title="Abonnement"');
    expect(read("src/components/settings/settings-dialog.tsx")).not.toContain("Facturation");
    expect(read("src/lib/ai/guard.ts")).not.toContain("dans Facturation");
  });
});

describe("Réussites dans les onglets principaux", () => {
  it("juste sous Communauté", () => {
    const main = NAV_GROUPS[0].items.map((i) => i.href);
    expect(main.slice(-2)).toEqual(["/community", "/reussites"]);
    expect(NAV_GROUPS[1].items.map((i) => i.href)).not.toContain("/reussites");
  });
});

describe("plus aucun nombre de générations restantes", () => {
  it("outils, Studio, Rétention, essai : pas de compteur affiché", () => {
    expect(read("src/components/tools/tool-demo-notice.tsx")).not.toContain("restante(s)");
    expect(read("src/app/(dashboard)/studio/page.tsx")).not.toMatch(/restante\$\{|génération\$\{quota\.remaining/);
    expect(read("src/app/(dashboard)/studio/page.tsx")).not.toContain("quota.remaining");
    const retention = read("src/components/retention/insight-view.tsx");
    expect(retention).not.toContain("{r.remaining} analyse");
    expect(retention).not.toContain("achetée{");
    expect(read("src/app/(dashboard)/billing/page.tsx")).not.toContain("{me.ai.quota.retention.used}/");
  });
  it("limite atteinte : message sans chiffre", () => {
    const guard = read("src/lib/ai/guard.ts");
    const fn = guard.slice(guard.indexOf("function quotaMessage("), guard.indexOf("export async function assertAiAllowed("));
    expect(fn).not.toContain("${limit}");
    expect(fn).not.toContain("${nextLimit}");
    expect(fn).toContain("Limite ${of} atteinte pour aujourd'hui");
  });
});
