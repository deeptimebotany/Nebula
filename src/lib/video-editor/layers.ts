// Dessin des calques de l'éditeur vidéo (autocollants, textes, traits,
// flèches, formes) sur un canvas 2D de la taille de l'image finale. Même
// fonction pour l'aperçu et pour l'export. Voir model.ts pour les unités.
import { layerBox, type Layer } from "./model";

export const EMOJI_FONT = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
export const TEXT_FONT = `Inter, "Helvetica Neue", Arial, sans-serif`;

export type LayerImages = Map<string, CanvasImageSource>;

function arrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a - Math.PI / 7), y2 - size * Math.sin(a - Math.PI / 7));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(a + Math.PI / 7), y2 - size * Math.sin(a + Math.PI / 7));
  ctx.stroke();
}

export function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, W: number, H: number, images: LayerImages): void {
  const U = Math.min(W, H);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (l.kind === "sticker") {
    const b = layerBox(l, W, H);
    ctx.translate(b.cx, b.cy);
    if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180);
    const img = l.image ? images.get(l.id) : undefined;
    if (img) {
      ctx.drawImage(img, -b.hw, -b.hh, b.hw * 2, b.hh * 2);
    } else if (l.emoji) {
      ctx.font = `${Math.round(b.hw * 1.7)}px ${EMOJI_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(l.emoji, 0, b.hh * 0.08);
    }
  } else if (l.kind === "text") {
    const b = layerBox(l, W, H);
    const fs = l.size * U;
    ctx.translate(b.cx, b.cy);
    if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180);
    ctx.font = `700 ${Math.round(fs)}px ${TEXT_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = l.color;
    // Ombre douce : lisible sur tous les fonds.
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = fs * 0.15;
    ctx.shadowOffsetY = fs * 0.04;
    const lines = l.text.split("\n");
    lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * fs * 1.2));
  } else {
    ctx.strokeStyle = l.color;
    ctx.lineWidth = Math.max(1, l.width * U);
    if (l.kind === "path") {
      ctx.beginPath();
      l.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * W, y * H) : ctx.lineTo(x * W, y * H)));
      if (l.points.length === 1) ctx.lineTo(l.points[0][0] * W + 0.1, l.points[0][1] * H);
      ctx.stroke();
    } else if (l.kind === "line" || l.kind === "arrow") {
      ctx.beginPath();
      ctx.moveTo(l.x1 * W, l.y1 * H);
      ctx.lineTo(l.x2 * W, l.y2 * H);
      ctx.stroke();
      if (l.kind === "arrow") arrowHead(ctx, l.x1 * W, l.y1 * H, l.x2 * W, l.y2 * H, Math.max(ctx.lineWidth * 4, U * 0.03));
    } else if (l.kind === "rect") {
      ctx.strokeRect(l.x * W, l.y * H, l.w * W, l.h * H);
    } else if (l.kind === "ellipse") {
      ctx.beginPath();
      ctx.ellipse((l.x + l.w / 2) * W, (l.y + l.h / 2) * H, Math.abs((l.w * W) / 2), Math.abs((l.h * H) / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], W: number, H: number, images: LayerImages): void {
  for (const l of layers) drawLayer(ctx, l, W, H, images);
}

/** Charge l'image d'un autocollant (adresse data: ou blob:, jamais distante : le canvas resterait « pollué »). */
export function loadLayerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = src;
  });
}

/** Charge toutes les images des autocollants d'une liste de calques. */
export async function loadAllLayerImages(layers: Layer[], known: LayerImages = new Map()): Promise<LayerImages> {
  const out: LayerImages = new Map(known);
  await Promise.all(
    layers.map(async (l) => {
      if (l.kind === "sticker" && l.image && !out.has(l.id)) {
        try {
          out.set(l.id, await loadLayerImage(l.image));
        } catch {
          /* autocollant ignoré */
        }
      }
    })
  );
  return out;
}

/**
 * Réduit une image choisie par la personne (fichier ou logo) à 1024 px au
 * plus et la renvoie en adresse data: (PNG, transparence gardée).
 */
export async function imageToDataUrl(source: Blob, maxSide = 1024): Promise<{ dataUrl: string; aspect: number }> {
  const url = URL.createObjectURL(source);
  try {
    const img = await loadLayerImage(url);
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL("image/png"), aspect: w / h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
