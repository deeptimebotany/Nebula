"use client";

// Envoie un événement de mesure (ex. `landing_view`) une fois la page
// affichée dans le navigateur — plutôt qu'au rendu serveur, qui compterait
// aussi les robots et les préchargements.
import { useEffect } from "react";
import { trackGrowthEvent } from "@/lib/growth-client";

export function TrackView({ name, meta }: { name: string; meta?: Record<string, string | number | boolean> }) {
  useEffect(() => {
    trackGrowthEvent(name, meta);
    // Une seule fois par affichage de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
