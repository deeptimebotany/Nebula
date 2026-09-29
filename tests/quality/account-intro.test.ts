// Intro de création de compte (29/09/2026) : calendrier du canevas, relais
// avec le logo SVG, densité de pixels, et cohérence shader / CSS.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INTRO_DURATION, INTRO_ICON_SIZE, INTRO_LAND, introCanvasDpr, introFrame } from "@/lib/intro/timeline";
import { INTRO_FRAGMENT_SHADER } from "@/components/intro/intro-shader";
import { WELCOME_INTRO_COOKIE, WELCOME_INTRO_MAX_AGE } from "@/lib/intro/welcome";

const SCREENS: Array<[number, number]> = [
  [390, 844], // téléphone
  [1280, 720],
  [1920, 1080],
  [3440, 1440], // ultra-large
  [900, 900]
];
// Rayon intérieur du trou central des anneaux, en fraction de S (demi-petit
// axe 6,4 moins la demi-épaisseur du trait 1,7, sur 32 unités).
const HOLE = (6.4 - 1.7) / 32;

describe("intro — calendrier du canevas", () => {
  it("départ sur une page blanche : tout l'écran tient dans le trou des anneaux", () => {
    for (const [W, H] of SCREENS) {
      const f = introFrame(0, W, H);
      const halfDiagonal = Math.hypot(W, H) / 2;
      // Marge large (déformation de la lentille comprise).
      expect(f.S * HOLE).toBeGreaterThan(halfDiagonal * 1.3);
      expect(f.ringA).toBe(1);
      expect(f.blobA).toBe(0);
    }
  });

  it("les anneaux rétrécissent sans à-coup jusqu'à la taille du logo", () => {
    const [W, H] = [1440, 900];
    let prev = Infinity;
    for (let t = 0; t <= INTRO_LAND + 1e-9; t += 0.02) {
      const { S } = introFrame(t, W, H);
      expect(S).toBeLessThanOrEqual(prev + 1e-6);
      prev = S;
    }
    const landed = introFrame(INTRO_LAND, W, H);
    expect(landed.S).toBeCloseTo(INTRO_ICON_SIZE, 1);
    // Posés : plus de déformation, de franges, de reflet ni de rotation.
    expect(landed.warp).toBeCloseTo(0, 6);
    expect(landed.ab).toBeCloseTo(0, 6);
    expect(landed.gloss).toBeCloseTo(0, 6);
    expect(Math.abs(landed.ang)).toBeLessThan(1e-6);
  });

  it("relais : les anneaux du canevas s'effacent juste après s'être posés", () => {
    expect(introFrame(INTRO_LAND, 1280, 720).ringA).toBe(1);
    expect(introFrame(INTRO_LAND + 0.2, 1280, 720).ringA).toBe(0);
  });

  it("l'aura éclot au relais et s'est dissoute à la fin", () => {
    expect(introFrame(INTRO_LAND - 0.4, 1280, 720).blobA).toBe(0);
    expect(introFrame(INTRO_LAND + 1, 1280, 720).blobA).toBeGreaterThan(0.9);
    expect(introFrame(INTRO_DURATION, 1280, 720).blobA).toBe(0);
    for (let t = 0; t <= INTRO_DURATION; t += 0.1) {
      const f = introFrame(t, 1280, 720);
      expect(f.blobR).toBeGreaterThanOrEqual(0);
      expect(f.hole).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("intro — densité de pixels du canevas", () => {
  it("jamais plus de ~2,6 millions de pixels calculés par image", () => {
    for (const [W, H] of [...SCREENS, [3840, 2160] as [number, number]]) {
      const dpr = introCanvasDpr(W, H, 2);
      expect(W * H * dpr * dpr).toBeLessThanOrEqual(2_600_000 * 1.001);
    }
  });
  it("au plus 1,5 sur un téléphone à écran très dense", () => {
    expect(introCanvasDpr(390, 844, 3)).toBe(1.5);
    expect(introCanvasDpr(390, 844, 1)).toBe(1);
  });
});

describe("intro — cohérence", () => {
  it("le shader déclare chaque paramètre envoyé par le composant", () => {
    const component = readFileSync(path.join(process.cwd(), "src/components/intro/account-intro.tsx"), "utf8");
    const list = component.match(/const UNIFORMS = \[([^\]]+)\]/)?.[1] ?? "";
    const names = [...list.matchAll(/"(u\w+)"/g)].map((m) => m[1]);
    expect(names.length).toBe(12);
    for (const n of names) expect(INTRO_FRAGMENT_SHADER).toMatch(new RegExp(`uniform\\s+\\w+\\s+${n};`));
  });

  it("le logo SVG prend le relais au moment où les anneaux se posent", () => {
    const css = readFileSync(path.join(process.cwd(), "src/components/intro/account-intro.module.css"), "utf8");
    const rings = css.match(/\.play \.rings \{\s*animation: introFadeIn 0\.14s linear ([\d.]+)s/);
    expect(rings).not.toBeNull();
    expect(Number(rings![1])).toBeCloseTo(INTRO_LAND - 0.06, 5);
    const status = css.match(/\.play \.status \{\s*animation: introStatus 1s var\(--out\) ([\d.]+)s/);
    expect(Number(status![1]) + 1).toBeLessThanOrEqual(INTRO_DURATION);
  });

  it("cookie d'accueil (inscription Google) : court, sans identifiant", () => {
    expect(WELCOME_INTRO_COOKIE).toBe("nb_welcome");
    expect(WELCOME_INTRO_MAX_AGE).toBeLessThanOrEqual(600);
  });
});
