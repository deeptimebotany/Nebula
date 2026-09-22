"use client";

// Écoute l'événement "nebula:achievement" diffusé par reportEasterEggFound()
// (voir src/lib/report-easter-egg.ts) et affiche un toast dédié — distinct du
// message propre à chaque easter egg (confettis, etc.), c'est la couche
// "succès débloqué" au-dessus. Ne rend rien à l'écran par lui-même.

import { useEffect } from "react";
import { useToast } from "@/components/dashboard/toast";
import type { EasterEggUnlockedDetail } from "@/lib/report-easter-egg";

export function AchievementToastListener() {
  const toast = useToast();

  useEffect(() => {
    function onAchievement(e: Event) {
      const detail = (e as CustomEvent<EasterEggUnlockedDetail>).detail;
      if (!detail) return;
      toast.success(`🏆 Succès débloqué : ${detail.emoji} ${detail.title}`);
    }
    window.addEventListener("nebula:achievement", onAchievement);
    return () => window.removeEventListener("nebula:achievement", onAchievement);
  }, [toast]);

  return null;
}
