// Brief « Essai 14 jours » (29/09/2026) : fonctions pures du palier Essai,
// de l'anti-abus et de la fin d'essai. Les scénarios sur un vrai Postgres
// sont dans tests/integration/trial.test.ts.
import { describe, expect, it, vi } from "vitest";

// Fonctions pures seulement : aucune base de données ici.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { PAID_PLANS, PLANS, PLAN_LIMITS, PUBLIC_PLANS, isPaidPlanId, planIncludes } from "@/lib/plans";
import { canonicalEmail } from "@/lib/billing/trial-eligibility";
import { isDisposableDomain } from "@/data/disposable-domains";
import { pickConnectionsToKeep, pickDefaultActiveBrand, sortByUsage } from "@/lib/billing/free-limits";
import { aiDailyLimit, aiEmailConfirmed, globalAiBudget } from "@/lib/ai/guard";
import { TOOL_DAILY_LIMITS } from "@/lib/tools/quota";
import { estimateCostUsd } from "@/lib/ai/pricing";

const d = (s: string) => new Date(s);

describe("palier Essai (lot E1)", () => {
  it("chaque palier a toutes ses limites (satisfies Record<Plan, PlanLimits>)", () => {
    const keys = Object.keys(PLAN_LIMITS.PRO).sort();
    for (const plan of PLANS) expect(Object.keys(PLAN_LIMITS[plan]).sort()).toEqual(keys);
  });
  it("les limites du tableau « Décisions retenues »", () => {
    expect(PLAN_LIMITS.FREE.aiDaily).toEqual({ text: 10, image: 2, assistant: 0, retention: 0 });
    expect(PLAN_LIMITS.TRIAL.aiDaily).toEqual({ text: 20, image: 3, assistant: 20, retention: 3 });
    expect(PLAN_LIMITS.PRO.aiDaily).toEqual({ text: 60, image: 15, assistant: 100, retention: 10 });
    expect(PLAN_LIMITS.AGENCY.aiDaily).toEqual({ text: 150, image: 40, assistant: 300, retention: 30 });
    expect([PLAN_LIMITS.FREE, PLAN_LIMITS.TRIAL, PLAN_LIMITS.PRO, PLAN_LIMITS.AGENCY].map((l) => l.studioDailyLimit)).toEqual([0, 5, 15, 40]);
    expect(PLAN_LIMITS.TRIAL.tiers.map((t) => t.maxBrands)).toEqual([2]);
  });
  it("l'essai a les fonctions de Pro, sans celles d'Agence", () => {
    const t = PLAN_LIMITS.TRIAL;
    expect([t.reportsEnabled, t.calendarShareEnabled, t.mediaKitEnabled, t.aiEnabled]).toEqual([true, true, true, true]);
    expect(t.maxBioLinks).toBe(PLAN_LIMITS.PRO.maxBioLinks);
    expect([t.approvalsEnabled, t.apiEnabled, t.whiteLabelEnabled, t.pdfReportEnabled]).toEqual([false, false, false, false]);
    expect(planIncludes("TRIAL", "PRO")).toBe(true);
    expect(planIncludes("TRIAL", "AGENCY")).toBe(false);
  });
  it("l'essai ne s'achète jamais et n'apparaît pas dans les tarifs publics", () => {
    expect(PLAN_LIMITS.TRIAL.purchasable).toBe(false);
    expect(isPaidPlanId("TRIAL")).toBe(false);
    expect(PAID_PLANS).not.toContain("TRIAL");
    expect(PUBLIC_PLANS).not.toContain("TRIAL");
  });
  it("les quotas des outils se lisent dans plans.ts", () => {
    expect(TOOL_DAILY_LIMITS.TRIAL).toEqual({ text: 20, thumbnail: 3 });
    expect(aiDailyLimit(PLAN_LIMITS.TRIAL, "studio")).toBe(5);
    expect(PLAN_LIMITS.PRO.aiBudgetBucket).toBeNull();
    expect(PLAN_LIMITS.TRIAL.aiBudgetBucket).toBe("trial");
  });
  it("aucune garde ne compare des noms de paliers (src)", () => {
    // Autorisés : affichage (mise en avant de Pro dans les tarifs, texte du Gratuit).
    const allowed = [/pricing-(section|comparison)\.tsx$/, /competitors\.ts$/, /dev-preview-client\.tsx$/, /billing\/page\.tsx$/, /lib\/plans\.ts$/];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !allowed.some((re) => re.test(full))) {
          const src = readFileSync(full, "utf8");
          if (/(===|!==)\s*"(PRO|AGENCY|TRIAL|FREE|pro|free)"|\.includes\("pro"\)/.test(src)) offenders.push(full);
        }
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});

describe("porte de l'IA (lot E2)", () => {
  it("adresse confirmée : lien cliqué, ou Google / Apple (sans mot de passe), ou Facebook", () => {
    expect(aiEmailConfirmed({ emailVerifiedAt: null, passwordHash: "x", facebookLoginId: null })).toBe(false);
    expect(aiEmailConfirmed({ emailVerifiedAt: new Date(), passwordHash: "x", facebookLoginId: null })).toBe(true);
    expect(aiEmailConfirmed({ emailVerifiedAt: null, passwordHash: null, facebookLoginId: null })).toBe(true);
    expect(aiEmailConfirmed({ emailVerifiedAt: null, passwordHash: "x", facebookLoginId: "fb1" })).toBe(true);
    expect(aiEmailConfirmed(null)).toBe(false);
  });
  it("budgets globaux par défaut : 100 images et 1 000 appels texte, par palier", () => {
    expect(globalAiBudget("trial")).toEqual({ image: 100, text: 1000 });
    expect(globalAiBudget("free")).toEqual({ image: 100, text: 1000 });
  });
  it("coût estimé : jetons × prix, image au prix unitaire", () => {
    expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 0, images: 0 }, "text")).toBeCloseTo(0.3);
    expect(estimateCostUsd({ inputTokens: 0, outputTokens: 0, images: 2 }, "image")).toBeCloseTo(0.078);
  });
});

describe("anti-abus de l'essai (lot E3)", () => {
  it("adresse canonique : majuscules, espaces, +alias, points Gmail, googlemail", () => {
    expect(canonicalEmail("  Lucas.Nomme@Example.FR ")).toBe("lucas.nomme@example.fr");
    expect(canonicalEmail("lucas+essai2@example.fr")).toBe("lucas@example.fr");
    expect(canonicalEmail("l.u.c.a.s+x@gmail.com")).toBe("lucas@gmail.com");
    expect(canonicalEmail("Lucas.N@googlemail.com")).toBe("lucasn@gmail.com");
    // Points gardés ailleurs que chez Gmail.
    expect(canonicalEmail("l.u.c.a.s@outlook.fr")).toBe("l.u.c.a.s@outlook.fr");
  });
  it("domaines jetables, sous-domaines compris ; jamais les domaines courants", () => {
    expect(isDisposableDomain("yopmail.com")).toBe(true);
    expect(isDisposableDomain("MAILINATOR.com")).toBe(true);
    expect(isDisposableDomain("inbox.guerrillamail.com")).toBe(true);
    expect(isDisposableDomain("gmail.com")).toBe(false);
    expect(isDisposableDomain("orange.fr")).toBe(false);
    expect(isDisposableDomain("com")).toBe(false);
  });
});

describe("fin d'essai (lot E4)", () => {
  it("marque active par défaut : la plus utilisée sur 14 jours", () => {
    const brands = [
      { id: "a", createdAt: d("2026-01-01"), uses: 2 },
      { id: "b", createdAt: d("2026-02-01"), uses: 7 },
      { id: "c", createdAt: d("2026-03-01"), uses: 1 }
    ];
    expect(pickDefaultActiveBrand(brands)?.id).toBe("b");
  });
  it("à égalité, la plus ancienne", () => {
    const brands = [
      { id: "new", createdAt: d("2026-05-01"), uses: 3 },
      { id: "old", createdAt: d("2026-01-01"), uses: 3 }
    ];
    expect(pickDefaultActiveBrand(brands)?.id).toBe("old");
    expect(sortByUsage([{ id: "x", createdAt: d("2026-01-01"), uses: 0 }]).length).toBe(1);
    expect(pickDefaultActiveBrand([])).toBeNull();
  });
  it("comptes gardés : le choix d'abord, puis les plus utilisés, Instagram + Facebook comptant pour un", () => {
    const c = (id: string, network: string, uses: number) => ({ id, network, uses, createdAt: d("2026-01-01") });
    const conns = [c("ig", "INSTAGRAM", 5), c("fb", "FACEBOOK", 5), c("yt", "YOUTUBE", 9), c("tt", "TIKTOK", 1), c("bs", "BLUESKY", 3), c("li", "LINKEDIN", 0)];
    const kept = pickConnectionsToKeep(conns, 4, null);
    expect(Array.from(kept).sort()).toEqual(["bs", "fb", "ig", "tt", "yt"].sort());
    const chosen = pickConnectionsToKeep(conns, 4, ["li", "tt"]);
    expect(chosen.has("li")).toBe(true);
    expect(chosen.has("tt")).toBe(true);
  });
});
