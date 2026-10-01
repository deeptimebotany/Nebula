"use client";

// Éditeur vidéo de Publier (30/09/2026, demande de Lucas) : couper
// (passages, diviser), recadrer (pivoter, retourner, format, rotation,
// zoom), réglages, filtres, autocollants (emojis, logo, image), dessin et
// texte, dimensions, son gardé ou coupé ; annuler / rétablir. Tout se passe
// dans le navigateur (WebGL + WebCodecs) : la vidéo ne part sur le serveur
// qu'une fois enregistrée, comme un import normal. Ouvert pour tous les
// paliers (aucun coût pour Nebula). Chargé seulement à l'ouverture
// (lazy.tsx), avec Mediabunny pour l'export.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/clsx";
import { useConfirm } from "@/components/dashboard/confirm";
import {
  ADJUSTMENTS,
  ASPECTS,
  DRAW_COLORS,
  EMOJIS,
  FILTERS,
  NEUTRAL_ADJUSTMENTS,
  STROKE_WIDTHS,
  aspectRatio,
  baseSize,
  clampCrop,
  cropForAspect,
  dragCropCorner,
  initialEdit,
  initialSegments,
  isUnchanged,
  layerAt,
  layerBox,
  layerId,
  moveSegmentEdge,
  outputDuration,
  outputSize,
  playableTime,
  removeSegment,
  splitAt,
  toOutputTime,
  withQuarter,
  type AdjustKey,
  type AspectId,
  type CropRect,
  type FilterId,
  type Layer,
  type QuarterTurn,
  type VideoEdit
} from "@/lib/video-editor/model";
import { EditRenderer, VideoEditorUnsupportedError } from "@/lib/video-editor/renderer";
import { drawLayers, imageToDataUrl, loadAllLayerImages, type LayerImages } from "@/lib/video-editor/layers";
import { browserCanEditVideo, exportEditedVideo } from "@/lib/video-editor/export";
import { captureVideoFrames } from "@/lib/video/capture-frames";
import * as I from "./editor-icons";

export interface VideoEditorProps {
  /** La vidéo à modifier : fichier local, ou adresse (blob: ou stockage Nebula). */
  source: Blob | string;
  fileName: string;
  /** Logo de la marque (autocollant « Logo »). */
  logoUrl?: string | null;
  onClose: () => void;
  /** Reçoit le MP4 final (l'envoi et le remplacement du média sont faits par l'appelant). */
  onSave: (file: File) => Promise<void>;
}

type Tool = "trim" | "crop" | "adjust" | "filter" | "stickers" | "draw" | "resize";
type DrawTool = "select" | "pen" | "line" | "arrow" | "rect" | "ellipse" | "text" | "eraser";

const TOOLS: { id: Tool; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { id: "trim", label: "Couper", Icon: I.IcScissors },
  { id: "crop", label: "Recadrer", Icon: I.IcCrop },
  { id: "adjust", label: "Réglages", Icon: I.IcSliders },
  { id: "filter", label: "Filtres", Icon: I.IcFilter },
  { id: "stickers", label: "Autocollants", Icon: I.IcSticker },
  { id: "draw", label: "Dessiner", Icon: I.IcPencil },
  { id: "resize", label: "Dimensions", Icon: I.IcResize }
];

const DRAW_TOOLS: { id: DrawTool; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { id: "select", label: "Sélection", Icon: I.IcCursor },
  { id: "pen", label: "Crayon", Icon: I.IcPencil },
  { id: "line", label: "Ligne", Icon: I.IcLine },
  { id: "arrow", label: "Flèche", Icon: I.IcArrow },
  { id: "rect", label: "Rectangle", Icon: I.IcRect },
  { id: "ellipse", label: "Ellipse", Icon: I.IcEllipse },
  { id: "text", label: "Texte", Icon: I.IcText },
  { id: "eraser", label: "Gomme", Icon: I.IcEraser }
];

/** Vidéos acceptées par l'éditeur : 10 minutes au plus (mémoire du navigateur). */
const MAX_DURATION = 600;

export function formatTime(s: number): string {
  const v = Math.max(0, s);
  const m = Math.floor(v / 60);
  const sec = v - m * 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec.toFixed(1).replace(".", ",")}`;
}

interface Media {
  blob: Blob;
  url: string;
  w: number;
  h: number;
  duration: number;
}

// ---------------------------------------------------------------------------
// Coquille : chargement de la vidéo, puis l'espace de travail
// ---------------------------------------------------------------------------

export default function VideoEditor(props: VideoEditorProps) {
  const [media, setMedia] = useState<Media | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        if (!browserCanEditVideo()) throw new Error("Ce navigateur ne permet pas encore de modifier une vidéo. Utilisez Chrome, Edge ou Safari à jour.");
        const blob = typeof props.source === "string" ? await fetch(props.source).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("fetch")))) : props.source;
        url = URL.createObjectURL(blob);
        const meta = await new Promise<{ w: number; h: number; duration: number }>((resolve, reject) => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.muted = true;
          v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight, duration: v.duration });
          v.onerror = () => reject(new Error("Ce navigateur ne sait pas lire cette vidéo. Essayez un fichier MP4 (H.264)."));
          v.src = url!;
        });
        if (!meta.w || !meta.h || !Number.isFinite(meta.duration)) throw new Error("Vidéo illisible (dimensions ou durée inconnues).");
        if (meta.duration > MAX_DURATION) throw new Error("L'éditeur accepte les vidéos de 10 minutes au plus.");
        if (!cancelled) setMedia({ blob, url, ...meta });
      } catch (err) {
        const message = (err as Error).message;
        if (!cancelled) setError(message === "fetch" || /Failed to fetch|NetworkError|Load failed/i.test(message) ? "Impossible de relire cette vidéo pour la modifier. Réimportez le fichier depuis votre ordinateur, puis réessayez." : message);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [props.source]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="video-editor-title">
      <div className="glass-panel-solid relative flex h-full w-full max-w-[1500px] flex-col overflow-hidden sm:rounded-3xl">
        {media ? (
          <Workspace media={media} {...props} />
        ) : (
          <div className="flex flex-1 flex-col">
            <Header onClose={props.onClose} />
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              {error ? (
                <div className="max-w-md space-y-4">
                  <p role="alert" className="text-sm text-red-300">
                    {error}
                  </p>
                  <button type="button" onClick={props.onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5">
                    Fermer
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-400" aria-live="polite">
                  Ouverture de la vidéo…
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Header({ onClose, children }: { onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-6">
      <h2 id="video-editor-title" className="font-display text-lg font-semibold text-white">
        Modifier la vidéo
      </h2>
      <div className="flex items-center gap-2">
        {children}
        <button type="button" onClick={onClose} aria-label="Fermer l'éditeur" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-slate-300 transition hover:bg-white/10 hover:text-white">
          <I.IcClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Espace de travail
// ---------------------------------------------------------------------------

type Drag =
  | { kind: "crop-move"; startX: number; startY: number; orig: CropRect }
  | { kind: "crop-corner"; corner: "nw" | "ne" | "sw" | "se" }
  | { kind: "layer-move"; id: string; startFx: number; startFy: number; orig: Layer }
  | { kind: "layer-scale"; id: string; startDist: number; orig: Extract<Layer, { kind: "sticker" | "text" }> }
  | { kind: "layer-rotate"; id: string; startAngle: number; orig: Extract<Layer, { kind: "sticker" | "text" }> }
  | { kind: "draw"; draft: Layer }
  | { kind: "erase" };

function moveLayer(l: Layer, dx: number, dy: number): Layer {
  switch (l.kind) {
    case "sticker":
    case "text":
      return { ...l, x: l.x + dx, y: l.y + dy };
    case "path":
      return { ...l, points: l.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    case "line":
    case "arrow":
      return { ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy };
    default:
      return { ...l, x: l.x + dx, y: l.y + dy };
  }
}

/** Boîte (fractions) d'un trait ou d'une forme, pour la sélection. */
function shapeBounds(l: Layer): { x0: number; y0: number; x1: number; y1: number } | null {
  if (l.kind === "path") {
    const xs = l.points.map((p) => p[0]);
    const ys = l.points.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  if (l.kind === "line" || l.kind === "arrow") return { x0: Math.min(l.x1, l.x2), y0: Math.min(l.y1, l.y2), x1: Math.max(l.x1, l.x2), y1: Math.max(l.y1, l.y2) };
  if (l.kind === "rect" || l.kind === "ellipse") return { x0: Math.min(l.x, l.x + l.w), y0: Math.min(l.y, l.y + l.h), x1: Math.max(l.x, l.x + l.w), y1: Math.max(l.y, l.y + l.h) };
  return null;
}

function Workspace({ media, fileName, logoUrl, onClose, onSave }: VideoEditorProps & { media: Media }) {
  const confirm = useConfirm();
  const srcW = media.w;
  const srcH = media.h;
  const initial = useMemo(() => initialEdit(srcW, srcH, media.duration), [srcW, srcH, media.duration]);

  // --- Modifications et historique -----------------------------------------
  const [edit, setEditState] = useState<VideoEdit>(initial);
  const history = useRef<{ past: VideoEdit[]; future: VideoEdit[]; lastPush: number }>({ past: [], future: [], lastPush: 0 });
  const editRef = useRef(edit);
  editRef.current = edit;
  const [, forceHistory] = useState(0);

  const update = useCallback((fn: (e: VideoEdit) => VideoEdit) => {
    const prev = editRef.current;
    const next = fn(prev);
    if (next === prev) return;
    const h = history.current;
    const now = Date.now();
    // Les gestes continus (glisser, curseur) ne font qu'une étape d'historique.
    if (now - h.lastPush > 600) {
      h.past.push(prev);
      if (h.past.length > 60) h.past.shift();
      forceHistory((n) => n + 1);
    }
    h.lastPush = now;
    h.future = [];
    editRef.current = next;
    setEditState(next);
  }, []);

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(editRef.current);
    h.lastPush = 0;
    editRef.current = prev;
    setEditState(prev);
    forceHistory((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(editRef.current);
    h.lastPush = 0;
    editRef.current = next;
    setEditState(next);
    forceHistory((n) => n + 1);
  }, []);

  const changed = !isUnchanged(edit, initial);
  const out = outputSize(edit);
  const base = baseSize(srcW, srcH, edit.quarter);

  // --- Outils -----------------------------------------------------------------
  const [tool, setTool] = useState<Tool>("trim");
  const [drawTool, setDrawTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState<string>(DRAW_COLORS[2]);
  const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTHS[1].value);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState(0);
  const selected = edit.layers.find((l) => l.id === selectedId) ?? null;

  // --- Lecture -----------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [previewMuted, setPreviewMuted] = useState(false);
  const dirty = useRef(true);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = previewMuted || !edit.audio;
  }, [previewMuted, edit.audio]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(media.duration, t));
    setTime(v.currentTime);
    dirty.current = true;
  }, [media.duration]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      const p = playableTime(editRef.current.segments, v.currentTime);
      if (p === null) v.currentTime = editRef.current.segments[0].start;
      else if (p !== v.currentTime) v.currentTime = p;
      void v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }, []);

  // --- Scène : dimensions d'affichage -----------------------------------------
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 600, h: 400 });
  const [zoomView, setZoomView] = useState(1);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // Stabilité (01/10/2026) : la scène est mesurée sur un cadre sans barre de
    // défilement (voir la scène plus bas) et les écarts de moins de 2 px sont
    // ignorés : la taille ne fait plus d'aller-retour (vidéo 16:9 qui
    // « tremblait » : une barre de défilement apparaissait, réduisait la
    // scène, l'aperçu rétrécissait, la barre disparaissait, et ainsi de suite).
    const measure = () =>
      setStage((prev) => {
        const w = Math.floor(el.clientWidth);
        const h = Math.floor(el.clientHeight);
        return Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2 ? prev : { w, h };
      });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const whole = tool === "crop";
  const contentW = whole ? base.w : out.width;
  const contentH = whole ? base.h : out.height;
  const fit = Math.min((stage.w - 32) / contentW, (stage.h - 32) / contentH);
  const dispScale = Math.max(0.02, fit * zoomView);
  const dispW = Math.max(40, Math.floor(contentW * dispScale));
  const dispH = Math.max(40, Math.floor(contentH * dispScale));
  // Défilement seulement quand l'aperçu zoomé dépasse la scène.
  const stageScroll = dispW + 24 > stage.w || dispH + 24 > stage.h;
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const pxW = Math.max(2, Math.round(Math.min(contentW, dispW * dpr)));
  const pxH = Math.max(2, Math.round((pxW * contentH) / contentW));
  const renderSize = useRef({ outW: pxW, outH: pxH, whole });
  renderSize.current = { outW: pxW, outH: pxH, whole };

  // --- Rendu WebGL ------------------------------------------------------------
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<EditRenderer | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  useEffect(() => {
    if (!glCanvasRef.current) return;
    try {
      rendererRef.current = new EditRenderer(glCanvasRef.current);
    } catch (err) {
      setRenderError(err instanceof VideoEditorUnsupportedError ? err.message : "Rendu vidéo indisponible dans ce navigateur.");
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    dirty.current = true;
  }, [edit, pxW, pxH, whole]);

  useEffect(() => {
    let raf = 0;
    let lastTime = 0;
    const tick = (now: number) => {
      const v = videoRef.current;
      const r = rendererRef.current;
      if (v && !v.paused) {
        // Lecture des seuls passages gardés, en boucle.
        const segs = editRef.current.segments;
        const p = playableTime(segs, v.currentTime);
        if (p === null) v.currentTime = segs[0].start;
        else if (p - v.currentTime > 0.02) v.currentTime = p;
        if (now - lastTime > 100) {
          lastTime = now;
          setTime(v.currentTime);
        }
      }
      if (v && r && v.readyState >= 2 && (dirty.current || !v.paused)) {
        dirty.current = false;
        const s = renderSize.current;
        try {
          r.render(v, v.videoWidth, v.videoHeight, editRef.current, srcW, srcH, { outW: s.outW, outH: s.outH, wholeFrame: s.whole });
        } catch {
          /* image pas encore prête */
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [srcW, srcH]);

  // --- Calques ----------------------------------------------------------------
  const [images, setImages] = useState<LayerImages>(new Map());
  useEffect(() => {
    let cancelled = false;
    void loadAllLayerImages(edit.layers, images).then((m) => {
      if (!cancelled && m.size !== images.size) setImages(m);
    });
    return () => {
      cancelled = true;
    };
  }, [edit.layers, images]);

  const [draft, setDraft] = useState<Layer | null>(null);
  const layersRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = layersRef.current;
    if (!c) return;
    c.width = pxW;
    c.height = pxH;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, pxW, pxH);
    if (whole) return;
    drawLayers(ctx, draft ? [...edit.layers, draft] : edit.layers, pxW, pxH, images);
  }, [edit.layers, draft, pxW, pxH, images, whole]);

  // --- Pointeur sur la scène ------------------------------------------------------
  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const frac = (e: { clientX: number; clientY: number }) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const;
  };

  const layerTools = tool === "stickers" || tool === "draw";

  function onStageDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const [fx, fy] = frac(e);
    const ed = editRef.current;
    if (tool === "crop") {
      const bx = fx * base.w;
      const by = fy * base.h;
      const c = ed.crop;
      if (bx >= c.x && bx <= c.x + c.w && by >= c.y && by <= c.y + c.h) {
        drag.current = { kind: "crop-move", startX: bx, startY: by, orig: c };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (!layerTools) return;
    const W = out.width;
    const H = out.height;
    const tol = (12 * W) / dispW;
    const hit = layerAt(ed.layers, fx * W, fy * H, W, H, tol);
    const creating = tool === "draw" && drawTool !== "select" && drawTool !== "eraser";
    if (tool === "draw" && drawTool === "eraser") {
      if (hit) update((x) => ({ ...x, layers: x.layers.filter((l) => l.id !== hit.id) }));
      drag.current = { kind: "erase" };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (hit && (!creating || hit.id === selectedId)) {
      setSelectedId(hit.id);
      drag.current = { kind: "layer-move", id: hit.id, startFx: fx, startFy: fy, orig: hit };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (!creating) {
      setSelectedId(null);
      return;
    }
    if (drawTool === "text") {
      const t: Layer = { id: layerId(), kind: "text", x: fx, y: fy, size: 0.07, rotation: 0, text: "Votre texte", color };
      update((x) => ({ ...x, layers: [...x.layers, t] }));
      setSelectedId(t.id);
      setDrawTool("select");
      window.setTimeout(() => document.getElementById("video-editor-text")?.focus(), 50);
      return;
    }
    const id = layerId();
    const d: Layer =
      drawTool === "pen"
        ? { id, kind: "path", points: [[fx, fy]], color, width: strokeWidth }
        : drawTool === "line" || drawTool === "arrow"
          ? { id, kind: drawTool, x1: fx, y1: fy, x2: fx, y2: fy, color, width: strokeWidth }
          : { id, kind: drawTool as "rect" | "ellipse", x: fx, y: fy, w: 0, h: 0, color, width: strokeWidth };
    setSelectedId(null);
    drag.current = { kind: "draw", draft: d };
    setDraft(d);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onStageMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const [fx, fy] = frac(e);
    if (d.kind === "crop-move") {
      const bx = fx * base.w;
      const by = fy * base.h;
      update((x) => ({ ...x, resize: null, crop: clampCrop({ ...d.orig, x: d.orig.x + bx - d.startX, y: d.orig.y + by - d.startY }, base) }));
    } else if (d.kind === "crop-corner") {
      const ratio = aspectRatio(editRef.current.aspect, base); // « Libre » : null
      update((x) => ({ ...x, resize: null, crop: dragCropCorner(x.crop, d.corner, Math.min(base.w, Math.max(0, fx * base.w)), Math.min(base.h, Math.max(0, fy * base.h)), base, ratio) }));
    } else if (d.kind === "layer-move") {
      const moved = moveLayer(d.orig, fx - d.startFx, fy - d.startFy);
      update((x) => ({ ...x, layers: x.layers.map((l) => (l.id === d.id ? moved : l)) }));
    } else if (d.kind === "layer-scale" || d.kind === "layer-rotate") {
      const b = layerBox(d.orig, dispW, dispH);
      const px = fx * dispW - b.cx;
      const py = fy * dispH - b.cy;
      if (d.kind === "layer-scale") {
        const size = Math.max(0.02, Math.min(1.5, (d.orig.size * Math.hypot(px, py)) / Math.max(1, d.startDist)));
        update((x) => ({ ...x, layers: x.layers.map((l) => (l.id === d.id ? { ...d.orig, size } : l)) }));
      } else {
        const angle = (Math.atan2(py, px) * 180) / Math.PI;
        let rotation = d.orig.rotation + angle - d.startAngle;
        rotation = ((rotation + 540) % 360) - 180;
        if (Math.abs(rotation) < 4) rotation = 0;
        update((x) => ({ ...x, layers: x.layers.map((l) => (l.id === d.id ? { ...d.orig, rotation } : l)) }));
      }
    } else if (d.kind === "erase") {
      const W = out.width;
      const H = out.height;
      const hit = layerAt(editRef.current.layers, fx * W, fy * H, W, H, (12 * W) / dispW);
      if (hit) update((x) => ({ ...x, layers: x.layers.filter((l) => l.id !== hit.id) }));
    } else if (d.kind === "draw") {
      const cur = d.draft;
      let next: Layer = cur;
      if (cur.kind === "path") {
        const last = cur.points[cur.points.length - 1];
        if (Math.hypot((fx - last[0]) * dispW, (fy - last[1]) * dispH) < 2) return;
        next = { ...cur, points: [...cur.points, [fx, fy]] };
      } else if (cur.kind === "line" || cur.kind === "arrow") {
        next = { ...cur, x2: fx, y2: fy };
      } else if (cur.kind === "rect" || cur.kind === "ellipse") {
        next = { ...cur, w: fx - cur.x, h: fy - cur.y };
      }
      d.draft = next;
      setDraft(next);
    }
  }

  function onStageUp() {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "draw") {
      setDraft(null);
      const l = d.draft;
      const tiny =
        (l.kind === "line" || l.kind === "arrow") ? Math.hypot((l.x2 - l.x1) * dispW, (l.y2 - l.y1) * dispH) < 4 : (l.kind === "rect" || l.kind === "ellipse") ? Math.abs(l.w * dispW) < 4 || Math.abs(l.h * dispH) < 4 : false;
      if (!tiny) update((x) => ({ ...x, layers: [...x.layers, l] }));
    }
    // Fin d'un geste : le suivant sera une nouvelle étape d'historique.
    history.current.lastPush = 0;
  }

  function startHandle(e: ReactPointerEvent, kind: "layer-scale" | "layer-rotate" | "crop-corner", corner?: "nw" | "ne" | "sw" | "se") {
    e.stopPropagation();
    if (kind === "crop-corner" && corner) {
      drag.current = { kind: "crop-corner", corner };
    } else if (selected && (selected.kind === "sticker" || selected.kind === "text")) {
      const [fx, fy] = frac(e);
      const b = layerBox(selected, dispW, dispH);
      const px = fx * dispW - b.cx;
      const py = fy * dispH - b.cy;
      drag.current = kind === "layer-scale" ? { kind, id: selected.id, startDist: Math.hypot(px, py), orig: selected } : { kind: "layer-rotate", id: selected.id, startAngle: (Math.atan2(py, px) * 180) / Math.PI, orig: selected };
    }
    overlayRef.current?.setPointerCapture(e.pointerId);
  }

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    update((x) => ({ ...x, layers: x.layers.filter((l) => l.id !== selectedId) }));
    setSelectedId(null);
  }, [selectedId, update]);

  // --- Clavier -------------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        if (typing) return;
        e.preventDefault();
        redo();
      } else if (e.key === " " && !typing && (target?.tagName !== "BUTTON")) {
        e.preventDefault();
        togglePlay();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !typing && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "Escape" && !exportingRef.current) {
        void requestClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // --- Fermeture et enregistrement -------------------------------------------------
  const [exporting, setExporting] = useState<{ progress: number; step: string; error?: string } | null>(null);
  const exportingRef = useRef(false);
  exportingRef.current = Boolean(exporting && !exporting.error);
  const abortRef = useRef<AbortController | null>(null);

  const closing = useRef(false);
  async function requestClose() {
    if (closing.current) return;
    if (changed) {
      closing.current = true;
      const ok = await confirm({ title: "Quitter sans enregistrer ?", message: "Vos modifications de la vidéo seront perdues.", confirmLabel: "Quitter", danger: true });
      closing.current = false;
      if (!ok) return;
    }
    onClose();
  }

  async function save() {
    videoRef.current?.pause();
    const controller = new AbortController();
    abortRef.current = controller;
    setExporting({ progress: 0, step: "Préparation…" });
    try {
      const result = await exportEditedVideo(media.blob, editRef.current, {
        srcW,
        srcH,
        signal: controller.signal,
        // Tests automatiques seulement (variable fixée au build de test ; absente sur Vercel).
        videoCodecForTests: process.env.NEXT_PUBLIC_VIDEO_EDITOR_TEST_CODEC === "vp9" ? "vp9" : undefined,
        onProgress: (p, step) => setExporting({ progress: p, step: step === "audio" ? "Préparation du son…" : step === "video" ? "Création des images…" : "Finalisation…" })
      });
      setExporting({ progress: 1, step: "Envoi de la vidéo…" });
      const baseName = fileName.replace(/\.[a-z0-9]+$/i, "") || "video";
      const file = new File([result.blob], `${baseName}-modifiee.mp4`, { type: "video/mp4" });
      await onSave(file);
      onClose();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setExporting(null);
        return;
      }
      setExporting({ progress: 0, step: "", error: (err as Error).message || "La vidéo n'a pas pu être créée." });
    } finally {
      abortRef.current = null;
    }
  }

  // --- Miniatures de la frise et des filtres ----------------------------------------
  const [strip, setStrip] = useState<string[]>([]);
  useEffect(() => {
    let urls: string[] = [];
    let cancelled = false;
    captureVideoFrames(media.url, 10, { maxWidth: 160 })
      .then((blobs) => {
        urls = blobs.map((b) => URL.createObjectURL(b));
        if (!cancelled) setStrip(urls);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [media.url]);

  const [filterThumbs, setFilterThumbs] = useState<Partial<Record<FilterId, string>>>({});
  useEffect(() => {
    if (tool !== "filter") return;
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    let r: EditRenderer | null = null;
    try {
      r = new EditRenderer();
      const w = 96;
      const h = Math.max(2, Math.round((w * out.height) / out.width));
      const thumbs: Partial<Record<FilterId, string>> = {};
      for (const f of FILTERS) {
        r.render(v, v.videoWidth, v.videoHeight, { ...editRef.current, adjust: NEUTRAL_ADJUSTMENTS }, srcW, srcH, { outW: w, outH: h, filter: f.id });
        thumbs[f.id] = r.canvas.toDataURL("image/jpeg", 0.8);
      }
      setFilterThumbs(thumbs);
    } catch {
      /* vignettes facultatives */
    } finally {
      r?.dispose();
    }
    // Recalculées à l'ouverture de l'outil (cadrage et image du moment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;

  // --- Rendu ------------------------------------------------------------------------
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header onClose={() => void requestClose()}>
        <div className="hidden items-center gap-1 sm:flex">
          <IconButton label="Annuler la dernière action (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
            <I.IcUndo className="h-4 w-4" />
          </IconButton>
          <IconButton label="Rétablir (Ctrl+Maj+Z)" onClick={redo} disabled={!canRedo}>
            <I.IcRedo className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Tout réinitialiser"
            onClick={() => {
              update(() => initial);
              setSelectedId(null);
            }}
            disabled={!changed}
          >
            <I.IcReset className="h-4 w-4" />
          </IconButton>
        </div>
      </Header>

      {/* Barre du haut : zoom de l'aperçu et son de la vidéo finale. */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-white/[0.06] px-3 py-2 text-xs">
        <div className="flex items-center gap-1 sm:hidden">
          <IconButton label="Annuler la dernière action" onClick={undo} disabled={!canUndo}>
            <I.IcUndo className="h-4 w-4" />
          </IconButton>
          <IconButton label="Rétablir" onClick={redo} disabled={!canRedo}>
            <I.IcRedo className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex items-center rounded-lg border border-white/10" role="group" aria-label="Zoom de l'aperçu">
          <button type="button" onClick={() => setZoomView((z) => Math.max(0.25, z / 1.25))} aria-label="Dézoomer l'aperçu" className="px-2 py-1.5 text-slate-300 hover:text-white">
            <I.IcZoomOut className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setZoomView(1)} title="Ajuster à la fenêtre" className="min-w-[3.5rem] border-x border-white/10 px-2 py-1.5 tabular-nums text-slate-200">
            {Math.round((dispW / contentW) * 100)} %
          </button>
          <button type="button" onClick={() => setZoomView((z) => Math.min(4, z * 1.25))} aria-label="Zoomer l'aperçu" className="px-2 py-1.5 text-slate-300 hover:text-white">
            <I.IcZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Son de la vidéo</span>
          <div className="flex rounded-lg border border-white/10 p-0.5" role="group" aria-label="Son de la vidéo finale">
            {([true, false] as const).map((on) => (
              <button
                key={String(on)}
                type="button"
                aria-pressed={edit.audio === on}
                onClick={() => update((x) => ({ ...x, audio: on }))}
                className={clsx("rounded-md px-2.5 py-1 transition", edit.audio === on ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}
              >
                {on ? "Gardé" : "Coupé"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Outils */}
        <nav aria-label="Outils de l'éditeur" className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.06] p-2 lg:w-48 lg:flex-col lg:border-b-0 lg:border-r lg:p-3">
          {TOOLS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTool(id);
                if (id !== "stickers" && id !== "draw") setSelectedId(null);
              }}
              aria-pressed={tool === id}
              className={clsx(
                "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                tool === id ? "border-aurora-400/50 bg-aurora-400/10 text-white" : "border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Scène */}
          {/* Scène mesurée sur le cadre extérieur, qui n'a jamais de barre de
              défilement : la barre (aperçu zoomé) vit dans le calque intérieur
              et ne peut donc plus changer la taille mesurée (01/10/2026). */}
          <div ref={stageRef} className="relative min-h-[220px] flex-1 overflow-hidden bg-black/20">
            <div className={clsx("absolute inset-0", stageScroll ? "overflow-auto" : "overflow-hidden")}>
            <div
              className="flex min-h-full min-w-full items-center justify-center p-3"
              style={stageScroll ? { width: Math.max(stage.w, dispW + 24), height: Math.max(stage.h, dispH + 24) } : { width: "100%", height: "100%" }}
            >
              <div className="relative shrink-0 shadow-2xl" style={{ width: dispW, height: dispH }}>
                <canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full bg-black" aria-label="Aperçu de la vidéo modifiée" />
                <canvas ref={layersRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
                <div
                  ref={overlayRef}
                  className={clsx("absolute inset-0 touch-none", layerTools && tool === "draw" && drawTool !== "select" ? "cursor-crosshair" : tool === "crop" ? "cursor-move" : "")}
                  onPointerDown={onStageDown}
                  onPointerMove={onStageMove}
                  onPointerUp={onStageUp}
                  onPointerCancel={onStageUp}
                >
                  {tool === "crop" && <CropOverlay crop={edit.crop} base={base} dispW={dispW} dispH={dispH} onCorner={(e, c) => startHandle(e, "crop-corner", c)} />}
                  {layerTools && selected && (
                    <SelectionBox layer={selected} dispW={dispW} dispH={dispH} onScale={(e) => startHandle(e, "layer-scale")} onRotate={(e) => startHandle(e, "layer-rotate")} onDelete={deleteSelected} />
                  )}
                </div>
              </div>
            </div>
            </div>
            {renderError && (
              <p role="alert" className="absolute inset-x-4 top-4 rounded-xl bg-red-500/15 p-3 text-center text-sm text-red-200">
                {renderError}
              </p>
            )}
            {/* Source de l'aperçu (image et son), invisible. */}
            <video
              ref={videoRef}
              src={media.url}
              playsInline
              preload="auto"
              className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onSeeked={() => (dirty.current = true)}
              onLoadedData={() => (dirty.current = true)}
              onTimeUpdate={(e) => !playing && setTime(e.currentTarget.currentTime)}
            />
          </div>

          {/* Réglages de l'outil */}
          <div className="max-h-[45vh] shrink-0 overflow-y-auto border-t border-white/[0.06] px-3 py-3 sm:px-5">
            {tool === "trim" && (
              <TrimPanel
                duration={media.duration}
                segments={edit.segments}
                time={time}
                playing={playing}
                strip={strip}
                selectedSegment={Math.min(selectedSegment, edit.segments.length - 1)}
                onSelectSegment={setSelectedSegment}
                onSeek={seek}
                onTogglePlay={togglePlay}
                previewMuted={previewMuted || !edit.audio}
                audioKept={edit.audio}
                onTogglePreviewMute={() => setPreviewMuted((m) => !m)}
                onSplit={() => update((x) => ({ ...x, segments: splitAt(x.segments, time) }))}
                onRemove={(i) => {
                  update((x) => ({ ...x, segments: removeSegment(x.segments, i) }));
                  setSelectedSegment(0);
                }}
                onReset={() => update((x) => ({ ...x, segments: initialSegments(media.duration) }))}
                onEdge={(i, edge, t) => {
                  update((x) => ({ ...x, segments: moveSegmentEdge(x.segments, i, edge, t, media.duration) }));
                  seek(t);
                }}
              />
            )}
            {tool === "crop" && <CropPanel edit={edit} base={base} out={out} srcW={srcW} srcH={srcH} update={update} />}
            {tool === "adjust" && <AdjustPanel edit={edit} update={update} />}
            {tool === "filter" && <FilterPanel value={edit.filter} thumbs={filterThumbs} onPick={(f) => update((x) => ({ ...x, filter: f }))} />}
            {tool === "stickers" && (
              <StickerPanel
                logoUrl={logoUrl ?? null}
                selected={selected}
                onAdd={(l) => {
                  update((x) => ({ ...x, layers: [...x.layers, l] }));
                  setSelectedId(l.id);
                }}
                onChange={(l) => update((x) => ({ ...x, layers: x.layers.map((y) => (y.id === l.id ? l : y)) }))}
                onDelete={deleteSelected}
              />
            )}
            {tool === "draw" && (
              <DrawPanel
                drawTool={drawTool}
                setDrawTool={(t) => {
                  setDrawTool(t);
                  if (t !== "select") setSelectedId(null);
                }}
                color={color}
                setColor={(c) => {
                  setColor(c);
                  if (selected && selected.kind !== "sticker") update((x) => ({ ...x, layers: x.layers.map((l) => (l.id === selected.id && l.kind !== "sticker" ? { ...l, color: c } : l)) }));
                }}
                strokeWidth={strokeWidth}
                setStrokeWidth={(w) => {
                  setStrokeWidth(w);
                  if (selected && selected.kind !== "sticker" && selected.kind !== "text") update((x) => ({ ...x, layers: x.layers.map((l) => (l.id === selected.id && "width" in l ? { ...l, width: w } : l)) }));
                }}
                selected={selected}
                onChange={(l) => update((x) => ({ ...x, layers: x.layers.map((y) => (y.id === l.id ? l : y)) }))}
                onDelete={deleteSelected}
                onClearAll={() => {
                  update((x) => ({ ...x, layers: x.layers.filter((l) => l.kind === "sticker") }));
                  setSelectedId(null);
                }}
                hasDrawings={edit.layers.some((l) => l.kind !== "sticker")}
              />
            )}
            {tool === "resize" && <ResizePanel edit={edit} out={out} update={update} />}
          </div>
        </div>
      </div>

      {/* Pied : résumé et enregistrement */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 sm:px-6">
        <p className="text-xs tabular-nums text-slate-400">
          Vidéo finale : {out.width} × {out.height} · {formatTime(outputDuration(edit.segments))} · {edit.audio ? "avec le son" : "sans le son"}
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void requestClose()} className="text-sm text-slate-400 transition hover:text-white">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!changed || Boolean(exporting && !exporting.error)}
            className={clsx("btn-glow rounded-xl px-5 py-2.5 text-sm font-medium text-white", (!changed || (exporting && !exporting.error)) && "cursor-not-allowed opacity-50")}
          >
            Enregistrer
          </button>
        </div>
      </div>

      {exporting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="glass-panel-solid w-full max-w-sm rounded-2xl p-5 text-center">
            {exporting.error ? (
              <>
                <p className="font-display text-base font-semibold text-white">La vidéo n&apos;a pas pu être créée</p>
                <p role="alert" className="mt-2 text-sm text-red-300">
                  {exporting.error}
                </p>
                <button type="button" onClick={() => setExporting(null)} className="mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5">
                  Revenir à l&apos;éditeur
                </button>
              </>
            ) : (
              <>
                <p className="font-display text-base font-semibold text-white">{exporting.step}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Création de la vidéo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(exporting.progress * 100)}>
                  <div className="h-full rounded-full bg-aurora-400 transition-[width] duration-200" style={{ width: `${Math.round(exporting.progress * 100)}%` }} />
                </div>
                <p className="mt-2 text-xs tabular-nums text-slate-400" aria-live="polite">
                  {Math.round(exporting.progress * 100)} % · tout se fait sur votre appareil
                </p>
                {abortRef.current && exporting.progress < 1 && (
                  <button type="button" onClick={() => abortRef.current?.abort()} className="mt-4 text-sm text-slate-400 hover:text-white">
                    Annuler
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Petits éléments
// ---------------------------------------------------------------------------

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30">
      {children}
    </button>
  );
}

/** Bouton pastille ; `active: null` = simple action (sans état pressé). */
function Chip({ active, onClick, children, label }: { active: boolean | null; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ?? undefined}
      aria-label={label}
      className={clsx("flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition", active ? "border-aurora-400/60 bg-aurora-400/10 text-white" : "border-white/10 text-slate-300 hover:border-white/25 hover:text-white")}
    >
      {children}
    </button>
  );
}

function Slider({ label, value, min, max, step = 1, unit = "", onChange, onReset }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; onReset?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="h-2 flex-1 cursor-pointer accent-aurora-500" />
      <span className="w-14 text-right text-xs tabular-nums text-slate-200">
        {value > 0 && min < 0 ? "+" : ""}
        {Math.round(value * 10) / 10}
        {unit}
      </span>
      {onReset && (
        <button type="button" onClick={onReset} className="text-xs text-slate-500 hover:text-white" aria-label={`Remettre ${label.toLowerCase()} à zéro`}>
          Zéro
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recadrage et sélection sur la scène
// ---------------------------------------------------------------------------

function CropOverlay({ crop, base, dispW, dispH, onCorner }: { crop: CropRect; base: { w: number; h: number }; dispW: number; dispH: number; onCorner: (e: ReactPointerEvent, c: "nw" | "ne" | "sw" | "se") => void }) {
  const x = (crop.x / base.w) * dispW;
  const y = (crop.y / base.h) * dispH;
  const w = (crop.w / base.w) * dispW;
  const h = (crop.h / base.h) * dispH;
  const corners: ["nw" | "ne" | "sw" | "se", number, number, string][] = [
    ["nw", x, y, "cursor-nwse-resize"],
    ["ne", x + w, y, "cursor-nesw-resize"],
    ["sw", x, y + h, "cursor-nesw-resize"],
    ["se", x + w, y + h, "cursor-nwse-resize"]
  ];
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${dispW} ${dispH}`} aria-hidden="true">
        <path d={`M0 0H${dispW}V${dispH}H0Z M${x} ${y}V${y + h}H${x + w}V${y}Z`} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
        <rect x={x} y={y} width={w} height={h} fill="none" stroke="white" strokeWidth={1.5} />
        {[1, 2].map((k) => (
          <g key={k} stroke="rgba(255,255,255,0.35)" strokeWidth={1}>
            <line x1={x + (w * k) / 3} y1={y} x2={x + (w * k) / 3} y2={y + h} />
            <line x1={x} y1={y + (h * k) / 3} x2={x + w} y2={y + (h * k) / 3} />
          </g>
        ))}
      </svg>
      {corners.map(([c, cx, cy, cursor]) => (
        <span
          key={c}
          role="presentation"
          onPointerDown={(e) => onCorner(e, c)}
          className={clsx("absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/80 shadow", cursor)}
          style={{ left: cx, top: cy }}
        />
      ))}
    </>
  );
}

function SelectionBox({ layer, dispW, dispH, onScale, onRotate, onDelete }: { layer: Layer; dispW: number; dispH: number; onScale: (e: ReactPointerEvent) => void; onRotate: (e: ReactPointerEvent) => void; onDelete: () => void }) {
  const del = (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onDelete}
      aria-label="Supprimer l'élément sélectionné"
      className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow"
    >
      <I.IcClose className="h-3.5 w-3.5" />
    </button>
  );
  if (layer.kind === "sticker" || layer.kind === "text") {
    const b = layerBox(layer, dispW, dispH);
    return (
      <div
        className="pointer-events-none absolute border border-dashed border-white/90"
        style={{ left: b.cx - b.hw, top: b.cy - b.hh, width: b.hw * 2, height: b.hh * 2, transform: `rotate(${layer.rotation}deg)` }}
      >
        <span className="pointer-events-auto absolute -right-2.5 -bottom-2.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-aurora-500 shadow" onPointerDown={onScale} title="Agrandir ou réduire" role="presentation" />
        <span className="pointer-events-auto absolute -top-7 left-1/2 h-5 w-5 -translate-x-1/2 cursor-grab rounded-full border-2 border-white bg-black/80 shadow" onPointerDown={onRotate} title="Tourner" role="presentation" />
        <span className="pointer-events-auto">{del}</span>
      </div>
    );
  }
  const b = shapeBounds(layer);
  if (!b) return null;
  const pad = 8;
  return (
    <div className="pointer-events-none absolute border border-dashed border-white/80" style={{ left: b.x0 * dispW - pad, top: b.y0 * dispH - pad, width: (b.x1 - b.x0) * dispW + pad * 2, height: (b.y1 - b.y0) * dispH + pad * 2 }}>
      <span className="pointer-events-auto">{del}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneaux des outils
// ---------------------------------------------------------------------------

function TrimPanel(p: {
  duration: number;
  segments: VideoEdit["segments"];
  time: number;
  playing: boolean;
  strip: string[];
  selectedSegment: number;
  onSelectSegment: (i: number) => void;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  previewMuted: boolean;
  audioKept: boolean;
  onTogglePreviewMute: () => void;
  onSplit: () => void;
  onRemove: (i: number) => void;
  onReset: () => void;
  onEdge: (i: number, edge: "start" | "end", t: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragEdge = useRef<{ i: number; edge: "start" | "end" } | null>(null);
  const pct = (t: number) => `${(t / p.duration) * 100}%`;
  const timeAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(p.duration, ((clientX - r.left) / r.width) * p.duration));
  };
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const s of p.segments) {
    if (s.start > cursor) gaps.push({ start: cursor, end: s.start });
    cursor = s.end;
  }
  if (cursor < p.duration) gaps.push({ start: cursor, end: p.duration });
  const canSplit = p.segments.some((s) => p.time - s.start >= 0.3 && s.end - p.time >= 0.3);
  const total = outputDuration(p.segments);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={p.onTogglePlay} aria-label={p.playing ? "Pause" : "Lecture"} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/15">
          {p.playing ? <I.IcPause className="h-4 w-4" /> : <I.IcPlay className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={p.onTogglePreviewMute}
          disabled={!p.audioKept}
          aria-label={p.previewMuted ? "Écouter le son de l'aperçu" : "Couper le son de l'aperçu"}
          title={p.audioKept ? undefined : "Le son de la vidéo est coupé (en haut)"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/15 disabled:opacity-40"
        >
          {p.previewMuted ? <I.IcMute className="h-4 w-4" /> : <I.IcSound className="h-4 w-4" />}
        </button>
        <span className="text-xs tabular-nums text-slate-300">
          {formatTime(toOutputTime(p.segments, p.time))} / {formatTime(total)}
        </span>
        <span className="flex-1" />
        <Chip active={null} onClick={p.onSplit} label="Couper la vidéo à l'endroit de la tête de lecture">
          <I.IcSplit className="h-3.5 w-3.5" /> Couper ici
        </Chip>
        <button
          type="button"
          onClick={() => p.onRemove(p.selectedSegment)}
          disabled={p.segments.length < 2}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
        >
          <I.IcTrash className="h-3.5 w-3.5" /> Supprimer ce passage
        </button>
        {(p.segments.length > 1 || p.segments[0].start > 0 || p.segments[0].end < p.duration - 0.01) && (
          <button type="button" onClick={p.onReset} className="text-xs text-slate-400 hover:text-white">
            Tout garder
          </button>
        )}
      </div>
      {!canSplit && p.segments.length === 1 && <p className="sr-only">Placez la tête de lecture dans la vidéo pour la couper.</p>}

      <div
        ref={barRef}
        className="relative h-16 cursor-pointer select-none overflow-hidden rounded-xl border border-white/10 bg-black/40"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.edge) return;
          p.onSeek(timeAt(e.clientX));
          const i = p.segments.findIndex((s) => timeAt(e.clientX) >= s.start && timeAt(e.clientX) <= s.end);
          if (i >= 0) p.onSelectSegment(i);
        }}
        onPointerMove={(e) => {
          const d = dragEdge.current;
          if (d) p.onEdge(d.i, d.edge, timeAt(e.clientX));
        }}
        onPointerUp={() => (dragEdge.current = null)}
        onPointerCancel={() => (dragEdge.current = null)}
      >
        <div className="absolute inset-0 flex">
          {p.strip.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" className="h-full min-w-0 flex-1 object-cover" draggable={false} />
          ))}
        </div>
        {gaps.map((g, i) => (
          <div key={i} className="absolute inset-y-0 bg-black/70" style={{ left: pct(g.start), width: pct(g.end - g.start), backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 6px, transparent 6px 12px)" }} aria-hidden="true" />
        ))}
        {p.segments.map((s, i) => (
          <div
            key={`${s.start}-${s.end}`}
            className={clsx("absolute inset-y-0 rounded-md border-2", i === p.selectedSegment ? "border-amber-300" : "border-amber-300/50")}
            style={{ left: pct(s.start), width: pct(s.end - s.start) }}
          >
            {(["start", "end"] as const).map((edge) => (
              <span
                key={edge}
                data-edge={edge}
                role="slider"
                tabIndex={0}
                aria-label={`${edge === "start" ? "Début" : "Fin"} du passage ${i + 1}`}
                aria-valuemin={0}
                aria-valuemax={Math.round(p.duration * 10) / 10}
                aria-valuenow={Math.round((edge === "start" ? s.start : s.end) * 10) / 10}
                aria-valuetext={formatTime(edge === "start" ? s.start : s.end)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  dragEdge.current = { i, edge };
                  p.onSelectSegment(i);
                  barRef.current?.setPointerCapture(e.pointerId);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const delta = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 0.1);
                  p.onEdge(i, edge, (edge === "start" ? s.start : s.end) + delta);
                }}
                className={clsx("absolute inset-y-0 flex w-3 cursor-ew-resize items-center justify-center bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white", edge === "start" ? "-left-0.5 rounded-l" : "-right-0.5 rounded-r")}
              >
                <span className="h-5 w-0.5 rounded bg-black/50" aria-hidden="true" />
              </span>
            ))}
          </div>
        ))}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: pct(p.time) }} aria-hidden="true">
          <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded bg-white px-1 text-[10px] font-medium tabular-nums text-black">{formatTime(p.time)}</span>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        Tirez les poignées jaunes pour garder un passage. « Couper ici » coupe à la tête de lecture ; choisissez ensuite un passage pour le supprimer. Espace : lecture ou pause.
      </p>
    </div>
  );
}

function CropPanel({ edit, base, out, srcW, srcH, update }: { edit: VideoEdit; base: { w: number; h: number }; out: { width: number; height: number }; srcW: number; srcH: number; update: (fn: (e: VideoEdit) => VideoEdit) => void }) {
  const [dial, setDial] = useState<"angle" | "zoom">("angle");
  const setAspect = (id: AspectId) => update((x) => ({ ...x, aspect: id, resize: null, crop: cropForAspect(baseSize(srcW, srcH, x.quarter), aspectRatio(id, baseSize(srcW, srcH, x.quarter))) }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={null} onClick={() => update((x) => withQuarter(x, (((x.quarter + 90) % 360) as QuarterTurn), srcW, srcH))}>
          <I.IcRotate className="h-3.5 w-3.5" /> Pivoter
        </Chip>
        <Chip active={edit.flipX} onClick={() => update((x) => ({ ...x, flipX: !x.flipX }))}>
          <I.IcFlipH className="h-3.5 w-3.5" /> Miroir horizontal
        </Chip>
        <Chip active={edit.flipY} onClick={() => update((x) => ({ ...x, flipY: !x.flipY }))}>
          <I.IcFlipV className="h-3.5 w-3.5" /> Miroir vertical
        </Chip>
        <span className="flex-1" />
        <span className="text-xs tabular-nums text-slate-400">
          {out.width} × {out.height}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Format du cadrage">
        <span className="flex shrink-0 items-center gap-1 pr-1 text-xs text-slate-400">
          <I.IcRatio className="h-3.5 w-3.5" /> Format
        </span>
        {ASPECTS.map((a) => (
          <Chip key={a.id} active={edit.aspect === a.id} onClick={() => setAspect(a.id)}>
            {a.label}
          </Chip>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-white/10 p-0.5 text-xs" role="group" aria-label="Réglage">
          {(
            [
              ["angle", "Rotation"],
              ["zoom", "Zoom"]
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={dial === id} onClick={() => setDial(id)} className={clsx("rounded-md px-2.5 py-1", dial === id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1">
          {dial === "angle" ? (
            <Slider label="Rotation" value={edit.angle} min={-45} max={45} step={0.5} unit="°" onChange={(v) => update((x) => ({ ...x, angle: v }))} onReset={() => update((x) => ({ ...x, angle: 0 }))} />
          ) : (
            <Slider label="Zoom" value={Math.round(edit.zoom * 100)} min={100} max={300} unit=" %" onChange={(v) => update((x) => ({ ...x, zoom: v / 100 }))} onReset={() => update((x) => ({ ...x, zoom: 1 }))} />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">Glissez le cadre pour le déplacer, ses coins pour le redimensionner.</p>
        <button
          type="button"
          onClick={() => update((x) => ({ ...x, quarter: 0, flipX: false, flipY: false, angle: 0, zoom: 1, aspect: "free", crop: { x: 0, y: 0, w: srcW, h: srcH }, resize: null }))}
          className="shrink-0 text-xs text-slate-400 hover:text-white"
        >
          Réinitialiser le cadrage
        </button>
      </div>
      <span className="sr-only">
        Image de {base.w} × {base.h} pixels.
      </span>
    </div>
  );
}

function AdjustPanel({ edit, update }: { edit: VideoEdit; update: (fn: (e: VideoEdit) => VideoEdit) => void }) {
  const [key, setKey] = useState<AdjustKey>("brightness");
  const def = ADJUSTMENTS.find((a) => a.key === key)!;
  const any = ADJUSTMENTS.some((a) => edit.adjust[a.key] !== 0);
  return (
    <div className="space-y-3">
      <Slider label={def.label} value={edit.adjust[key]} min={def.min} max={def.max} onChange={(v) => update((x) => ({ ...x, adjust: { ...x.adjust, [key]: v } }))} onReset={() => update((x) => ({ ...x, adjust: { ...x.adjust, [key]: 0 } }))} />
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Réglage à modifier">
        {ADJUSTMENTS.map((a) => (
          <Chip key={a.key} active={key === a.key} onClick={() => setKey(a.key)}>
            {a.label}
            {edit.adjust[a.key] !== 0 && <span className="h-1.5 w-1.5 rounded-full bg-aurora-400" aria-label="modifié" />}
          </Chip>
        ))}
      </div>
      {any && (
        <button type="button" onClick={() => update((x) => ({ ...x, adjust: { ...NEUTRAL_ADJUSTMENTS } }))} className="text-xs text-slate-400 hover:text-white">
          Tout remettre à zéro
        </button>
      )}
    </div>
  );
}

function FilterPanel({ value, thumbs, onPick }: { value: FilterId; thumbs: Partial<Record<FilterId, string>>; onPick: (f: FilterId) => void }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1" role="group" aria-label="Filtres">
      {FILTERS.map((f) => (
        <button key={f.id} type="button" onClick={() => onPick(f.id)} aria-pressed={value === f.id} className="flex shrink-0 flex-col items-center gap-1.5">
          <span className={clsx("block h-20 w-14 overflow-hidden rounded-lg border-2 bg-black/40 sm:h-24 sm:w-16", value === f.id ? "border-aurora-400" : "border-transparent")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumbs[f.id] && <img src={thumbs[f.id]} alt="" className="h-full w-full object-cover" />}
          </span>
          <span className={clsx("text-xs", value === f.id ? "text-white" : "text-slate-400")}>{f.label}</span>
        </button>
      ))}
    </div>
  );
}

function StickerPanel({ logoUrl, selected, onAdd, onChange, onDelete }: { logoUrl: string | null; selected: Layer | null; onAdd: (l: Layer) => void; onChange: (l: Layer) => void; onDelete: () => void }) {
  const [tab, setTab] = useState<"emoji" | "logo" | "image">("emoji");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addImage(blob: Blob) {
    setBusy(true);
    setMessage(null);
    try {
      const { dataUrl, aspect } = await imageToDataUrl(blob);
      onAdd({ id: layerId(), kind: "sticker", x: 0.5, y: 0.5, size: 0.35, rotation: 0, image: dataUrl, aspect });
    } catch {
      setMessage("Image illisible. Essayez un PNG ou un JPG.");
    } finally {
      setBusy(false);
    }
  }

  async function addLogo() {
    if (!logoUrl) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(logoUrl);
      if (!res.ok) throw new Error();
      await addImage(await res.blob());
    } catch {
      setMessage("Le logo n'a pas pu être chargé. Ajoutez-le avec « Image », depuis votre ordinateur.");
      setBusy(false);
    }
  }

  const sticker = selected?.kind === "sticker" ? selected : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/10 p-0.5 text-xs" role="group" aria-label="Type d'autocollant">
          {(
            [
              ["emoji", "Emojis"],
              ["logo", "Logo"],
              ["image", "Image"]
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={clsx("rounded-md px-2.5 py-1", tab === id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}>
              {label}
            </button>
          ))}
        </div>
        {sticker && (
          <>
            <span className="flex-1" />
            <div className="w-48">
              <Slider label="Taille" value={Math.round(sticker.size * 100)} min={4} max={120} unit=" %" onChange={(v) => onChange({ ...sticker, size: v / 100 })} />
            </div>
            <button type="button" onClick={onDelete} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-300">
              <I.IcTrash className="h-3.5 w-3.5" /> Retirer
            </button>
          </>
        )}
      </div>
      {tab === "emoji" && (
        <div className="flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onAdd({ id: layerId(), kind: "sticker", x: 0.5, y: 0.5, size: 0.22, rotation: 0, emoji: e })}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] text-2xl transition hover:scale-110 hover:border-white/25"
              aria-label={`Ajouter l'emoji ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {tab === "logo" &&
        (logoUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" className="h-12 w-12 rounded-lg border border-white/10 bg-white object-contain" />
            <button type="button" onClick={() => void addLogo()} disabled={busy} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:border-aurora-400/50 disabled:opacity-50">
              Ajouter le logo de la marque
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Cette marque n&apos;a pas encore de logo (photo de la Page bio). Ajoutez-le avec « Image », depuis votre ordinateur.</p>
        ))}
      {tab === "image" && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:border-aurora-400/50 disabled:opacity-50">
            <I.IcImage className="h-3.5 w-3.5" /> Choisir une image (PNG, JPG)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addImage(f);
              e.target.value = "";
            }}
          />
          <span className="text-[11px] text-slate-500">Un PNG transparent donne le meilleur résultat.</span>
        </div>
      )}
      {message && (
        <p role="alert" className="text-xs text-amber-200">
          {message}
        </p>
      )}
      <p className="text-[11px] text-slate-500">Glissez un autocollant pour le placer ; poignée violette : taille, poignée du haut : rotation. Suppr : retirer.</p>
    </div>
  );
}

function DrawPanel(p: {
  drawTool: DrawTool;
  setDrawTool: (t: DrawTool) => void;
  color: string;
  setColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  selected: Layer | null;
  onChange: (l: Layer) => void;
  onDelete: () => void;
  onClearAll: () => void;
  hasDrawings: boolean;
}) {
  const text = p.selected?.kind === "text" ? p.selected : null;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Outil de dessin">
        {DRAW_TOOLS.map(({ id, label, Icon }) => (
          <Chip key={id} active={p.drawTool === id} onClick={() => p.setDrawTool(id)}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5" role="group" aria-label="Couleur">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => p.setColor(c)}
              aria-pressed={p.color === c}
              aria-label={`Couleur ${c}`}
              className={clsx("h-7 w-7 rounded-full border-2 transition", p.color === c ? "scale-110 border-aurora-400" : "border-white/20")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Épaisseur du trait">
          {STROKE_WIDTHS.map((w) => (
            <Chip key={w.id} active={p.strokeWidth === w.value} onClick={() => p.setStrokeWidth(w.value)}>
              {w.label}
            </Chip>
          ))}
        </div>
        <span className="flex-1" />
        {p.selected && p.selected.kind !== "sticker" && (
          <button type="button" onClick={p.onDelete} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-300">
            <I.IcTrash className="h-3.5 w-3.5" /> Retirer la sélection
          </button>
        )}
        {p.hasDrawings && (
          <button type="button" onClick={p.onClearAll} className="text-xs text-slate-400 hover:text-red-300">
            Tout effacer
          </button>
        )}
      </div>
      {text && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="video-editor-text" className="sr-only">
            Texte
          </label>
          <textarea
            id="video-editor-text"
            value={text.text}
            rows={2}
            maxLength={200}
            onChange={(e) => p.onChange({ ...text, text: e.target.value })}
            className="min-w-[12rem] flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
          />
          <div className="w-48">
            <Slider label="Taille du texte" value={Math.round(text.size * 100)} min={2} max={30} onChange={(v) => p.onChange({ ...text, size: v / 100 })} />
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        {p.drawTool === "text"
          ? "Touchez la vidéo à l'endroit du texte, puis écrivez-le ici."
          : p.drawTool === "eraser"
            ? "Touchez un trait, une forme ou un texte pour l'effacer."
            : p.drawTool === "select"
              ? "Touchez un élément pour le sélectionner, glissez-le pour le déplacer."
              : "Dessinez directement sur la vidéo. Le dessin reste affiché pendant toute la vidéo."}
      </p>
    </div>
  );
}

function ResizePanel({ edit, out, update }: { edit: VideoEdit; out: { width: number; height: number }; update: (fn: (e: VideoEdit) => VideoEdit) => void }) {
  const [locked, setLocked] = useState(true);
  const ratio = edit.crop.w / edit.crop.h;
  const set = (dim: "width" | "height", raw: number) => {
    const v = Math.max(16, Math.min(3840, Math.round(raw) || 16));
    update((x) => {
      const cur = outputSize(x);
      const next = dim === "width" ? { width: v, height: locked ? Math.round(v / ratio) : cur.height } : { width: locked ? Math.round(v * ratio) : cur.width, height: v };
      return { ...x, resize: next };
    });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-400">
          Largeur
          <input type="number" min={16} max={3840} value={out.width} onChange={(e) => set("width", Number(e.target.value))} className="w-20 bg-transparent text-sm tabular-nums text-white outline-none" />
        </label>
        <button type="button" onClick={() => setLocked((l) => !l)} aria-pressed={locked} aria-label={locked ? "Proportions verrouillées" : "Proportions libres"} title={locked ? "Proportions verrouillées" : "Proportions libres (l'image sera étirée)"} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/[0.06]">
          {locked ? <I.IcLock className="h-4 w-4" /> : <I.IcUnlock className="h-4 w-4" />}
        </button>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-slate-400">
          Hauteur
          <input type="number" min={16} max={3840} value={out.height} onChange={(e) => set("height", Number(e.target.value))} className="w-20 bg-transparent text-sm tabular-nums text-white outline-none" />
        </label>
        {edit.resize && (
          <button type="button" onClick={() => update((x) => ({ ...x, resize: null }))} className="text-xs text-slate-400 hover:text-white">
            Taille automatique
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {[1080, 720].map((w) => (
          <Chip key={w} active={out.width === w && Boolean(edit.resize)} onClick={() => set("width", w)}>
            Largeur {w} px
          </Chip>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        Taille automatique : celle du cadrage, 1920 px au plus. Les réseaux recommandent 1080 px de large ; 720 px donne un fichier plus léger. Dimensions paires (exigence du format MP4).
      </p>
    </div>
  );
}
