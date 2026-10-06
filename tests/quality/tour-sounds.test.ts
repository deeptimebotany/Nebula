// Visite guidée (lot U4) et sons de l'interface (lot U5) : règles pures.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn() }) }));

import { readFileSync } from "node:fs";
import { TOUR_STEPS, nextAvailableStep, place } from "@/components/tour/guided-tour";
import { TOUR_STEP_COUNT } from "@/lib/tour-events";
import { canPlayUiSound } from "@/lib/ui-sounds";

describe("visite guidée (lot U4)", () => {
  it("sept bulles, dans l'ordre du brief, avec leurs textes", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(["brand", "connect", "compose", "calendar", "analytics", "reussites", "focus"]);
    // L'API de la visite accepte exactement ces étapes.
    expect(TOUR_STEPS).toHaveLength(TOUR_STEP_COUNT);
    expect(readFileSync("src/app/api/me/tour/route.ts", "utf8")).toContain("max(TOUR_STEP_COUNT - 1)");
    expect(TOUR_STEPS[1].text).toBe("Connectez YouTube, Instagram, Facebook ou TikTok. Nebula ne voit jamais vos mots de passe.");
    // Réussites mises en avant ; le Mode focus a sa propre étape (06/10/2026),
    // qui pointe Paramètres (flèche) et écrit le chemin du réglage.
    expect(TOUR_STEPS[5].text).toMatch(/^Chaque semaine, 3 missions pour publier régulièrement/);
    expect(TOUR_STEPS[5].text).not.toContain("Mode focus");
    const focus = TOUR_STEPS[6];
    expect(focus.title).toBe("Mode focus");
    expect(focus.text).toContain("Mode focus coupe tout d'un clic");
    expect(focus.text).toContain("Paramètres");
    expect(focus.anchors).toEqual(["nav-settings", "mobile-menu"]);
    expect(focus.path).toEqual(["Paramètres", "Apparence & Succès", "Mode focus"]);
    expect(focus.arrow).toBe(true);
    expect(TOUR_STEPS.filter((s) => s.focusChoice).map((s) => s.id)).toEqual(["focus"]);
    expect(TOUR_STEPS.filter((s) => s.arrow).map((s) => s.id)).toEqual(["focus"]);
    // Le chemin affiché correspond aux vrais libellés : onglet des Paramètres et interrupteur.
    const settings = readFileSync("src/app/(dashboard)/settings/page.tsx", "utf8");
    expect(settings).toContain('{ value: "apparence", label: "Apparence & Succès" }');
    expect(settings).toContain('aria-label="Mode focus"');
    expect(readFileSync("src/components/dashboard/navigation.ts", "utf8")).toMatch(/href: "\/settings", label: "Paramètres"/);
    // Sur téléphone, les zones du tiroir pointent le bouton Menu de la barre du bas.
    for (const id of ["brand", "connect", "reussites", "focus"]) expect(TOUR_STEPS.find((s) => s.id === id)?.anchors).toContain("mobile-menu");
  });
  it("flèche : part du bord de la bulle et touche l'anneau de la cible", () => {
    const vp = { width: 1440, height: 900 };
    // Paramètres dans la barre latérale : bulle à droite, flèche horizontale vers la gauche.
    const side = place({ top: 600, left: 16, width: 220, height: 40 }, 260, vp, true);
    expect(side.side).toBe("right");
    expect(side.left).toBe(16 + 220 + 64);
    expect(side.arrow).toEqual({ x1: side.left - 6, y1: 620, x2: 16 + 220 + 6 + 6, y2: 620 });
    // Sans flèche : écart habituel, pas de flèche.
    const plain = place({ top: 600, left: 16, width: 220, height: 40 }, 260, vp);
    expect(plain.arrow).toBeNull();
    expect(plain.left).toBe(16 + 220 + 12);
    // Téléphone : bouton Menu en bas à droite, bulle au-dessus, flèche vers le bas, dans la bulle.
    const phone = place({ top: 790, left: 320, width: 60, height: 48 }, 300, { width: 390, height: 844 }, true);
    expect(phone.side).toBe("above");
    expect(phone.arrow!.y1).toBe(phone.top + 300 + 6);
    expect(phone.arrow!.y2).toBe(790 - 6 - 6);
    expect(phone.arrow!.x1).toBeGreaterThanOrEqual(phone.left + 22);
    expect(phone.arrow!.x1).toBeLessThanOrEqual(phone.left + Math.min(300, 390 - 32) - 22);
    expect(phone.arrow!.x2).toBe(350);
    // Cible tout en bas : le départ reste dans la bulle (pas dans un coin).
    const low = place({ top: 860, left: 16, width: 220, height: 30 }, 400, vp, true);
    expect(low.arrow!.y1).toBeLessThanOrEqual(low.top + 400 - 22);
  });
  it("une étape sans cible est sautée ; plus aucune cible : fin", () => {
    const visible = new Set([0, 2, 5]);
    expect(nextAvailableStep(1, (i) => visible.has(i))).toBe(2);
    expect(nextAvailableStep(3, (i) => visible.has(i))).toBe(5);
    expect(nextAvailableStep(7, () => true)).toBe(-1);
    expect(nextAvailableStep(0, () => false)).toBe(-1);
  });
  it("les cibles data-tour existent dans l'interface", async () => {
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
