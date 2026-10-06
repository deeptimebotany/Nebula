// Outils IA de /outils (démo sans compte, quotas par compte) et préférences
// d'affichage enregistrées dans le compte (29/09/2026).
import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { FREE_IP_DAILY_LIMITS, TOOL_DAILY_LIMITS, toolQuotaMessage } from "@/lib/tools/quota";
import { DEMO_BIO_INSTAGRAM, DEMO_HASHTAGS, DEMO_NOTICE, DEMO_TITRE_YOUTUBE } from "@/lib/tools/demo";
import { LAUNCHED_NETWORKS, NETWORK_META } from "@/lib/types";
import { UI_PREF_MAX_VALUE, isSyncedPrefKey, mergeUiPrefs, sanitizeUiPrefs } from "@/lib/ui-prefs";
import { composerDraftSchema } from "@/lib/composer-draft-schema";
import { normalizeComposerDraft } from "@/lib/composer-draft";
import { passwordTooLong } from "@/lib/password-rules";

describe("outils IA : quotas", () => {
  it("les paliers payants ont plus que le Gratuit ; plafond IP au-dessus du quota Gratuit", () => {
    for (const kind of ["text", "thumbnail"] as const) {
      expect(TOOL_DAILY_LIMITS.FREE[kind]).toBeLessThan(TOOL_DAILY_LIMITS.PRO[kind]);
      expect(TOOL_DAILY_LIMITS.PRO[kind]).toBeLessThan(TOOL_DAILY_LIMITS.AGENCY[kind]);
      expect(FREE_IP_DAILY_LIMITS[kind]).toBeGreaterThan(TOOL_DAILY_LIMITS.FREE[kind]);
    }
  });
  it("messages de quota lisibles", () => {
    expect(toolQuotaMessage("FREE", "text", { ok: false, limit: 10, remaining: 0 })).toMatch(/10 générations gratuites.*Pro/);
    expect(toolQuotaMessage("FREE", "thumbnail", { ok: false, limit: 2, remaining: 0, ipLimited: true })).toMatch(/depuis cette connexion/);
  });
});

describe("outils IA : démos", () => {
  it("la démo dit qu'elle n'utilise pas l'IA", () => {
    expect(DEMO_NOTICE).toMatch(/sans IA/);
    expect(DEMO_NOTICE).toMatch(/compte gratuit/);
  });
  it("exemples conformes aux règles de chaque outil", () => {
    expect(DEMO_BIO_INSTAGRAM.result).toHaveLength(5);
    for (const bio of DEMO_BIO_INSTAGRAM.result) expect(bio.length).toBeLessThanOrEqual(150);
    expect(DEMO_HASHTAGS.result.map((g) => g.label)).toEqual(["Larges", "Moyens", "De niche"]);
    for (const g of DEMO_HASHTAGS.result) for (const h of g.items) expect(h).toMatch(/^#[a-z0-9]+$/);
    expect(DEMO_TITRE_YOUTUBE.result).toHaveLength(3);
    for (const t of DEMO_TITRE_YOUTUBE.result) expect(t.length).toBeLessThanOrEqual(60);
  });
});

describe("Générateur de publications retiré (06/10/2026)", () => {
  const root = process.cwd();
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");

  it("plus de page ni de routes IA propres à l'outil", () => {
    for (const dir of ["src/app/outils/publier", "src/app/outils/legendes", "src/app/outils/miniatures", "src/app/api/public/tools/captions", "src/app/api/public/tools/pick-frames", "src/app/api/public/tools/thumbnail"]) {
      expect(existsSync(path.join(root, dir)), dir).toBe(false);
    }
  });

  it("son adresse et celles des anciens outils mènent aux outils gratuits", async () => {
    const config = createRequire(import.meta.url)(path.join(root, "next.config.js")) as { redirects: () => Promise<{ source: string; destination: string; permanent: boolean }[]> };
    const redirects = await config.redirects();
    for (const source of ["/outils/publier", "/outils/legendes", "/outils/miniatures"]) {
      expect(redirects.find((r) => r.source === source), source).toMatchObject({ destination: "/outils", permanent: true });
    }
  });

  it("aucun lien vers l'outil, nulle part sur le site", () => {
    for (const file of [
      "src/app/outils/page.tsx",
      "src/components/tools/tool-catalog.ts",
      "src/components/marketing/marketing-footer.tsx",
      "src/app/sitemap.ts",
      "src/app/llms.txt/route.ts",
      "src/lib/seo-pages.ts",
      "src/lib/csp.ts",
      "src/app/outils/hashtags/page.tsx",
      "src/app/outils/bio-instagram/page.tsx",
      "src/app/outils/taux-engagement/page.tsx",
      "src/app/outils/meilleur-moment/page.tsx",
      "src/app/outils/titre-youtube/page.tsx",
      "src/app/(dashboard)/tools/page.tsx",
      "src/lib/emails/lifecycle.ts"
    ]) {
      expect(read(file), file).not.toMatch(/outils\/(publier|legendes|miniatures)/);
      expect(read(file), file).not.toMatch(/[Gg]énérateur de publications"/);
    }
    expect(read("src/app/outils/page.tsx")).toMatch(/TOOL_CATALOG\.map/);
  });
});

describe("préférences d'affichage dans le compte", () => {
  it("liste fermée de clés", () => {
    expect(isSyncedPrefKey("nebula:calendar-view")).toBe(true);
    expect(isSyncedPrefKey("nebula:onboarding-dismissed:ckabc123")).toBe(true);
    expect(isSyncedPrefKey("nebula:milestone-followers-10000:ckabc")).toBe(true);
    expect(isSyncedPrefKey("nebula:theme")).toBe(false);
    expect(isSyncedPrefKey("nebula:onboarding-dismissed:<script>")).toBe(false);
    expect(isSyncedPrefKey("autre")).toBe(false);
  });
  it("valeurs nettoyées et bornées", () => {
    expect(sanitizeUiPrefs({ "nebula:calendar-view": "week", "nebula:theme": "x", "nebula:sidebar-collapsed": 1 })).toEqual({ "nebula:calendar-view": "week" });
    expect(sanitizeUiPrefs(null)).toEqual({});
    expect(mergeUiPrefs({}, { "nebula:hack": "1" }).ok).toBe(false);
    expect(mergeUiPrefs({}, { "nebula:calendar-view": "x".repeat(UI_PREF_MAX_VALUE + 1) }).ok).toBe(false);
    const merged = mergeUiPrefs({ "nebula:calendar-view": "week" }, { "nebula:calendar-view": null, "nebula:sidebar-collapsed": "1" });
    expect(merged).toEqual({ ok: true, prefs: { "nebula:sidebar-collapsed": "1" } });
  });
  it("brouillon du Composer : forme vérifiée, valeurs par défaut", () => {
    expect(composerDraftSchema.parse({ caption: "Bonjour" })).toEqual({ title: "", caption: "Bonjour", selectedNetworks: [], savedAt: 0 });
    expect(composerDraftSchema.safeParse({ caption: 3 }).success).toBe(false);
    // Même règles côté navigateur, sans zod.
    expect(normalizeComposerDraft({ caption: "Bonjour" })).toEqual({ title: "", caption: "Bonjour", selectedNetworks: [], savedAt: 0 });
    expect(normalizeComposerDraft({ caption: 3 })).toBeNull();
    expect(normalizeComposerDraft({ caption: "x", selectedNetworks: "YOUTUBE" })).toBeNull();
  });
});

describe("mots de passe", () => {
  it("au-delà de 72 octets (limite de bcrypt), refusé plutôt que tronqué", () => {
    expect(passwordTooLong("a".repeat(72))).toBe(false);
    expect(passwordTooLong("a".repeat(73))).toBe(true);
    expect(passwordTooLong("é".repeat(37))).toBe(true);
  });
});
