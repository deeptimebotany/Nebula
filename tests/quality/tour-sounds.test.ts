// Visite guidée (lot U4) et sons de l'interface (lot U5) : règles pures.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn() }) }));

import { TOUR_STEPS, nextAvailableStep } from "@/components/tour/guided-tour";
import { canPlayUiSound } from "@/lib/ui-sounds";

describe("visite guidée (lot U4)", () => {
  it("six bulles, dans l'ordre du brief, avec leurs textes", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(["brand", "connect", "compose", "calendar", "analytics", "reussites"]);
    expect(TOUR_STEPS[1].text).toBe("Connectez YouTube, Instagram, Facebook ou TikTok. Nebula ne voit jamais vos mots de passe.");
    expect(TOUR_STEPS[5].text).toBe("Chaque semaine, 3 missions pour publier régulièrement.");
    // Sur téléphone, les zones du tiroir pointent le bouton Menu de la barre du bas.
    for (const id of ["brand", "connect", "reussites"]) expect(TOUR_STEPS.find((s) => s.id === id)?.anchors).toContain("mobile-menu");
  });
  it("une étape sans cible est sautée ; plus aucune cible : fin", () => {
    const visible = new Set([0, 2, 5]);
    expect(nextAvailableStep(1, (i) => visible.has(i))).toBe(2);
    expect(nextAvailableStep(3, (i) => visible.has(i))).toBe(5);
    expect(nextAvailableStep(6, () => true)).toBe(-1);
    expect(nextAvailableStep(0, () => false)).toBe(-1);
  });
  it("les cibles data-tour existent dans l'interface", async () => {
    const { readFileSync } = await import("node:fs");
    const src = ["src/components/dashboard/brand-switcher.tsx", "src/components/dashboard/app-header.tsx", "src/components/dashboard/sidebar-nav.tsx", "src/components/dashboard/mobile-tab-bar.tsx"]
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(src).toContain('data-tour="brand-switcher"');
    expect(src).toContain('data-tour="connect-account"');
    expect(src).toContain('data-tour="mobile-menu"');
    expect(src).toContain("data-tour={`nav-${item.href.slice(1)}`}");
  });
});

describe("sons de l'interface (lot U5)", () => {
  const base = { enabled: true, focusMode: false, gesture: true, lastPlayedAt: 0, now: 10_000 };
  it("réglage coupé : aucun son", () => {
    expect(canPlayUiSound({ ...base, enabled: false })).toBe(false);
    expect(canPlayUiSound({ ...base, enabled: false, allowInFocus: true })).toBe(false);
  });
  it("jamais sans clic préalable", () => {
    expect(canPlayUiSound({ ...base, gesture: false })).toBe(false);
  });
  it("Mode focus : seuls les sons de la visite passent", () => {
    expect(canPlayUiSound({ ...base, focusMode: true })).toBe(false);
    expect(canPlayUiSound({ ...base, focusMode: true, allowInFocus: true })).toBe(true);
  });
  it("au plus un son par seconde", () => {
    expect(canPlayUiSound({ ...base, lastPlayedAt: 9_500 })).toBe(false);
    expect(canPlayUiSound({ ...base, lastPlayedAt: 9_000 })).toBe(true);
  });
});
