// Événements de la visite guidée (lot U4), dans un module sans dépendance
// pour que l'intro et la palette ne chargent pas la visite elle-même.
export const TOUR_RESTART_EVENT = "nebula:tour-restart";
export const INTRO_DONE_EVENT = "nebula:intro-done";

/** Relance la visite (Paramètres, palette). */
export function restartGuidedTour(): void {
  window.dispatchEvent(new Event(TOUR_RESTART_EVENT));
}
