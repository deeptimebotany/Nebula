"use client";

// Petit décor de fond, réservé au cosmétique "papier-peint-succes" (voir
// src/lib/cosmetics.ts) — seul cosmétique de ce type restant, après le
// retrait de "constellation-calendrier" et "ciel-nocturne-composer".
// Contrairement aux effets globaux (cosmetics-effects.tsx), il n'a de sens
// que derrière le contenu d'une page précise, donc cette page (succes/page.tsx)
// le pose elle-même, juste avant son contenu, dans un parent `relative
// isolate` — le `isolate` n'est PAS optionnel : sans lui, le `-z-10` posé
// ci-dessous remonte jusqu'au contexte d'empilement de <main class="noise-grid">
// et se retrouve affiché derrière le fond d'écran de toute l'application
// (donc invisible) — voir le commentaire dans globals.css.
import { useCosmetics } from "@/components/cosmetics-provider";

export function CosmeticDecorOverlay({ cosmeticKey }: { cosmeticKey: string }) {
  const cosmetics = useCosmetics();
  if (!cosmetics.has(cosmeticKey)) return null;
  return (
    <div
      aria-hidden="true"
      className="nebula-decor-starfield pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
    />
  );
}
