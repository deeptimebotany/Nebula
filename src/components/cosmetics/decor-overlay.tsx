"use client";

// Petit décor de fond, réservé à une seule page, pour les cosmétiques
// "constellation-calendrier", "ciel-nocturne-composer" et "papier-peint-succes"
// (voir src/lib/cosmetics.ts). Contrairement aux effets globaux
// (cosmetics-effects.tsx), ceux-ci n'ont de sens que derrière le contenu
// d'une page précise, donc chaque page les pose elle-même, juste avant son
// contenu, dans un parent `relative isolate` — le `isolate` n'est PAS
// optionnel : sans lui, le `-z-10` posé ci-dessous remonte jusqu'au
// contexte d'empilement de <main class="noise-grid"> et se retrouve
// affiché derrière le fond d'écran de toute l'application (donc
// invisible) — voir le commentaire dans globals.css.
import { useCosmetics } from "@/components/cosmetics-provider";

export function CosmeticDecorOverlay({
  cosmeticKey,
  variant
}: {
  cosmeticKey: string;
  variant: "constellation" | "starfield";
}) {
  const cosmetics = useCosmetics();
  if (!cosmetics.has(cosmeticKey)) return null;
  return (
    <div
      aria-hidden="true"
      className={
        variant === "constellation"
          ? "nebula-decor-constellation pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
          : "nebula-decor-starfield pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
      }
    />
  );
}
