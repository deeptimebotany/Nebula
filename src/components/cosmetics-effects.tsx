"use client";

// Effets globaux des cosmétiques "curseur", "clic" et une partie de "decor"
// (voir src/lib/cosmetics.ts) : tout ce qui doit s'appliquer PARTOUT dans le
// tableau de bord vit ici, monté une seule fois dans le layout (dashboard),
// plutôt que dupliqué page par page. Les cosmétiques propres à une seule
// page (constellation-calendrier, ciel-nocturne-composer, etc.) restent
// câblés directement dans leur page.
//
// Manipulation DOM directe (refs, pas de setState par mousemove) pour le
// curseur : un state React sur chaque déplacement de souris ferait tourner
// le rendu en boucle. Les particules ponctuelles (clic, transition) restent
// en state — elles sont peu fréquentes.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCosmetics } from "@/components/cosmetics-provider";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  angle: number;
  distance: number;
}

let nextParticleId = 0;

function ParticleBurst({ x, y, colors, count, spread }: { x: number; y: number; colors: string[]; count: number; spread: number }) {
  const particles: Particle[] = Array.from({ length: count }, () => ({
    id: nextParticleId++,
    x,
    y,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 3 + Math.random() * 4,
    angle: Math.random() * Math.PI * 2,
    distance: spread * (0.5 + Math.random() * 0.5)
  }));
  return (
    <>
      {particles.map((p) => (
        <span
          key={p.id}
          className="nebula-cosmetic-particle"
          style={
            {
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              background: p.color,
              "--dx": `${Math.cos(p.angle) * p.distance}px`,
              "--dy": `${Math.sin(p.angle) * p.distance}px`
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

const CLICK_COLORS = ["#63e6ff", "#7c6cf0", "#b4c8fa"];
const TRANSITION_COLORS = ["#7c6cf0", "#63e6ff", "#e8d9ff"];

export function CosmeticsEffects() {
  const cosmetics = useCosmetics();
  const pathname = usePathname();
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; colors: string[]; count: number; spread: number }[]>([]);
  const trailRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const mousePos = useRef({ x: -100, y: -100 });
  const isFirstPath = useRef(true);

  const hasComet = cosmetics.has("curseur-comete");
  const hasShootingStar = cosmetics.has("curseur-etoile-filante");
  const hasClickStar = cosmetics.has("clic-etoile-explosive");
  const hasClickSparks = cosmetics.has("clic-etincelles");
  const hasHoverComet = cosmetics.has("survol-comete-bouton");
  const hasTransition = cosmetics.has("transition-etoiles");
  const hasCosmicFont = cosmetics.has("police-cosmique");
  const hasRetroFavicon = cosmetics.has("icone-app-retro");

  // "Police Cosmique" — un simple attribut sur <html>, lu par globals.css.
  useEffect(() => {
    if (hasCosmicFont) document.documentElement.setAttribute("data-cosmic-font", "1");
    else document.documentElement.removeAttribute("data-cosmic-font");
  }, [hasCosmicFont]);

  // "Icône rétro" — favicon pixel-art généré en SVG inline (data URI), sans
  // fichier image dans le dépôt. Restaure le favicon d'origine à la
  // désactivation.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    const original = link?.getAttribute("href") ?? null;
    if (hasRetroFavicon && link) {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' shape-rendering='crispEdges'><rect width='16' height='16' fill='#05070f'/><rect x='6' y='2' width='4' height='2' fill='#7c6cf0'/><rect x='4' y='4' width='8' height='2' fill='#63e6ff'/><rect x='2' y='6' width='12' height='4' fill='#7c6cf0'/><rect x='4' y='10' width='8' height='2' fill='#63e6ff'/><rect x='6' y='12' width='4' height='2' fill='#b4c8fa'/></svg>`;
      link.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(svg)}`);
    } else if (link && original) {
      link.setAttribute("href", original);
    }
  }, [hasRetroFavicon]);

  // Curseur (comète ou étoile filante — la comète, réservée Agence, prime si
  // les deux sont actifs).
  useEffect(() => {
    if (!hasComet && !hasShootingStar) return;
    const container = trailRef.current;
    if (!container) return;
    const dotCount = hasComet ? 14 : 8;
    const dots: HTMLSpanElement[] = Array.from({ length: dotCount }, (_, i) => {
      const el = document.createElement("span");
      el.className = hasComet ? "nebula-cursor-comet-dot" : "nebula-cursor-star-dot";
      el.style.opacity = String(1 - i / dotCount);
      const scale = 1 - i / (dotCount * 1.4);
      el.style.transform = `translate(-50%, -50%) scale(${scale})`;
      container.appendChild(el);
      return el;
    });
    const positions = dots.map(() => ({ x: mousePos.current.x, y: mousePos.current.y }));

    function onMove(e: MouseEvent) {
      mousePos.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("mousemove", onMove);

    function tick() {
      positions[0].x += (mousePos.current.x - positions[0].x) * 0.35;
      positions[0].y += (mousePos.current.y - positions[0].y) * 0.35;
      for (let i = 1; i < positions.length; i++) {
        positions[i].x += (positions[i - 1].x - positions[i].x) * 0.45;
        positions[i].y += (positions[i - 1].y - positions[i].y) * 0.45;
      }
      dots.forEach((el, i) => {
        el.style.left = `${positions[i].x}px`;
        el.style.top = `${positions[i].y}px`;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      dots.forEach((el) => el.remove());
    };
  }, [hasComet, hasShootingStar]);

  // Clic : étincelles ou étoile explosive (celle-ci prime si les deux sont
  // actifs — c'est la version Agence, plus spectaculaire).
  useEffect(() => {
    if (!hasClickStar && !hasClickSparks) return;
    function onClick(e: MouseEvent) {
      const id = nextParticleId++;
      const colors = hasClickStar ? ["#63e6ff", "#ffd76a", "#b4c8fa"] : CLICK_COLORS;
      const count = hasClickStar ? 16 : 8;
      const spread = hasClickStar ? 70 : 32;
      setBursts((prev) => [...prev, { id, x: e.clientX, y: e.clientY, colors, count, spread }]);
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 700);
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [hasClickStar, hasClickSparks]);

  // Survol "Comète" sur les boutons `.btn-glow` — une traînée courte au
  // passage du curseur, seulement sur ces boutons (pas partout).
  useEffect(() => {
    if (!hasHoverComet) return;
    function onOver(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest?.(".btn-glow");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const id = nextParticleId++;
      setBursts((prev) => [
        ...prev,
        { id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, colors: ["#63e6ff", "#7c6cf0"], count: 6, spread: 26 }
      ]);
      window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 600);
    }
    window.addEventListener("mouseover", onOver);
    return () => window.removeEventListener("mouseover", onOver);
  }, [hasHoverComet]);

  // "Traversée d'étoiles" — une traînée de particules à chaque changement de
  // page (pathname). On ignore le tout premier rendu (chargement initial).
  useEffect(() => {
    if (!hasTransition) return;
    if (isFirstPath.current) {
      isFirstPath.current = false;
      return;
    }
    const id = nextParticleId++;
    setBursts((prev) => [
      ...prev,
      { id, x: window.innerWidth / 2, y: window.innerHeight / 2, colors: TRANSITION_COLORS, count: 22, spread: 160 }
    ]);
    window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hasTransition]);

  return (
    <>
      <div ref={trailRef} className="pointer-events-none fixed inset-0 z-[90]" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" aria-hidden="true">
        {bursts.map((b) => (
          <ParticleBurst key={b.id} x={b.x} y={b.y} colors={b.colors} count={b.count} spread={b.spread} />
        ))}
      </div>
    </>
  );
}
