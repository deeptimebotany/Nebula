// Grille du 02/10/2026 et offres fondateurs : les prix viennent de plans.ts
// et founders-offer.ts, l'annuel offre 2 mois partout, Nebula reste le
// moins cher sur le scénario de référence des comparatifs, et plus aucune
// promesse d'« utilisateurs illimités » (pas de comptes d'équipe).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, annualFreeMonths, brandChoicesLabel, brandsText, findTier, topTier, upToBrandsText } from "@/lib/plans";
import {
  FOUNDERS_SALE_ENDS_AT,
  FOUNDERS_SALE_END_LABEL,
  FOUNDER_MONTHLY,
  FOUNDER_PREMIUM,
  addMonthsUtc,
  euros,
  founderDiscountCents,
  founderRegularPrice,
  foundersSaleOpen,
  isFounderMonthlyTier,
  placesOf,
  placesText
} from "@/lib/founders-offer";
import { COMPETITORS, REFERENCE_SCENARIO, nebulaEstimate, toEur } from "@/data/competitors";

const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("grille du 02/10/2026", () => {
  it("Pro 1 / 5 / 10 marques à 12 / 19 / 29 €, Agence 15 / 25 / 50 à 39 / 59 / 99 €", () => {
    expect(PLAN_LIMITS.PRO.tiers.map((t) => [t.maxBrands, t.priceMonthly, t.priceYearly])).toEqual([
      [1, 12, 120],
      [5, 19, 190],
      [10, 29, 290]
    ]);
    expect(PLAN_LIMITS.AGENCY.tiers.map((t) => [t.maxBrands, t.priceMonthly, t.priceYearly])).toEqual([
      [15, 39, 390],
      [25, 59, 590],
      [50, 99, 990]
    ]);
    for (const t of [...PLAN_LIMITS.PRO.tiers, ...PLAN_LIMITS.AGENCY.tiers]) expect(annualFreeMonths(t)).toBe(2);
    expect(findTier("PRO", 1)?.stripePriceEnvVars).toEqual({ month: "STRIPE_PRICE_PRO_1_MONTHLY", year: "STRIPE_PRICE_PRO_1_YEARLY" });
    expect(findTier("PRO", 3)).toBeUndefined();
    // Quotas par marque inchangés ; Gratuit inchangé.
    expect([PLAN_LIMITS.PRO.maxConnections, PLAN_LIMITS.PRO.maxPostsPerMonth]).toEqual([8, 100]);
    expect([PLAN_LIMITS.FREE.tiers[0].maxBrands, PLAN_LIMITS.FREE.maxConnections, PLAN_LIMITS.FREE.maxPostsPerMonth]).toEqual([1, 4, 20]);
    // Miniatures IA : Pro 20, Agence 60 par mois (inchangé).
    expect([PLAN_LIMITS.PRO.aiMonthly.image, PLAN_LIMITS.AGENCY.aiMonthly.image, PLAN_LIMITS.FREE.aiMonthly.image]).toEqual([20, 60, 0]);
    expect(PLAN_LIMITS.PRO.features[0]).toBe("1, 5 ou 10 marques au choix");
  });

  it("libellés des marques sans « 1 marques »", () => {
    expect([brandsText(1), brandsText(5), upToBrandsText(1), upToBrandsText(10)]).toEqual(["1 marque", "5 marques", "1 marque", "jusqu'à 10 marques"]);
    expect(brandChoicesLabel("PRO")).toBe("1, 5 ou 10");
    expect(brandChoicesLabel("AGENCY")).toBe("15, 25 ou 50");
    expect(topTier("PRO").maxBrands).toBe(10);
  });

  it("Nebula reste le moins cher sur le scénario de référence (3 marques, 8 comptes)", () => {
    const nebula = nebulaEstimate(REFERENCE_SCENARIO);
    expect(nebula).toMatchObject({ plan: "PRO", maxBrands: 5, monthlyMonthly: 19 });
    for (const c of COMPETITORS) {
      const est = toEur(c.estimate(REFERENCE_SCENARIO).monthly, c.currency);
      if (est !== null) expect(est, c.name).toBeGreaterThan(nebula.monthlyAnnual);
    }
    // Une seule marque : Pro 1 marque.
    expect(nebulaEstimate({ brands: 1, accounts: 6, users: 1 })).toMatchObject({ plan: "PRO", maxBrands: 1, monthlyMonthly: 12 });
  });

  it("plus aucune promesse « utilisateurs illimités » pour Nebula", () => {
    const files = [...walk(path.join(ROOT, "src/app")), ...walk(path.join(ROOT, "src/components")), path.join(ROOT, "src/data/competitors.ts"), path.join(ROOT, "src/lib/plans.ts")];
    const offenders = files.filter((f) => {
      const text = readFileSync(f, "utf8");
      // Les concurrents peuvent l'afficher (« par canal, utilisateurs illimités ») : seules les lignes sur Nebula comptent.
      return /utilisateurs illimités/i.test(text) && !f.endsWith("competitors.ts");
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
    const competitors = readFileSync(path.join(ROOT, "src/data/competitors.ts"), "utf8");
    const nebulaPart = competitors.slice(competitors.indexOf("export function nebulaEstimate"), competitors.indexOf("export function toEur"));
    expect(nebulaPart).not.toMatch(/illimités\.`/);
    expect(nebulaPart).not.toMatch(/utilisateurs illimités/);
  });

  it("aucune grille écrite en dur ailleurs que dans plans.ts (ex. FAQ de l'accueil)", () => {
    const files = [...walk(path.join(ROOT, "src/app")), ...walk(path.join(ROOT, "src/components")), ...walk(path.join(ROOT, "src/lib"))].filter((f) => !f.endsWith("plans.ts") && !f.includes(`${path.sep}journal${path.sep}`));
    const stale = /3, 5 ou 10|1, 5 ou 10|15, 25 ou 50|Pro dès \d+ ?€|[^0-9,.]9 ?€ ?(\/|par) ?mois/;
    const offenders = files.filter((f) => stale.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe("offres fondateurs", () => {
  it("Fondateur : 10 € pendant 3 mois puis 12 €, coupon de 2 €, Pro 1 marque mensuel seulement", () => {
    expect(FOUNDER_MONTHLY).toMatchObject({ plan: "PRO", maxBrands: 1, priceMonthly: 10, months: 3, places: 100 });
    expect(founderRegularPrice()).toBe(12);
    expect(founderDiscountCents()).toBe(200);
    expect(isFounderMonthlyTier("PRO", 1, "month")).toBe(true);
    expect(isFounderMonthlyTier("PRO", 1, "year")).toBe(false);
    expect(isFounderMonthlyTier("PRO", 5, "month")).toBe(false);
    expect(isFounderMonthlyTier("AGENCY", 1, "month")).toBe(false);
  });

  it("Fondateur Premium : 100 € une fois, 12 mois, 100 places", () => {
    expect(FOUNDER_PREMIUM).toMatchObject({ plan: "PRO", maxBrands: 1, priceCents: 10000, months: 12, places: 100 });
    expect(euros(FOUNDER_PREMIUM.priceCents)).toBe("100 €");
  });

  it("fin de la vente : 1er janvier 2027 à 0 h, heure de Paris, affichée partout où les offres apparaissent", () => {
    expect(FOUNDERS_SALE_ENDS_AT.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(FOUNDERS_SALE_END_LABEL).toBe("1er janvier 2027");
    expect(foundersSaleOpen(new Date("2026-12-31T23:59:59+01:00"))).toBe(true);
    expect(foundersSaleOpen(new Date("2027-01-01T00:00:00+01:00"))).toBe(false);
    for (const f of [
      "src/components/marketing/founder-offers-public.tsx",
      "src/components/billing/founder-offers.tsx",
      "src/components/billing/upgrade-modal.tsx",
      "src/components/marketing/faq.tsx",
      "src/app/tarifs/page.tsx",
      "src/app/legal/page.tsx",
      "src/app/llms.txt/route.ts"
    ]) {
      expect(readFileSync(path.join(ROOT, f), "utf8"), f).toContain("FOUNDERS_SALE_END_LABEL");
    }
    // Section publique : valeur du serveur au premier rendu (pas d'écart d'hydratation), puis l'heure et l'API.
    const pub = readFileSync(path.join(ROOT, "src/components/marketing/founder-offers-public.tsx"), "utf8");
    expect(pub).toContain("if (!saleOpen) return null;");
    for (const f of ["src/app/page.tsx", "src/app/tarifs/page.tsx"]) expect(readFileSync(path.join(ROOT, f), "utf8"), f).toContain("foundersOpen={foundersSaleOpen()}");
  });

  it("places et dates", () => {
    expect(placesOf(100, 3)).toEqual({ total: 100, taken: 3, left: 97 });
    expect(placesOf(100, 104).left).toBe(0);
    expect([placesText(0), placesText(1), placesText(42)]).toEqual(["complet", "1 place restante", "42 places restantes"]);
    expect(addMonthsUtc(new Date("2026-10-02T09:00:00Z"), 12).toISOString()).toBe("2027-10-02T09:00:00.000Z");
    expect(addMonthsUtc(new Date("2027-01-31T12:00:00Z"), 1).toISOString()).toBe("2027-02-28T12:00:00.000Z");
    expect(addMonthsUtc(new Date("2028-02-29T12:00:00Z"), 12).toISOString()).toBe("2029-02-28T12:00:00.000Z");
  });
});
