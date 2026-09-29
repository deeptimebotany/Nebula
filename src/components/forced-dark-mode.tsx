"use client";

// Pages au design propre (page bio, media kit, rapport client, calendrier
// partagé, approbation) : toujours affichées telles qu'elles ont été
// dessinées, quel que soit le mode clair/sombre du visiteur. Au chargement
// complet, le script de <head> s'en charge déjà (voir color-mode.ts) ; ce
// composant couvre l'arrivée par un lien interne (depuis le tableau de bord)
// et rend le mode précédent en quittant la page.
import { useLayoutEffect } from "react";

export function ForcedDarkMode() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.mode;
    root.dataset.mode = "dark";
    return () => {
      if (previous) root.dataset.mode = previous;
      else delete root.dataset.mode;
    };
  }, []);
  return null;
}
