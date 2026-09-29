// Outils IA de /outils (démo sans compte, quotas par compte) et préférences
// d'affichage enregistrées dans le compte (29/09/2026).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { FREE_IP_DAILY_LIMITS, TOOL_DAILY_LIMITS, toolQuotaMessage } from "@/lib/tools/quota";
import { DEMO_BIO_INSTAGRAM, DEMO_HASHTAGS, DEMO_LEGENDES_BY_NETWORK, DEMO_NOTICE, DEMO_TITRE_YOUTUBE } from "@/lib/tools/demo";
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
  it("légendes et titres : un exemple par réseau proposé, dans les limites de chaque réseau", () => {
    for (const n of LAUNCHED_NETWORKS) {
      const demo = DEMO_LEGENDES_BY_NETWORK[n as keyof typeof DEMO_LEGENDES_BY_NETWORK];
      expect(demo, n).toBeDefined();
      expect(demo.title.length, n).toBeLessThanOrEqual(100);
      expect(demo.description.length, n).toBeLessThanOrEqual(NETWORK_META[n].maxCaption);
    }
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
