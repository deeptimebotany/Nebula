// Éditeur vidéo de Publier (30/09/2026) : le modèle des modifications et
// toutes les fonctions de calcul, pures (sans DOM), partagées par l'aperçu
// (WebGL, src/lib/video-editor/renderer.ts), l'export MP4 (export.ts) et les
// tests. Tout se fait dans le navigateur de la personne : aucun serveur,
// aucune IA, aucun coût pour Nebula.
//
// Ordre des opérations sur une image de la vidéo :
//   1. rotation par quart de tour (« Faire pivoter »), puis retournements ;
//   2. rotation fine (-45° à 45°) et zoom autour du centre, avec le zoom
//      minimal qui évite tout coin vide ;
//   3. recadrage (rectangle dans l'image tournée), puis dimensions de sortie ;
//   4. filtre, réglages (luminosité…), netteté et vignette ;
//   5. calques (autocollants, dessins, textes), placés en fraction de l'image
//      finale : ils restent à la même place si l'on change les dimensions.

// --- Temps : les passages gardés -----------------------------------------------

export interface Segment {
  /** Début et fin dans la vidéo d'origine, en secondes. */
  start: number;
  end: number;
}

/** Durée minimale d'un passage (secondes). */
export const MIN_SEGMENT = 0.3;

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function initialSegments(duration: number): Segment[] {
  return [{ start: 0, end: round3(Math.max(0, duration)) }];
}

export function outputDuration(segments: Segment[]): number {
  return round3(segments.reduce((s, g) => s + Math.max(0, g.end - g.start), 0));
}

/** Coupe le passage qui contient `t` en deux (rien si trop près d'un bord). */
export function splitAt(segments: Segment[], t: number): Segment[] {
  const i = segments.findIndex((g) => t > g.start && t < g.end);
  if (i < 0) return segments;
  const g = segments[i];
  if (t - g.start < MIN_SEGMENT || g.end - t < MIN_SEGMENT) return segments;
  const at = round3(t);
  return [...segments.slice(0, i), { start: g.start, end: at }, { start: at, end: g.end }, ...segments.slice(i + 1)];
}

/** Retire un passage (il en reste toujours au moins un). */
export function removeSegment(segments: Segment[], index: number): Segment[] {
  if (segments.length <= 1 || index < 0 || index >= segments.length) return segments;
  return segments.filter((_, i) => i !== index);
}

/** Déplace le début ou la fin d'un passage, sans chevaucher ses voisins. */
export function moveSegmentEdge(segments: Segment[], index: number, edge: "start" | "end", t: number, duration: number): Segment[] {
  const g = segments[index];
  if (!g) return segments;
  const prevEnd = index > 0 ? segments[index - 1].end : 0;
  const nextStart = index < segments.length - 1 ? segments[index + 1].start : duration;
  const next =
    edge === "start"
      ? { ...g, start: round3(Math.min(Math.max(t, prevEnd), g.end - MIN_SEGMENT)) }
      : { ...g, end: round3(Math.max(Math.min(t, nextStart), g.start + MIN_SEGMENT)) };
  return segments.map((s, i) => (i === index ? next : s));
}

/** Où reprendre la lecture de l'aperçu : `t` s'il est gardé, sinon le début du passage suivant (null après le dernier). */
export function playableTime(segments: Segment[], t: number): number | null {
  for (const g of segments) {
    if (t < g.start) return g.start;
    if (t < g.end - 0.01) return t;
  }
  return null;
}

/** Position dans la vidéo finale (secondes) d'un instant de la vidéo d'origine. */
export function toOutputTime(segments: Segment[], t: number): number {
  let acc = 0;
  for (const g of segments) {
    if (t < g.start) return round3(acc);
    if (t <= g.end) return round3(acc + t - g.start);
    acc += g.end - g.start;
  }
  return round3(acc);
}

// --- Géométrie -------------------------------------------------------------------

export type QuarterTurn = 0 | 90 | 180 | 270;

export interface CropRect {
  /** En pixels de l'image après quart de tour (repère « de base »). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ASPECTS = [
  { id: "free", label: "Libre", ratio: null },
  { id: "original", label: "Original", ratio: null },
  { id: "9:16", label: "9:16 (Reels, TikTok, Shorts)", ratio: 9 / 16 },
  { id: "4:5", label: "4:5 (Instagram)", ratio: 4 / 5 },
  { id: "1:1", label: "1:1 (carré)", ratio: 1 },
  { id: "16:9", label: "16:9 (YouTube)", ratio: 16 / 9 }
] as const;
export type AspectId = (typeof ASPECTS)[number]["id"];

/** Taille de l'image après le quart de tour. */
export function baseSize(srcW: number, srcH: number, quarter: QuarterTurn): { w: number; h: number } {
  return quarter === 90 || quarter === 270 ? { w: srcH, h: srcW } : { w: srcW, h: srcH };
}

/** Zoom minimal pour qu'une image tournée de `deg` couvre tout son cadre. */
export function coverScale(deg: number, w: number, h: number): number {
  const a = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
}

/** Ratio largeur / hauteur d'un format (null = libre). */
export function aspectRatio(id: AspectId, base: { w: number; h: number }): number | null {
  if (id === "original") return base.w / base.h;
  return ASPECTS.find((a) => a.id === id)?.ratio ?? null;
}

/** Le plus grand rectangle centré au format demandé. */
export function cropForAspect(base: { w: number; h: number }, ratio: number | null): CropRect {
  if (!ratio) return { x: 0, y: 0, w: base.w, h: base.h };
  let w = base.w;
  let h = w / ratio;
  if (h > base.h) {
    h = base.h;
    w = h * ratio;
  }
  return { x: (base.w - w) / 2, y: (base.h - h) / 2, w, h };
}

/** Garde le rectangle dans l'image, avec une taille minimale. */
export function clampCrop(c: CropRect, base: { w: number; h: number }, min = 32): CropRect {
  const w = Math.min(base.w, Math.max(min, c.w));
  const h = Math.min(base.h, Math.max(min, c.h));
  return { x: Math.min(Math.max(0, c.x), base.w - w), y: Math.min(Math.max(0, c.y), base.h - h), w, h };
}

/**
 * Redimensionne le recadrage en tirant un coin (`corner` : « nw », « ne »,
 * « sw », « se ») jusqu'au point (px, py), au format imposé s'il y en a un.
 */
export function dragCropCorner(c: CropRect, corner: "nw" | "ne" | "sw" | "se", px: number, py: number, base: { w: number; h: number }, ratio: number | null, min = 32): CropRect {
  // Coin opposé, fixe.
  const fx = corner === "nw" || corner === "sw" ? c.x + c.w : c.x;
  const fy = corner === "nw" || corner === "ne" ? c.y + c.h : c.y;
  const dirX = corner === "nw" || corner === "sw" ? -1 : 1;
  const dirY = corner === "nw" || corner === "ne" ? -1 : 1;
  const maxW = dirX > 0 ? base.w - fx : fx;
  const maxH = dirY > 0 ? base.h - fy : fy;
  let w = Math.min(maxW, Math.max(min, (px - fx) * dirX));
  let h = Math.min(maxH, Math.max(min, (py - fy) * dirY));
  if (ratio) {
    // Garde le format : la dimension la plus « tirée » décide, dans la limite de l'image.
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
    if (w > maxW) {
      w = maxW;
      h = w / ratio;
    }
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
  }
  return { x: dirX > 0 ? fx : fx - w, y: dirY > 0 ? fy : fy - h, w, h };
}

// --- Réglages et filtres --------------------------------------------------------

export const ADJUSTMENTS = [
  { key: "brightness", label: "Luminosité", min: -100, max: 100 },
  { key: "contrast", label: "Contraste", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "exposure", label: "Exposition", min: -100, max: 100 },
  { key: "temperature", label: "Température", min: -100, max: 100 },
  { key: "gamma", label: "Gamma", min: -100, max: 100 },
  { key: "sharpness", label: "Netteté", min: 0, max: 100 },
  { key: "vignette", label: "Vignette", min: -100, max: 100 }
] as const;
export type AdjustKey = (typeof ADJUSTMENTS)[number]["key"];
export type Adjustments = Record<AdjustKey, number>;

export const NEUTRAL_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, gamma: 0, sharpness: 0, vignette: 0 };

/** Matrice couleur 3 × 4 (lignes R, G, B : trois coefficients + décalage), en ligne. */
export type ColorMatrix = [number, number, number, number, number, number, number, number, number, number, number, number];

export const IDENTITY_MATRIX: ColorMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** m1 ∘ m2 : applique m2, puis m1. */
export function composeColor(m1: ColorMatrix, m2: ColorMatrix): ColorMatrix {
  const out = new Array(12).fill(0) as number[];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 4 + c] = m1[r * 4] * m2[c] + m1[r * 4 + 1] * m2[4 + c] + m1[r * 4 + 2] * m2[8 + c];
    }
    out[r * 4 + 3] = m1[r * 4] * m2[3] + m1[r * 4 + 1] * m2[7] + m1[r * 4 + 2] * m2[11] + m1[r * 4 + 3];
  }
  return out as ColorMatrix;
}

const LUMA = [0.2126, 0.7152, 0.0722];

function saturationMatrix(s: number): ColorMatrix {
  const [r, g, b] = LUMA.map((l) => l * (1 - s));
  return [r + s, g, b, 0, r, g + s, b, 0, r, g, b + s, 0];
}
function contrastMatrix(c: number): ColorMatrix {
  const o = 0.5 * (1 - c);
  return [c, 0, 0, o, 0, c, 0, o, 0, 0, c, o];
}
function offsetMatrix(v: number): ColorMatrix {
  return [1, 0, 0, v, 0, 1, 0, v, 0, 0, 1, v];
}
function warmthMatrix(t: number): ColorMatrix {
  return [1 + t, 0, 0, 0, 0, 1 + t * 0.15, 0, 0, 0, 0, 1 - t, 0];
}
/** « Fondu » : noirs relevés (pellicule délavée). */
function fadeMatrix(f: number): ColorMatrix {
  return [1 - f, 0, 0, f, 0, 1 - f, 0, f, 0, 0, 1 - f, f];
}
function chain(...ms: ColorMatrix[]): ColorMatrix {
  return ms.reduce((acc, m) => composeColor(m, acc), IDENTITY_MATRIX);
}

export const FILTERS = [
  { id: "none", label: "Aucun", matrix: IDENTITY_MATRIX },
  { id: "chrome", label: "Chrome", matrix: chain(saturationMatrix(1.25), contrastMatrix(1.18)) },
  { id: "fade", label: "Fondu", matrix: chain(saturationMatrix(0.85), contrastMatrix(0.92), fadeMatrix(0.1)) },
  { id: "cold", label: "Froid", matrix: chain(warmthMatrix(-0.1), saturationMatrix(1.05)) },
  { id: "warm", label: "Chaud", matrix: chain(warmthMatrix(0.1), saturationMatrix(1.08)) },
  { id: "pastel", label: "Pastel", matrix: chain(saturationMatrix(0.7), contrastMatrix(0.85), offsetMatrix(0.05), fadeMatrix(0.06)) },
  { id: "mono", label: "Mono", matrix: saturationMatrix(0) },
  { id: "noir", label: "Noir", matrix: chain(saturationMatrix(0), contrastMatrix(1.35), offsetMatrix(-0.03)) },
  { id: "stark", label: "Austère", matrix: chain(saturationMatrix(0.35), contrastMatrix(1.25)) },
  { id: "wash", label: "Délavé", matrix: chain(saturationMatrix(0.6), fadeMatrix(0.14), offsetMatrix(0.04)) }
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];

export function filterMatrix(id: FilterId): ColorMatrix {
  return (FILTERS.find((f) => f.id === id)?.matrix ?? IDENTITY_MATRIX) as ColorMatrix;
}

/** Réglages (-100…100) → paramètres du rendu. */
export function shaderParams(a: Adjustments) {
  const n = (v: number) => Math.max(-1, Math.min(1, v / 100));
  return {
    exposure: Math.pow(2, n(a.exposure) * 1.5),
    brightness: n(a.brightness) * 0.25,
    contrast: 1 + n(a.contrast) * (a.contrast >= 0 ? 0.8 : 0.85),
    saturation: 1 + n(a.saturation),
    temperature: n(a.temperature) * 0.12,
    gamma: Math.pow(2, n(a.gamma)),
    sharpness: Math.max(0, n(a.sharpness)) * 1.5,
    vignette: n(a.vignette)
  };
}

// --- Calques ------------------------------------------------------------------------

/**
 * Positions (x, y…) en fraction de la largeur et de la hauteur de l'image
 * finale ; tailles et épaisseurs en fraction de son PETIT côté (U) :
 *   - autocollant : largeur = size·U, hauteur = size·U / aspect ;
 *   - texte : corps = size·U ;
 *   - traits : épaisseur = width·U.
 */
export type Layer =
  | { id: string; kind: "sticker"; x: number; y: number; size: number; rotation: number; emoji?: string; image?: string; aspect?: number }
  | { id: string; kind: "text"; x: number; y: number; size: number; rotation: number; text: string; color: string }
  | { id: string; kind: "path"; points: [number, number][]; color: string; width: number }
  | { id: string; kind: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { id: string; kind: "rect" | "ellipse"; x: number; y: number; w: number; h: number; color: string; width: number };

export const STROKE_WIDTHS = [
  { id: "small", label: "Fin", value: 0.006 },
  { id: "medium", label: "Moyen", value: 0.012 },
  { id: "large", label: "Épais", value: 0.024 }
] as const;

export const DRAW_COLORS = ["#ffffff", "#111111", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#0a84ff", "#af52de", "#ff2d92"] as const;

export const EMOJIS = ["😂", "❤️", "🤣", "😍", "🙏", "😘", "🥰", "😱", "🔥", "✨", "👏", "💯", "😎", "🤩", "😭", "👀", "🎉", "⭐", "😊", "👉", "✅", "💡", "📍", "🎬"] as const;

export function layerId(): string {
  return `l${Math.random().toString(36).slice(2, 9)}`;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Boîte d'un autocollant ou d'un texte, en pixels (centre, demi-largeur, demi-hauteur). */
export function layerBox(l: Extract<Layer, { kind: "sticker" | "text" }>, W: number, H: number): { cx: number; cy: number; hw: number; hh: number } {
  const U = Math.min(W, H);
  if (l.kind === "sticker") {
    const w = l.size * U;
    return { cx: l.x * W, cy: l.y * H, hw: w / 2, hh: w / (l.aspect ?? 1) / 2 };
  }
  const fs = l.size * U;
  const lines = l.text.split("\n");
  const longest = Math.max(1, ...lines.map((t) => t.length));
  return { cx: l.x * W, cy: l.y * H, hw: (longest * fs * 0.56) / 2 + fs * 0.2, hh: (lines.length * fs * 1.2) / 2 };
}

/** Calque sous le point (px, py) en pixels d'une image W × H, le plus haut d'abord. */
export function layerAt(layers: Layer[], px: number, py: number, W: number, H: number, tolerance = 10): Layer | null {
  const U = Math.min(W, H);
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.kind === "sticker" || l.kind === "text") {
      const b = layerBox(l, W, H);
      if (Math.abs(px - b.cx) <= b.hw + tolerance && Math.abs(py - b.cy) <= b.hh + tolerance) return l;
    } else if (l.kind === "path") {
      const pts = l.points.map(([x, y]) => [x * W, y * H] as const);
      const reach = (l.width * U) / 2 + tolerance;
      if (pts.length === 1 && Math.hypot(px - pts[0][0], py - pts[0][1]) <= reach) return l;
      for (let k = 1; k < pts.length; k++) {
        if (distToSegment(px, py, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]) <= reach) return l;
      }
    } else if (l.kind === "line" || l.kind === "arrow") {
      if (distToSegment(px, py, l.x1 * W, l.y1 * H, l.x2 * W, l.y2 * H) <= (l.width * U) / 2 + tolerance) return l;
    } else if (l.kind === "rect" || l.kind === "ellipse") {
      const x0 = Math.min(l.x, l.x + l.w) * W;
      const x1 = Math.max(l.x, l.x + l.w) * W;
      const y0 = Math.min(l.y, l.y + l.h) * H;
      const y1 = Math.max(l.y, l.y + l.h) * H;
      if (px >= x0 - tolerance && px <= x1 + tolerance && py >= y0 - tolerance && py <= y1 + tolerance) return l;
    }
  }
  return null;
}

// --- L'ensemble des modifications ---------------------------------------------

export interface VideoEdit {
  segments: Segment[];
  /** Garder le son (« Son de la vidéo : activé / coupé »). */
  audio: boolean;
  quarter: QuarterTurn;
  flipX: boolean;
  flipY: boolean;
  /** Rotation fine, en degrés (-45 → 45). */
  angle: number;
  /** Zoom en plus du zoom minimal (1 → 3). */
  zoom: number;
  aspect: AspectId;
  crop: CropRect;
  /** Dimensions de sortie choisies (null : celles du recadrage, 1920 px au plus). */
  resize: { width: number; height: number } | null;
  adjust: Adjustments;
  filter: FilterId;
  layers: Layer[];
}

export function initialEdit(srcW: number, srcH: number, duration: number): VideoEdit {
  return {
    segments: initialSegments(duration),
    audio: true,
    quarter: 0,
    flipX: false,
    flipY: false,
    angle: 0,
    zoom: 1,
    aspect: "free",
    crop: { x: 0, y: 0, w: srcW, h: srcH },
    resize: null,
    adjust: { ...NEUTRAL_ADJUSTMENTS },
    filter: "none",
    layers: []
  };
}

/** Plus grand côté par défaut de la vidéo exportée (1080 × 1920 pour du vertical). */
export const DEFAULT_MAX_SIDE = 1920;
/** Limite des encodeurs H.264 courants. */
export const MAX_SIDE = 3840;

const even = (v: number) => Math.max(2, 2 * Math.round(v / 2));

/** Dimensions de la vidéo exportée (paires, comme l'exige H.264). */
export function outputSize(edit: Pick<VideoEdit, "crop" | "resize">): { width: number; height: number } {
  if (edit.resize) {
    return { width: even(Math.min(MAX_SIDE, edit.resize.width)), height: even(Math.min(MAX_SIDE, edit.resize.height)) };
  }
  const k = Math.min(1, DEFAULT_MAX_SIDE / Math.max(edit.crop.w, edit.crop.h));
  return { width: even(edit.crop.w * k), height: even(edit.crop.h * k) };
}

/** Rien n'a été modifié (le bouton Enregistrer reste grisé). */
export function isUnchanged(edit: VideoEdit, initial: VideoEdit): boolean {
  return JSON.stringify(edit) === JSON.stringify(initial);
}

// --- Matrice : pixel de sortie → coordonnées (0 → 1) dans la vidéo d'origine ---

/** Matrice affine [a, b, c, d, e, f] : x' = a·x + c·y + e ; y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];

export function mulAffine(m1: Affine, m2: Affine): Affine {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

export function applyAffine(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];
const scale = (x: number, y: number): Affine => [x, 0, 0, y, 0, 0];
const rotate = (rad: number): Affine => [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];

/**
 * Pour un pixel (x, y) de l'image rendue (largeur `outW`, hauteur `outH`),
 * la position (u, v) correspondante dans la vidéo d'origine, en fractions.
 * `wholeFrame` : rendu de l'image entière, sans recadrage (outil Recadrer).
 */
export function sourceMatrix(edit: VideoEdit, srcW: number, srcH: number, outW: number, outH: number, wholeFrame = false): Affine {
  const base = baseSize(srcW, srcH, edit.quarter);
  const crop = wholeFrame ? { x: 0, y: 0, w: base.w, h: base.h } : edit.crop;
  // 1. Sortie → repère de base (recadrage).
  let m: Affine = mulAffine(translate(crop.x, crop.y), scale(crop.w / outW, crop.h / outH));
  // 2. Rotation fine et zoom (inverse), autour du centre.
  const S = edit.zoom * coverScale(edit.angle, base.w, base.h);
  const cx = base.w / 2;
  const cy = base.h / 2;
  const inv: Affine = mulAffine(translate(cx, cy), mulAffine(rotate((-edit.angle * Math.PI) / 180), mulAffine(scale(1 / S, 1 / S), translate(-cx, -cy))));
  m = mulAffine(inv, m);
  // 3. Retournements (inverse = eux-mêmes).
  if (edit.flipX) m = mulAffine([-1, 0, 0, 1, base.w, 0], m);
  if (edit.flipY) m = mulAffine([1, 0, 0, -1, 0, base.h], m);
  // 4. Quart de tour (inverse) : repère de base → image d'origine.
  const q: Record<QuarterTurn, Affine> = {
    0: [1, 0, 0, 1, 0, 0],
    // base (bx, by) → origine (by, srcH - bx)
    90: [0, -1, 1, 0, 0, srcH],
    180: [-1, 0, 0, -1, srcW, srcH],
    // base (bx, by) → origine (srcW - by, bx)
    270: [0, 1, -1, 0, srcW, 0]
  };
  m = mulAffine(q[edit.quarter], m);
  // 5. Pixels → fractions.
  return mulAffine(scale(1 / srcW, 1 / srcH), m);
}

/** Change le quart de tour en gardant un recadrage valable (image entière). */
export function withQuarter(edit: VideoEdit, quarter: QuarterTurn, srcW: number, srcH: number): VideoEdit {
  const base = baseSize(srcW, srcH, quarter);
  return { ...edit, quarter, crop: cropForAspect(base, aspectRatio(edit.aspect, base)), resize: null };
}
