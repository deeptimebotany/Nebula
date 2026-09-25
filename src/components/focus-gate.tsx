"use client";

// Mode focus (Lot 3, activé par défaut — voir User.focusMode et
// bootstrap-provider.tsx) : tant qu'il est actif, ni les easter eggs
// ambiants (messages « Toujours là ? », étoiles filantes de minuit, code
// Konami…) ni les toasts « succès débloqué » ne sont montés. Les découvertes
// faites par ailleurs (double-clic sur l'avatar, appui long sur le logo…)
// restent enregistrées et visibles sur la page Réussites. Se désactive dans
// Paramètres → Apparence & Succès, ou depuis la palette Cmd/Ctrl+K.
//
// Les trois modules sont chargés à la demande (audit performance, lot 4) :
// en Mode focus, ils ne sont jamais téléchargés.
import dynamic from "next/dynamic";
import { useFocusMode } from "@/components/bootstrap-provider";

const EasterEggs = dynamic(() => import("@/components/easter-eggs").then((m) => m.EasterEggs), { ssr: false });
const AchievementToastListener = dynamic(
  () => import("@/components/achievement-toast-listener").then((m) => m.AchievementToastListener),
  { ssr: false }
);
const ReussitesCelebrationWatcher = dynamic(
  () => import("@/components/reussites/celebration-watcher").then((m) => m.ReussitesCelebrationWatcher),
  { ssr: false }
);

export function FocusGate() {
  const { focusMode, loaded } = useFocusMode();
  if (!loaded || focusMode) return null;
  return (
    <>
      <EasterEggs />
      <AchievementToastListener />
      <ReussitesCelebrationWatcher />
    </>
  );
}
