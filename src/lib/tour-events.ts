// Événements de la visite guidée (lot U4), dans un module sans dépendance
// pour que l'intro et la palette ne chargent pas la visite elle-même.
export const TOUR_RESTART_EVENT = "nebula:tour-restart";
export const INTRO_DONE_EVENT = "nebula:intro-done";

/** Nombre d'étapes de la visite (7 depuis le 06/10/2026 : étape « Mode focus »). Vérifié par les tests contre TOUR_STEPS. */
export const TOUR_STEP_COUNT = 7;

/** Relance la visite (Paramètres, palette). */
export function restartGuidedTour(): void {
  window.dispatchEvent(new Event(TOUR_RESTART_EVENT));
}
