"use client";

// Thème étoilé animé, exclusif aux paliers Pro et Agence (voir
// starfield-provider.tsx + /api/settings/starfield pour l'activation et la
// revérification du palier). Remplace le fond statique habituel (--app-bg,
// voir globals.css) par un ciel étoilé qui défile en continu derrière toute
// l'interface tant qu'il est actif — restauré automatiquement dès qu'il ne
// l'est plus (désactivation manuelle, palier insuffisant, démontage).
//
// Bonus caché : Maj (Shift) + clic n'importe où sur l'écran pendant que ce
// fond est actif relie les étoiles les plus proches du clic en une
// constellation éphémère, qui s'efface en douceur après quelques secondes.

import { useEffect, useRef } from "react";
import { useStarfield } from "@/components/starfield-provider";
import { useBackground } from "@/components/background-provider";
import { findBackground } from "@/lib/backgrounds";

interface Star {
  x: number; // fraction 0..1 de la largeur du canvas
  y: number; // fraction 0..1 de la hauteur du canvas
  r: number; // rayon en px
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  vx: number; // dérive horizontale, fraction/seconde
  vy: number; // dérive verticale, fraction/seconde
}

interface Constellation {
  points: { x: number; y: number }[]; // [origine (clic), étoiles voisines...] en px écran
  createdAt: number;
}

const STAR_COUNT = 170;
const CONSTELLATION_FADE_MS = 2600;
const CONSTELLATION_NEIGHBORS = 5;
const CONSTELLATION_MAX_DISTANCE_PX = 260;

function makeStars(count: number): Star[] {
  return Array.from({ length: count }, () => {
    // "layer" simule une profondeur : les étoiles avec layer élevé sont plus
    // grosses, plus lumineuses et dérivent plus vite — effet de parallaxe
    // sans avoir besoin de plusieurs canvases.
    const layer = Math.random();
    return {
      x: Math.random(),
      y: Math.random(),
      r: 0.5 + layer * 1.6,
      baseAlpha: 0.35 + layer * 0.55,
      twinkleSpeed: 0.4 + Math.random() * 1.1,
      twinklePhase: Math.random() * Math.PI * 2,
      vx: -0.006 - layer * 0.014,
      vy: 0.004 + layer * 0.01
    };
  });
}

export function Starfield() {
  const { enabled, allowed } = useStarfield();
  const { backgroundKey } = useBackground();
  const active = enabled && allowed;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const constellationsRef = useRef<Constellation[]>([]);
  const rafRef = useRef<number | null>(null);

  // Le fond étoilé remplace le fond statique habituel (--app-bg) tant qu'il
  // est actif, et restaure exactement le fond choisi dans Paramètres dès
  // qu'il ne l'est plus, quelle qu'en soit la raison (toggle, palier,
  // démontage du composant).
  useEffect(() => {
    const root = document.documentElement;
    function restore() {
      root.style.setProperty("--app-bg", findBackground(backgroundKey).css);
    }
    if (active) {
      root.style.setProperty("--app-bg", "transparent");
    } else {
      restore();
    }
    return restore;
  }, [active, backgroundKey]);

  useEffect(() => {
    if (!active) return;
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const maybeCtx = canvasEl.getContext("2d");
    if (!maybeCtx) return;
    // Types explicites (plutôt que de compter sur le rétrécissement de type
    // de TypeScript) : `canvas`/`ctx` sont utilisés dans des fonctions
    // imbriquées (resize/tick/onClick), et TypeScript ne conserve pas le
    // rétrécissement d'un `if (!x) return` à travers une frontière de
    // fermeture — sans ça, le build Next.js échoue avec "possibly null"
    // malgré ces contrôles.
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    if (starsRef.current.length === 0) {
      starsRef.current = makeStars(STAR_COUNT);
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    // Easter egg : Maj + clic relie les quelques étoiles les plus proches du
    // clic en une constellation qui s'efface après CONSTELLATION_FADE_MS.
    function onClick(e: MouseEvent) {
      if (!e.shiftKey) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const clickX = e.clientX;
      const clickY = e.clientY;
      const neighbors = starsRef.current
        .map((s) => {
          const sx = s.x * w;
          const sy = s.y * h;
          return { sx, sy, dist: Math.hypot(sx - clickX, sy - clickY) };
        })
        .filter((s) => s.dist <= CONSTELLATION_MAX_DISTANCE_PX)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, CONSTELLATION_NEIGHBORS);

      if (neighbors.length < 2) return;

      constellationsRef.current.push({
        points: [{ x: clickX, y: clickY }, ...neighbors.map((s) => ({ x: s.sx, y: s.sy }))],
        createdAt: performance.now()
      });
    }
    window.addEventListener("click", onClick);

    let lastTime = performance.now();

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      for (const star of starsRef.current) {
        star.x += star.vx * dt;
        star.y += star.vy * dt;
        // Réapparition de l'autre côté de l'écran : défilement infini.
        if (star.x < -0.02) star.x = 1.02;
        if (star.x > 1.02) star.x = -0.02;
        if (star.y < -0.02) star.y = 1.02;
        if (star.y > 1.02) star.y = -0.02;

        const twinkle = 0.5 + 0.5 * Math.sin((now / 1000) * star.twinkleSpeed + star.twinklePhase);
        const alpha = star.baseAlpha * (0.55 + 0.45 * twinkle);

        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx.fill();
      }

      if (constellationsRef.current.length > 0) {
        constellationsRef.current = constellationsRef.current.filter(
          (c) => now - c.createdAt < CONSTELLATION_FADE_MS
        );
        for (const c of constellationsRef.current) {
          const fade = 1 - (now - c.createdAt) / CONSTELLATION_FADE_MS;
          const [origin, ...points] = c.points;

          ctx.strokeStyle = `rgba(180, 210, 255, ${(fade * 0.75).toFixed(3)})`;
          ctx.lineWidth = 1.2;
          for (const p of points) {
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }

          ctx.fillStyle = `rgba(220, 235, 255, ${fade.toFixed(3)})`;
          for (const p of [origin, ...points]) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("click", onClick);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0" style={{ zIndex: 0 }} />
  );
}
