"use client";

// Cosmétique "Poussière d'étoiles (menu latéral)" (voir src/lib/cosmetics.ts) :
// une vraie petite pluie d'étoiles filantes, chacune avec sa propre
// position, sa propre longueur et sa propre vitesse tirées au hasard une
// seule fois au montage (useMemo, jamais recalculées ensuite) — pour éviter
// le rendu en grille bien symétrique de l'ancien fond `.nebula-decor-starfield`
// (un simple motif radial répété à intervalle fixe). Posé dans <aside>, qui
// a déjà son propre "z-50" (donc son propre contexte d'empilement) : pas
// besoin d'un `isolate` supplémentaire ici, contrairement aux décors de page
// (voir decor-overlay.tsx et globals.css).
import { useMemo } from "react";

interface Streak {
  id: number;
  top: number;
  left: number;
  length: number;
  delay: number;
  duration: number;
}

const STAR_COUNT = 8;

export function SidebarShootingStars() {
  const streaks = useMemo<Streak[]>(
    () =>
      Array.from({ length: STAR_COUNT }, (_, i) => ({
        id: i,
        top: Math.random() * 92,
        left: Math.random() * 75,
        length: 36 + Math.random() * 54,
        delay: Math.random() * 7,
        duration: 1.8 + Math.random() * 2.6
      })),
    []
  );

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {streaks.map((s) => (
        <span
          key={s.id}
          className="nebula-sidebar-shooting-star"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.length}px`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`
          }}
        />
      ))}
    </div>
  );
}
