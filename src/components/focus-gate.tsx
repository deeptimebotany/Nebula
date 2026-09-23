"use client";

// Mode focus (Lot 3, activé par défaut — voir User.focusMode et
// bootstrap-provider.tsx) : tant qu'il est actif, ni les easter eggs
// ambiants (messages « Toujours là ? », étoiles filantes de minuit, code
// Konami…) ni les toasts « succès débloqué » ne sont montés. Les découvertes
// faites par ailleurs (double-clic sur l'avatar, appui long sur le logo…)
// restent enregistrées et visibles sur la page Succès. Se désactive dans
// Paramètres → Apparence & Succès, ou depuis la palette Cmd/Ctrl+K.
import { useFocusMode } from "@/components/bootstrap-provider";
import { EasterEggs } from "@/components/easter-eggs";
import { AchievementToastListener } from "@/components/achievement-toast-listener";

export function FocusGate() {
  const { focusMode, loaded } = useFocusMode();
  if (!loaded || focusMode) return null;
  return (
    <>
      <EasterEggs />
      <AchievementToastListener />
    </>
  );
}
