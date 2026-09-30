// Éditeur vidéo de Publier (30/09/2026) : fonctions pures du modèle
// (passages, géométrie, dimensions, filtres, calques). Le rendu WebGL et
// l'export MP4 sont vérifiés dans un vrai navigateur (voir la doc de suivi).
import { describe, expect, it } from "vitest";
import {
  FILTERS,
  IDENTITY_MATRIX,
  applyAffine,
  aspectRatio,
  baseSize,
  clampCrop,
  composeColor,
  coverScale,
  cropForAspect,
  dragCropCorner,
  filterMatrix,
  initialEdit,
  isUnchanged,
  layerAt,
  moveSegmentEdge,
  outputDuration,
  outputSize,
  playableTime,
  removeSegment,
  shaderParams,
  sourceMatrix,
  splitAt,
  toOutputTime,
  withQuarter,
  NEUTRAL_ADJUSTMENTS,
  type Layer,
  type VideoEdit
} from "@/lib/video-editor/model";

const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 5);
  expect(a[1]).toBeCloseTo(b[1], 5);
};

describe("passages gardés", () => {
  it("couper, supprimer, durée finale", () => {
    const s = splitAt([{ start: 0, end: 15 }], 5);
    expect(s).toEqual([
      { start: 0, end: 5 },
      { start: 5, end: 15 }
    ]);
    const s2 = splitAt(s, 10);
    expect(removeSegment(s2, 1)).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 15 }
    ]);
    expect(outputDuration(removeSegment(s2, 1))).toBe(10);
    // Trop près d'un bord, ou hors passage : rien.
    expect(splitAt(s, 5.1)).toBe(s);
    // Il reste toujours au moins un passage.
    expect(removeSegment([{ start: 0, end: 3 }], 0)).toEqual([{ start: 0, end: 3 }]);
  });

  it("poignées : jamais sur le voisin, durée minimale gardée", () => {
    const s = [
      { start: 0, end: 5 },
      { start: 8, end: 15 }
    ];
    expect(moveSegmentEdge(s, 0, "end", 9, 15)[0].end).toBe(8);
    expect(moveSegmentEdge(s, 1, "start", 3, 15)[1].start).toBe(5);
    expect(moveSegmentEdge(s, 1, "start", 14.9, 15)[1].start).toBeCloseTo(14.7);
    expect(moveSegmentEdge(s, 1, "end", 99, 15)[1].end).toBe(15);
  });

  it("lecture de l'aperçu : saute les passages supprimés, temps final", () => {
    const s = [
      { start: 1, end: 4 },
      { start: 8, end: 10 }
    ];
    expect(playableTime(s, 0)).toBe(1);
    expect(playableTime(s, 2)).toBe(2);
    expect(playableTime(s, 5)).toBe(8);
    expect(playableTime(s, 10)).toBeNull();
    expect(toOutputTime(s, 9)).toBe(4);
    expect(toOutputTime(s, 6)).toBe(3);
  });
});

describe("géométrie", () => {
  const edit = (over: Partial<VideoEdit> = {}): VideoEdit => ({ ...initialEdit(1080, 1920, 15), ...over });

  it("sans modification : chaque coin de la sortie tombe sur le même coin de la vidéo", () => {
    const m = sourceMatrix(edit(), 1080, 1920, 540, 960);
    close(applyAffine(m, 0, 0), [0, 0]);
    close(applyAffine(m, 540, 960), [1, 1]);
    close(applyAffine(m, 540, 0), [1, 0]);
  });

  it("quart de tour à droite : le coin haut gauche de la sortie vient du bas gauche de l'original", () => {
    const e = withQuarter(edit(), 90, 1080, 1920);
    expect(baseSize(1080, 1920, 90)).toEqual({ w: 1920, h: 1080 });
    const m = sourceMatrix(e, 1080, 1920, 1920, 1080);
    close(applyAffine(m, 0, 0), [0, 1]);
    close(applyAffine(m, 1920, 0), [0, 0]);
    close(applyAffine(m, 1920, 1080), [1, 0]);
  });

  it("miroir horizontal et recadrage", () => {
    const m = sourceMatrix(edit({ flipX: true }), 1080, 1920, 1080, 1920);
    close(applyAffine(m, 0, 0), [1, 0]);
    const crop = sourceMatrix(edit({ crop: { x: 0, y: 420, w: 1080, h: 1080 } }), 1080, 1920, 1080, 1080);
    close(applyAffine(crop, 0, 0), [0, 420 / 1920]);
    close(applyAffine(crop, 1080, 1080), [1, 1500 / 1920]);
    // Outil Recadrer : image entière, sans le recadrage.
    const whole = sourceMatrix(edit({ crop: { x: 0, y: 420, w: 1080, h: 1080 } }), 1080, 1920, 540, 960, true);
    close(applyAffine(whole, 0, 0), [0, 0]);
  });

  it("rotation fine : zoom minimal, aucun coin de la sortie hors de la vidéo", () => {
    expect(coverScale(0, 100, 100)).toBe(1);
    expect(coverScale(45, 100, 100)).toBeCloseTo(Math.SQRT2);
    const m = sourceMatrix(edit({ angle: 17 }), 1080, 1920, 1080, 1920);
    for (const [x, y] of [
      [0, 0],
      [1080, 0],
      [0, 1920],
      [1080, 1920]
    ]) {
      const [u, v] = applyAffine(m, x, y);
      expect(u).toBeGreaterThanOrEqual(-1e-6);
      expect(u).toBeLessThanOrEqual(1 + 1e-6);
      expect(v).toBeGreaterThanOrEqual(-1e-6);
      expect(v).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("formats : plus grand cadre centré ; coins tirés au format ; cadre gardé dans l'image", () => {
    const base = { w: 1920, h: 1080 };
    expect(cropForAspect(base, aspectRatio("9:16", base))).toEqual({ x: (1920 - 607.5) / 2, y: 0, w: 607.5, h: 1080 });
    expect(cropForAspect(base, aspectRatio("original", base))).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    const dragged = dragCropCorner({ x: 0, y: 0, w: 1080, h: 1080 }, "se", 500, 900, base, 1);
    expect(dragged.w).toBeCloseTo(dragged.h);
    expect(dragged).toMatchObject({ x: 0, y: 0 });
    expect(clampCrop({ x: 1800, y: -50, w: 400, h: 400 }, base)).toEqual({ x: 1520, y: 0, w: 400, h: 400 });
  });

  it("dimensions : celles du cadrage, 1920 px au plus, toujours paires", () => {
    expect(outputSize(edit())).toEqual({ width: 1080, height: 1920 });
    expect(outputSize({ crop: { x: 0, y: 0, w: 2160, h: 3840 }, resize: null })).toEqual({ width: 1080, height: 1920 });
    expect(outputSize({ crop: { x: 0, y: 0, w: 721, h: 1281 }, resize: null })).toEqual({ width: 722, height: 1282 });
    expect(outputSize({ crop: { x: 0, y: 0, w: 100, h: 100 }, resize: { width: 5001, height: 715 } })).toEqual({ width: 3840, height: 716 });
  });
});

describe("couleurs", () => {
  it("filtres : « Aucun » ne change rien, « Mono » donne du gris", () => {
    expect(filterMatrix("none")).toEqual(IDENTITY_MATRIX);
    expect(composeColor(IDENTITY_MATRIX, filterMatrix("chrome"))).toEqual(filterMatrix("chrome"));
    const m = filterMatrix("mono");
    const [r, g, b] = [0, 4, 8].map((row) => m[row] * 1 + m[row + 1] * 0.2 + m[row + 2] * 0.1 + m[row + 3]);
    expect(r).toBeCloseTo(g);
    expect(g).toBeCloseTo(b);
    expect(FILTERS.map((f) => f.label)).toEqual(["Aucun", "Chrome", "Fondu", "Froid", "Chaud", "Pastel", "Mono", "Noir", "Austère", "Délavé"]);
  });

  it("réglages neutres : aucun effet", () => {
    expect(shaderParams(NEUTRAL_ADJUSTMENTS)).toEqual({ exposure: 1, brightness: 0, contrast: 1, saturation: 1, temperature: 0, gamma: 1, sharpness: 0, vignette: 0 });
    expect(shaderParams({ ...NEUTRAL_ADJUSTMENTS, saturation: -100 }).saturation).toBe(0);
  });
});

describe("calques", () => {
  const layers: Layer[] = [
    { id: "r", kind: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.1, color: "#fff", width: 0.01 },
    { id: "s", kind: "sticker", x: 0.5, y: 0.5, size: 0.2, rotation: 0, emoji: "🔥" },
    { id: "l", kind: "arrow", x1: 0.1, y1: 0.9, x2: 0.9, y2: 0.9, color: "#f00", width: 0.01 }
  ];
  it("le calque sous le doigt, le plus haut d'abord", () => {
    expect(layerAt(layers, 540, 960, 1080, 1920)?.id).toBe("s");
    expect(layerAt(layers, 200, 250, 1080, 1920)?.id).toBe("r");
    expect(layerAt(layers, 540, 1728, 1080, 1920)?.id).toBe("l");
    expect(layerAt(layers, 900, 300, 1080, 1920)).toBeNull();
  });

  it("modification détectée (bouton Enregistrer)", () => {
    const a = initialEdit(1080, 1920, 15);
    expect(isUnchanged({ ...a }, a)).toBe(true);
    expect(isUnchanged({ ...a, audio: false }, a)).toBe(false);
  });
});
