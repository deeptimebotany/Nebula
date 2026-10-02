// Outils dans l'application (02/10/2026) : calculs du préremplissage, règles
// partagées avec les outils publics, et entrée « Outils » du menu.
import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { auditPrefill, engagementPresets, engagementTotals, type ToolAccountDTO } from "@/lib/tools/app-context-shared";
import { engagementRate, frNumber } from "@/lib/tools/engagement-rate";
import { scoreTitle } from "@/lib/tools/title-score";
import { BEST_TIME_TIMEZONES, hourLabel, timezoneChoices } from "@/lib/tools/best-time";
import { APP_TOOL_SLUGS, TOOL_CATALOG } from "@/components/tools/tool-catalog";
import { ALL_NAV_ITEMS, resolveNav } from "@/components/dashboard/navigation";
import { APP_PREFIXES } from "@/lib/csp";
import { APP_MAP } from "@/lib/ai/assistant-prompts";

const NOW = new Date("2026-10-02T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("préremplissage des outils", () => {
  it("interactions des 30 derniers jours, sinon des 10 dernières publications", () => {
    expect(
      engagementTotals(
        [
          { publishedAt: day(2), likes: 10, comments: 2, shares: null },
          { publishedAt: day(29), likes: 5, comments: null, shares: 1 },
          { publishedAt: day(31), likes: 1000, comments: 1000, shares: 1000 },
          { publishedAt: null, likes: 1000, comments: 0, shares: 0 }
        ],
        NOW
      )
    ).toEqual({ posts: 2, likes: 15, comments: 2, shares: 1, basis: "window" });
    const old = Array.from({ length: 12 }, (_, i) => ({ publishedAt: day(40 + i), likes: 1, comments: 1, shares: 1 }));
    expect(engagementTotals(old, NOW)).toEqual({ posts: 10, likes: 10, comments: 10, shares: 10, basis: "recent" });
    expect(engagementTotals([], NOW)).toBeNull();
    expect(engagementTotals([{ publishedAt: null, likes: 5, comments: 0, shares: 0 }], NOW)).toBeNull();
  });

  it("audit : un @pseudo par réseau, la Page bio publiée, rien pour Facebook", () => {
    expect(
      auditPrefill(
        [
          { network: "INSTAGRAM", handle: "@studio.nova" },
          { network: "INSTAGRAM", handle: "autre" },
          { network: "YOUTUBE", handle: "StudioNovaCafe" },
          { network: "FACEBOOK", handle: "page" },
          { network: "TIKTOK", handle: null }
        ],
        "https://nebulahub.space/l/studio-nova"
      )
    ).toEqual({ instagram: "@studio.nova", youtube: "@StudioNovaCafe", website: "https://nebulahub.space/l/studio-nova" });
    expect(auditPrefill([], null)).toEqual({});
  });

  it("boutons du calculateur : seulement les comptes avec abonnés et publications relevés", () => {
    const base = { displayName: "Studio Nova", handle: "studio.nova" };
    const accounts: ToolAccountDTO[] = [
      { ...base, connectionId: "a", network: "INSTAGRAM", followers: 12000, engagement: { posts: 1, likes: 420, comments: 35, shares: 25, basis: "window" } },
      { ...base, connectionId: "b", network: "TIKTOK", followers: null, engagement: { posts: 3, likes: 1, comments: 1, shares: 1, basis: "window" } },
      { ...base, connectionId: "c", network: "YOUTUBE", handle: null, followers: 500, engagement: { posts: 4, likes: 8, comments: 0, shares: 0, basis: "recent" } }
    ];
    const presets = engagementPresets(accounts);
    expect(presets.map((p) => p.id)).toEqual(["a", "c"]);
    expect(presets[0]).toMatchObject({ label: "Instagram · @studio.nova", detail: "1 publication des 30 derniers jours", followers: 12000, likes: 420 });
    expect(presets[1]).toMatchObject({ label: "YouTube · Studio Nova", detail: "4 dernières publications" });
  });
});

describe("règles partagées avec les outils publics", () => {
  it("taux d'engagement : l'exemple de l'épingle donne 4 %, excellent sur Instagram", () => {
    const r = engagementRate({ followers: 12000, likes: 420, comments: 35, shares: 25, posts: 1 }, "INSTAGRAM")!;
    expect(frNumber(r.rate)).toBe("4");
    expect(r.verdict).toBe("excellent");
    expect(engagementRate({ followers: 0, likes: 1, comments: 0, shares: 0, posts: 1 }, "TIKTOK")).toBeNull();
    expect(engagementRate({ followers: 1000, likes: 10, comments: 0, shares: 0, posts: 0 }, "FACEBOOK")?.verdict).toBe("bon");
    expect(frNumber(0.5)).toBe("0,5");
  });

  it("titre : 80/100 pour l'exemple de l'épingle", () => {
    expect(scoreTitle("5 erreurs qui ruinent vos miniatures YouTube").score).toBe(80);
    expect(scoreTitle("Comment réussir son cold brew en 3 étapes simples ?").score).toBe(100);
  });

  it("meilleur moment : le fuseau de la marque est proposé même hors de la liste", () => {
    expect(timezoneChoices("Asia/Tokyo")[0]).toBe("Asia/Tokyo");
    expect(timezoneChoices("Europe/Paris")).toEqual(BEST_TIME_TIMEZONES);
    expect(hourLabel(9)).toBe("09 h");
  });
});

describe("menu « Outils »", () => {
  it("chaque outil a sa page publique et sa page dans l'application", () => {
    expect(APP_TOOL_SLUGS).toEqual(["audit", "bio-instagram", "hashtags", "titre-youtube", "taux-engagement", "meilleur-moment"]);
    for (const t of TOOL_CATALOG) expect(existsSync(path.join(__dirname, "../../src/app", t.publicHref, "page.tsx")), t.publicHref).toBe(true);
    expect(TOOL_CATALOG.find((t) => t.slug === "publier")?.appHref).toBe("/composer");
  });

  it("entrée de menu, fil d'Ariane, connexion obligatoire, plan donné à l'assistant", () => {
    expect(ALL_NAV_ITEMS.some((i) => i.href === "/tools" && i.label === "Outils")).toBe(true);
    expect(resolveNav("/tools/taux-engagement")).toMatchObject({ item: { href: "/tools" }, pageLabel: "Calculateur de taux d'engagement" });
    expect(APP_PREFIXES).toContain("/tools");
    expect(APP_MAP).toMatch(/Outils \(Taux d'engagement/);
    expect(APP_MAP).toMatch(/Présence → Comptes connectés, Commentaires, Engagements/);
  });
});

describe("assistant sur les pages des outils", () => {
  it("chaque outil a son contexte, la page Outils aussi", async () => {
    const { resolveAssistantContext, ASSISTANT_CONTEXTS } = await import("@/lib/ai/assistant-contexts");
    const { CONTEXT_PROMPTS } = await import("@/lib/ai/assistant-prompts");
    const expected: Record<string, string> = {
      "/tools": "tools",
      "/tools/taux-engagement": "tool-engagement",
      "/tools/meilleur-moment": "tool-best-time",
      "/tools/bio-instagram": "tool-bio",
      "/tools/hashtags": "tool-hashtags",
      "/tools/titre-youtube": "tool-title",
      "/tools/audit": "tool-audit"
    };
    for (const [p, key] of Object.entries(expected)) {
      expect(resolveAssistantContext(p), p).toBe(key);
      const ctx = ASSISTANT_CONTEXTS[key as keyof typeof ASSISTANT_CONTEXTS];
      expect(ctx.suggestions.length, key).toBeGreaterThanOrEqual(6);
      expect(new Set(ctx.suggestions).size).toBe(ctx.suggestions.length);
      expect(CONTEXT_PROMPTS[key as keyof typeof CONTEXT_PROMPTS].instruction, key).toMatch(/Outils/);
    }
    // Chaque page d'outil de l'application a un contexte dédié.
    for (const slug of APP_TOOL_SLUGS) expect(resolveAssistantContext(`/tools/${slug}`)).not.toBe("tools");
  });

  it("chiffres donnés à l'assistant : taux, repères, créneau, fuseau", async () => {
    const { toolContextLines } = await import("@/lib/ai/assistant-prompts");
    const lines = toolContextLines({
      brand: { name: "Studio Nova", timezone: "Europe/Paris" },
      about: "",
      accounts: [{ connectionId: "a", network: "INSTAGRAM", displayName: "Studio", handle: "studio.nova", followers: 12000, engagement: { posts: 1, likes: 420, comments: 35, shares: 25, basis: "window" } }],
      bestTimes: [
        { network: "INSTAGRAM", hasEnoughData: true, bestHour: 18, sampleSize: 12 },
        { network: "TIKTOK", hasEnoughData: false, bestHour: null, sampleSize: 2 }
      ],
      minSnapshots: 5,
      youtubeTitles: [],
      audit: {}
    });
    expect(lines).toEqual([
      "- Fuseau de la marque : Europe/Paris",
      "- Instagram · @studio.nova : taux d'engagement 4 % par publication (1 publication des 30 derniers jours, 12000 abonnés) — excellent ; repères INSTAGRAM : bas 0,5 %, médian 1,5 %, élevé 4 %",
      "- Créneau personnel INSTAGRAM : 18 h (12 relevés)",
      "- Créneau personnel TIKTOK : pas encore assez de relevés (2 sur 5)"
    ]);
  });
});
