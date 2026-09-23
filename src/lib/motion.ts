// Préférence système « réduire les animations » (Lot 5). Les animations CSS
// sont déjà neutralisées globalement dans globals.css ; ce test sert aux
// boucles requestAnimationFrame (fond étoilé, poussière d'étoiles du menu),
// qui doivent alors dessiner une image fixe au lieu de tourner en continu.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
