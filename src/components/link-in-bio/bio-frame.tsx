"use client";

// Cadres animés de la page bio (voir src/lib/bio-frames.ts pour le
// catalogue et les règles de déblocage, globals.css → « Cadres de la page
// bio » pour les styles .bf-*). Utilisé par l'aperçu de l'éditeur
// (/link-in-bio) et par la vraie page publique (/l/[slug]), pour un rendu
// strictement identique.
//
// Les traînées lumineuses (Comète, Orbites, étincelle de la Couronne) sont
// des tirets SVG qui parcourent le contour de la carte : la taille réelle
// de la carte est mesurée (ResizeObserver) pour que le tracé colle au bord
// quelle que soit la hauteur du contenu. Animation en SMIL plutôt qu'en
// CSS : c'est la seule façon d'animer stroke-dashoffset partout (Safari
// compris) sans calcul côté script.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { clsx } from "@/lib/clsx";
import type { ResolvedFrame } from "@/lib/bio-frames";

interface Dash {
  // longueur du tiret, en % du contour
  l: number;
  // décalage de départ, en % du contour
  o?: number;
  color: string;
  width: number;
  opacity?: number;
  dur: number;
  reverse?: boolean;
}

const TRACES: Partial<Record<string, Dash[]>> = {
  "comete-or": [
    { l: 22, color: "#c99a2e", width: 1.5, opacity: 0.35, dur: 5 },
    { l: 10, color: "#f2cf6b", width: 1.8, opacity: 0.7, dur: 5 },
    { l: 2.5, color: "#fff4cc", width: 2.4, dur: 5 }
  ],
  "comete-eclipse": [
    { l: 28, color: "#6b5bd6", width: 2, opacity: 0.35, dur: 3.6 },
    { l: 12, color: "#c9c3ff", width: 2, opacity: 0.8, dur: 3.6 },
    { l: 3, color: "#ffffff", width: 2.6, dur: 3.6 },
    { l: 18, o: 50, color: "#b0304f", width: 1.5, opacity: 0.45, dur: 5.2, reverse: true },
    { l: 2, o: 50, color: "#ffb3c6", width: 2, dur: 5.2, reverse: true }
  ],
  "orbites-or": [
    { l: 6, color: "#f2cf6b", width: 1.5, opacity: 0.5, dur: 7 },
    { l: 0.8, color: "#fff4cc", width: 3, dur: 7 },
    { l: 6, o: 50, color: "#f2cf6b", width: 1.5, opacity: 0.5, dur: 7 },
    { l: 0.8, o: 50, color: "#fff4cc", width: 3, dur: 7 }
  ],
  "orbites-eclipse": [
    { l: 9, color: "#8e86ff", width: 2, opacity: 0.5, dur: 4.5 },
    { l: 0.8, color: "#ffffff", width: 3, dur: 4.5 },
    { l: 9, o: 33, color: "#8e86ff", width: 2, opacity: 0.5, dur: 4.5 },
    { l: 0.8, o: 33, color: "#ffffff", width: 3, dur: 4.5 },
    { l: 9, o: 66, color: "#8e86ff", width: 2, opacity: 0.5, dur: 4.5 },
    { l: 0.8, o: 66, color: "#ffffff", width: 3, dur: 4.5 },
    { l: 0.6, color: "#ff6b8e", width: 2.5, dur: 9, reverse: true }
  ],
  // « Carrefour » (Réussites) : deux traînées qui se croisent en sens
  // inverse, comme des flux qui se rejoignent.
  "carrefour-or": [
    { l: 16, color: "#c99a2e", width: 1.5, opacity: 0.4, dur: 6 },
    { l: 2.5, color: "#fff4cc", width: 2.4, dur: 6 },
    { l: 16, o: 50, color: "#53eadb", width: 1.5, opacity: 0.35, dur: 6, reverse: true },
    { l: 2.5, o: 50, color: "#d9fffb", width: 2.4, dur: 6, reverse: true }
  ],
  "carrefour-eclipse": [
    { l: 16, color: "#6b5bd6", width: 1.6, opacity: 0.45, dur: 6 },
    { l: 2.5, color: "#ffffff", width: 2.4, dur: 6 },
    { l: 16, o: 50, color: "#1fa89a", width: 1.6, opacity: 0.4, dur: 6, reverse: true },
    { l: 2.5, o: 50, color: "#c8fff8", width: 2.4, dur: 6, reverse: true }
  ],
  // « Astre » (Réussites) : un astre unique, très lent, au halo chaud.
  "astre-or": [
    { l: 7, color: "#f2cf6b", width: 2, opacity: 0.35, dur: 12 },
    { l: 0.5, color: "#fffbe8", width: 6, dur: 12 }
  ],
  "astre-eclipse": [
    { l: 7, color: "#ffc27a", width: 2, opacity: 0.35, dur: 12 },
    { l: 0.5, color: "#fff6e6", width: 6, dur: 12 }
  ],
  // « Anneau de diamant » : un seul point très lumineux qui fait le tour.
  "couronne-eclipse": [
    { l: 4, color: "#b9a8ff", width: 3, opacity: 0.45, dur: 6 },
    { l: 0.4, color: "#ffffff", width: 7, dur: 6 }
  ]
};

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function Trace({ dashes, w, h, r }: { dashes: Dash[]; w: number; h: number; r: number }) {
  return (
    <svg className="bf-layer bf-trace" width={w + 2} height={h + 2} viewBox={`0 0 ${w + 2} ${h + 2}`} aria-hidden="true">
      {dashes.map((d, i) => {
        // Tête du tiret alignée pour toutes les couches d'une même comète :
        // les tirets plus longs s'étirent vers l'arrière (traînée).
        const start = d.l + (d.o ?? 0);
        const from = d.reverse ? start - 100 : start;
        const to = d.reverse ? start : start - 100;
        return (
          <rect
            key={i}
            x={1}
            y={1}
            width={w}
            height={h}
            rx={r}
            pathLength={100}
            fill="none"
            stroke={d.color}
            strokeWidth={d.width}
            strokeLinecap="round"
            strokeDasharray={`${d.l} ${100 - d.l}`}
            strokeDashoffset={from}
            opacity={d.opacity ?? 1}
          >
            <animate attributeName="stroke-dashoffset" from={from} to={to} dur={`${d.dur}s`} repeatCount="indefinite" />
          </rect>
        );
      })}
    </svg>
  );
}

export function BioFrame({
  frame,
  radius = 32,
  className,
  cardClassName,
  cardStyle,
  children
}: {
  frame: ResolvedFrame | null;
  radius?: number;
  className?: string;
  cardClassName?: string;
  cardStyle?: CSSProperties;
  children: ReactNode;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const style = frame?.style;
  const flavor = frame?.flavor;
  const dashes = frame ? TRACES[`${style}-${flavor}`] : undefined;

  return (
    <div
      className={clsx("bf-root relative", frame && `bf-on bf-${style} bf-${flavor}`, className)}
      style={{ "--bf-r": `${radius}px` } as CSSProperties}
    >
      {/* Couches DERRIÈRE la carte */}
      {style === "halo" && flavor === "eclipse" && <span className="bf-layer bf-aura" aria-hidden="true" />}
      {style === "metal" && (
        <>
          <span className="bf-layer bf-foil bf-foil-glow" aria-hidden="true" />
          <span className="bf-layer bf-foil" aria-hidden="true" />
        </>
      )}
      {style === "nacre" && (
        <>
          <span className="bf-layer bf-opal bf-opal-glow" aria-hidden="true" />
          <span className="bf-layer bf-opal" aria-hidden="true" />
        </>
      )}
      {style === "prisme" && (
        <>
          <span className="bf-layer bf-ring bf-ring-glow" aria-hidden="true" />
          <span className="bf-layer bf-ring" aria-hidden="true" />
        </>
      )}
      {style === "astre" && <span className="bf-layer bf-astre-aura" aria-hidden="true" />}

      <div ref={ref} className={clsx("bf-card relative", cardClassName)} style={{ borderRadius: radius, ...cardStyle }}>
        {/* Couches DANS la carte (sous le contenu) */}
        {style === "metal" && <span className="bf-layer bf-sheen" aria-hidden="true" />}
        {style === "nacre" && <span className="bf-layer bf-pearl-sheen" aria-hidden="true" />}
        {style === "prisme" && <span className="bf-layer bf-holo" aria-hidden="true" />}
        {style === "couronne" && flavor === "or" && (
          <span className="bf-layer bf-dust" aria-hidden="true">
            {[12, 28, 47, 63, 80, 90].map((left, i) => (
              <i key={left} style={{ left: `${left}%`, animationDelay: `${i * 1.05}s`, animationDuration: `${6 + (i % 3)}s`, "--bf-x": `${i % 2 ? -8 : 10}px` } as CSSProperties} />
            ))}
          </span>
        )}
        {children}
      </div>

      {/* Couches DEVANT la carte */}
      {frame && <span className="bf-layer bf-edge" aria-hidden="true" />}
      {style === "halo" && flavor === "eclipse" && <span className="bf-layer bf-rim" aria-hidden="true" />}
      {dashes && size && <Trace dashes={dashes} w={size.w} h={size.h} r={radius} />}
      {style === "prisme" && (
        <>
          <span className="bf-layer bf-glint" style={{ left: -9, top: -9 }} aria-hidden="true" />
          <span className="bf-layer bf-glint" style={{ right: -9, top: "40%", animationDelay: "0.9s" }} aria-hidden="true" />
          <span className="bf-layer bf-glint" style={{ left: "30%", bottom: -9, animationDelay: "1.8s" }} aria-hidden="true" />
        </>
      )}
      {style === "astre" && <span className="bf-layer bf-glint bf-astre-glint" style={{ right: -9, top: -9 }} aria-hidden="true" />}
    </div>
  );
}

/** Habillage de la photo de profil, assorti au cadre de la carte. */
export function BioAvatarFrame({ frame, className, children }: { frame: ResolvedFrame | null; className?: string; children: ReactNode }) {
  if (!frame) return <>{children}</>;
  const { style } = frame;
  return (
    <div className={clsx("bf-avatar relative shrink-0 rounded-full", `bf-av-${style}`, className)}>
      {style === "metal" && <span className="bf-layer bf-av-foil" aria-hidden="true" />}
      {style === "prisme" && <span className="bf-layer bf-av-ring" aria-hidden="true" />}
      {style === "couronne" && (
        <>
          <span className="bf-layer bf-av-corona" aria-hidden="true" />
          <span className="bf-layer bf-av-corona-glow" aria-hidden="true" />
        </>
      )}
      {(style === "orbites" || style === "carrefour") && (
        <span className="bf-layer bf-av-orbit" aria-hidden="true">
          <i />
        </span>
      )}
      {style === "astre" && <span className="bf-layer bf-av-astre" aria-hidden="true" />}
      {children}
      {style === "comete" && <span className="bf-layer bf-av-sheen" aria-hidden="true" />}
    </div>
  );
}
