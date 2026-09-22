"use client";

// Cosmétique "Poussière d'étoiles (menu latéral)" (voir src/lib/cosmetics.ts,
// désormais débloqué en easter egg — voir easter-eggs-registry.ts,
// "sidebar-menu-mash-unlock") : un semis de points qui dérivent doucement et
// scintillent, exactement le même principe que le thème étoilé animé plein
// écran (voir starfield.tsx — dérive + réapparition de l'autre côté + calcul
// via requestAnimationFrame), juste transposé à la petite zone du menu
// latéral plutôt qu'au canvas plein écran. Une première version en traits
// façon "étoiles filantes" (via CSS pur) a été remplacée par celle-ci à la
// demande explicite ("des points qui défilent comme sur le fond animé
// étoilé", pas des traits).
//
// Manipulation DOM directe (spans + style.left/top en rAF), pas de state
// React par frame : même raison que cosmetics-effects.tsx à l'époque du
// curseur — un re-render à chaque frame serait inutilement coûteux pour un
// aussi grand nombre de mises à jour par seconde.
import { useEffect, useRef } from "react";

interface DriftDot {
  el: HTMLSpanElement;
  x: number; // fraction 0..1 de la largeur du conteneur
  y: number; // fraction 0..1 de la hauteur du conteneur
  r: number; // rayon en px
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  vx: number; // dérive horizontale, fraction/seconde
  vy: number; // dérive verticale, fraction/seconde
}

const DOT_COUNT = 18;

function makeDots(container: HTMLDivElement, count: number): DriftDot[] {
  return Array.from({ length: count }, () => {
    const layer = Math.random();
    const el = document.createElement("span");
    el.className = "nebula-sidebar-star-dot";
    container.appendChild(el);
    return {
      el,
      x: Math.random(),
      y: Math.random(),
      r: 1 + layer * 1.6,
      baseAlpha: 0.3 + layer * 0.55,
      twinkleSpeed: 0.4 + Math.random() * 1.1,
      twinklePhase: Math.random() * Math.PI * 2,
      vx: -0.004 - layer * 0.01,
      vy: 0.003 + layer * 0.008
    };
  });
}

export function SidebarShootingStars() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const dots = makeDots(container, DOT_COUNT);

    let lastTime = performance.now();
    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      for (const d of dots) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        // Réapparition de l'autre côté : dérive continue, jamais de saut brusque visible.
        if (d.x < -0.03) d.x = 1.03;
        if (d.x > 1.03) d.x = -0.03;
        if (d.y < -0.03) d.y = 1.03;
        if (d.y > 1.03) d.y = -0.03;

        const twinkle = 0.5 + 0.5 * Math.sin((now / 1000) * d.twinkleSpeed + d.twinklePhase);
        const alpha = d.baseAlpha * (0.55 + 0.45 * twinkle);

        d.el.style.left = `${d.x * 100}%`;
        d.el.style.top = `${d.y * 100}%`;
        d.el.style.width = `${d.r * 2}px`;
        d.el.style.height = `${d.r * 2}px`;
        d.el.style.opacity = alpha.toFixed(3);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      dots.forEach((d) => d.el.remove());
    };
  }, []);

  return <div ref={containerRef} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" />;
}
