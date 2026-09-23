"use client";

// Décor de fond réservé au cosmétique « Voûte céleste » (papier-peint-succes,
// voir src/lib/cosmetics.ts), posé par succes/page.tsx dans un parent
// `relative isolate` — le `isolate` n'est PAS optionnel : sans lui, le
// `-z-10` posé ci-dessous remonte jusqu'au contexte d'empilement de
// <main class="noise-grid"> et se retrouve derrière le fond d'écran de
// l'application (donc invisible).
//
// Refonte du 24/09/2026 : l'ancienne version était une grille de points
// répétés en CSS (background-size 26 px), ce qui donnait « de simples
// points » alignés au lieu d'un ciel. Ici : une vraie voûte — trois arcs de
// nébulosités concentriques (violet, cyan, magenta) vus de dessous, un
// semis de ~170 étoiles placées de façon pseudo-aléatoire (générateur
// déterministe : même ciel à chaque visite), de tailles et d'éclats
// variés, qui scintillent chacune à leur rythme, et une poignée d'étoiles
// plus brillantes avec leur croix de diffraction. Tout en SVG + CSS,
// aucune boucle JavaScript.
import { useMemo } from "react";
import { useCosmetics } from "@/components/cosmetics-provider";

interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
  d: number; // délai d'animation (s)
  t: number; // durée (s)
  bright: boolean;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStars(count: number, seed: number): Star[] {
  const next = rng(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = next() * 1000;
    // Plus dense vers le haut (la voûte), plus clairsemé en bas.
    const y = Math.pow(next(), 1.6) * 600;
    const size = next();
    const bright = size > 0.965;
    stars.push({ x, y, r: bright ? 1.8 + next() * 1.2 : 0.5 + size * 1.1, o: 0.35 + next() * 0.6, d: next() * 6, t: 2.2 + next() * 4.5, bright });
  }
  return stars;
}

export function CosmeticDecorOverlay({ cosmeticKey }: { cosmeticKey: string }) {
  const cosmetics = useCosmetics();
  const stars = useMemo(() => makeStars(170, 20260924), []);
  if (!cosmetics.has(cosmeticKey)) return null;
  return (
    <div aria-hidden="true" className="nebula-vault pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl">
      {/* Arcs de nébulosités (CSS, voir globals.css .nebula-vault-*) */}
      <div className="nebula-vault-arc nebula-vault-arc-1" />
      <div className="nebula-vault-arc nebula-vault-arc-2" />
      <div className="nebula-vault-arc nebula-vault-arc-3" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMin slice">
        <defs>
          <radialGradient id="nv-star" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.55" stopColor="#dbe7ff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#8fb0ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {stars.map((s, i) =>
          s.bright ? (
            <g key={i} className="nebula-vault-star" style={{ animationDelay: `${s.d}s`, animationDuration: `${s.t}s` }}>
              <circle cx={s.x} cy={s.y} r={s.r * 3.2} fill="url(#nv-star)" opacity={0.55} />
              <circle cx={s.x} cy={s.y} r={s.r * 0.75} fill="#ffffff" />
              <path d={`M${s.x - s.r * 5},${s.y} L${s.x + s.r * 5},${s.y} M${s.x},${s.y - s.r * 5} L${s.x},${s.y + s.r * 5}`} stroke="#ffffff" strokeWidth="0.6" opacity="0.7" strokeLinecap="round" />
            </g>
          ) : (
            <circle key={i} className="nebula-vault-star" cx={s.x} cy={s.y} r={s.r} fill="#ffffff" opacity={s.o} style={{ animationDelay: `${s.d}s`, animationDuration: `${s.t}s` }} />
          )
        )}
        {/* Fine ligne d'horizon de la voûte */}
        <path d="M-50,560 Q500,-140 1050,560" fill="none" stroke="rgba(180,205,255,0.16)" strokeWidth="1" />
      </svg>
    </div>
  );
}
