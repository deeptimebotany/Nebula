"use client";

// Fonds de particules propres à deux thèmes easter egg (24/09/2026) :
//  - « nova »   : particules orange et or qui clignotent doucement, plus
//                 nombreuses vers le bas de l'écran (proposition B7 « Horizon »).
//  - « prisme » : fines étoiles arc-en-ciel qui descendent lentement, comme
//                 une neige colorée (proposition A4), pour le million d'abonnés.
// Volontairement discrets : peu de particules, très fines, mouvement lent.
// Image fixe si l'utilisateur préfère réduire les animations ; la boucle
// s'arrête quand l'onglet est caché.

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { useTheme } from "@/components/theme-provider";
import { useMode } from "@/components/mode-provider";

export type ParticleVariant = "nova" | "prisme";

export function particleVariantForTheme(themeKey: string | null | undefined): ParticleVariant | null {
  if (themeKey === "nova") return "nova";
  if (themeKey === "prisme") return "prisme";
  return null;
}

const NOVA_PALETTE = [
  [255, 243, 208],
  [255, 196, 107],
  [255, 138, 61],
  [224, 83, 31]
];

// Vitesse globale (1 = vitesse des propositions ralenties validées).
const SPEED = 0.45;

interface Particle {
  x: number; // fraction 0..1
  y: number; // fraction 0..1
  size: number;
  v: number;
  ph: number;
  tw: number;
  hue: number;
  t: number;
}

function paletteAt(t: number): number[] {
  const x = Math.min(0.999, Math.max(0, t)) * (NOVA_PALETTE.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = NOVA_PALETTE[i];
  const b = NOVA_PALETTE[i + 1] ?? a;
  return a.map((c, k) => Math.round(c + (b[k] - c) * f));
}

function hsl(h: number, s: number, l: number): number[] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

function makeParticles(variant: ParticleVariant, area: number): Particle[] {
  // Densité calée sur la maquette (≈ 70 particules pour 400×280 px), plafonnée.
  const perPx = variant === "nova" ? 70 / (400 * 280) : 45 / (400 * 280);
  const count = Math.max(20, Math.min(variant === "nova" ? 260 : 170, Math.round(area * perPx)));
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    // Nova : concentrées vers le bas, le haut reste presque vide.
    y: variant === "nova" ? 1 - Math.pow(Math.random(), 2.5) : Math.random(),
    size: 0.5 + Math.random() * 0.7,
    v: 0.6 + Math.random() * 0.8,
    ph: Math.random() * Math.PI * 2,
    tw: 0.5 + Math.random() * 1.2,
    hue: Math.random() * 360,
    t: Math.random()
  }));
}

export function ParticleCanvas({
  variant,
  className,
  style
}: {
  variant: ParticleVariant;
  className?: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const maybeCtx = canvasEl?.getContext("2d");
    if (!canvasEl || !maybeCtx) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = maybeCtx;
    let W = 0;
    let H = 0;
    let parts: Particle[] = [];
    let raf: number | null = null;
    let last = performance.now();
    let time = Math.random() * 20;
    const still = prefersReducedMotion();

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = makeParticles(variant, W * H);
      if (still) draw();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        let rgb: number[];
        let alpha: number;
        if (variant === "nova") {
          rgb = paletteAt(p.t);
          const s = 0.5 + 0.5 * Math.sin(time * p.tw + p.ph);
          alpha = (0.1 + 0.9 * s * s) * 0.85;
        } else {
          rgb = hsl((p.hue + time * 6) % 360, 85, 70);
          alpha = (0.55 + 0.25 * Math.sin(time * 0.8 + p.ph)) * 0.85;
        }
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.min(1, alpha)})`;
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, Math.max(0.35, p.size / 2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000) * SPEED;
      last = now;
      if (document.hidden) return;
      time += dt;
      for (const p of parts) {
        if (variant === "nova") {
          p.x -= (2 * p.v * dt) / Math.max(1, W);
        } else {
          p.x += (1 * p.v * dt) / Math.max(1, W);
          p.y += (6 * p.v * dt) / Math.max(1, H);
        }
        if (p.x < 0) p.x += 1;
        if (p.x > 1) p.x -= 1;
        if (p.y > 1) p.y -= 1;
      }
      draw();
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    if (!still) raf = requestAnimationFrame(frame);
    return () => {
      ro.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [variant]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={style} />;
}

/** Fond de particules de l'application connectée, selon le thème actif (mode sombre seulement). */
export function AppThemeParticles() {
  const { themeKey } = useTheme();
  const { mode } = useMode();
  const variant = particleVariantForTheme(themeKey);
  if (!variant || mode === "light") return null;
  return <ParticleCanvas variant={variant} className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: 0 }} />;
}
