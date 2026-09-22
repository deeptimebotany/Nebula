"use client";

// Effets globaux des cosmétiques (voir src/lib/cosmetics.ts) qui doivent
// s'appliquer PARTOUT dans le tableau de bord : montés une seule fois dans
// le layout (dashboard), plutôt que dupliqués page par page. Le seul
// cosmétique propre à une seule page qui reste, "papier-peint-succes",
// est câblé directement dans sa page (voir decor-overlay.tsx) —
// "constellation-calendrier" et "ciel-nocturne-composer" ont été retirés
// entièrement. "Poussière d'étoiles" vit dans sidebar.tsx (voir
// sidebar-shooting-stars.tsx), et "Icône rétro" a lui aussi été retiré
// entièrement (catalogue ET easter egg associé, voir easter-eggs-registry.ts).
//
// Ce fichier contenait aussi les effets "Curseur" (comète/étoile filante),
// "Clic" (étincelles/étoile explosive/survol comète) et "Traversée
// d'étoiles" (transitions) — supprimés entièrement à la demande explicite,
// avec tout le système de particules qu'ils partageaient (ParticleBurst).
// C'est ce système, déclenché à la fois par les clics et par les
// changements de page, qui provoquait le bug rapporté de particules
// apparaissant parfois deux fois au lieu d'une : sa suppression complète
// règle donc ce bug en même temps que le nettoyage demandé, plutôt que
// d'en corriger la cause séparément.

import { useEffect } from "react";
import { useCosmetics } from "@/components/cosmetics-provider";

export function CosmeticsEffects() {
  const cosmetics = useCosmetics();

  const hasCosmicFont = cosmetics.has("police-cosmique");

  // "Police Cosmique" — un simple attribut sur <html>, lu par globals.css
  // (voir aussi topnav.tsx : les titres d'onglets de la barre du haut
  // portent la classe "font-display" pour être concernés eux aussi).
  useEffect(() => {
    if (hasCosmicFont) document.documentElement.setAttribute("data-cosmic-font", "1");
    else document.documentElement.removeAttribute("data-cosmic-font");
  }, [hasCosmicFont]);

  return null;
}
