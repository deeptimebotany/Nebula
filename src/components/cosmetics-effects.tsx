"use client";

// Effets globaux des cosmétiques (voir src/lib/cosmetics.ts) qui doivent
// s'appliquer PARTOUT dans le tableau de bord : montés une seule fois dans
// le layout (dashboard), plutôt que dupliqués page par page. Les
// cosmétiques propres à une seule page (constellation-calendrier,
// ciel-nocturne-composer, papier-peint-succes) restent câblés directement
// dans leur page (voir decor-overlay.tsx), et "Poussière d'étoiles" vit dans
// sidebar.tsx (voir sidebar-shooting-stars.tsx).
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

  return null;
}
