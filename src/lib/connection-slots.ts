// Décompte des comptes connectés pour les quotas, sans dépendance serveur :
// importable depuis un composant client (fenêtre « Trop de comptes
// connectés », page « Choisir ce que je garde »). Déplacé de plan.ts le
// 09/10/2026 ; plan.ts le réexporte.
//
// Instagram et Facebook passent tous les deux par la connexion "Meta" et sont
// comptés comme UN SEUL "compte" pour les quotas (au lieu de 2), puisqu'on
// les connecte ensemble depuis la même page. Tous les autres réseaux
// comptent chacun pour un compte.
//
// Correctif du lot 3 (qualité) : seuls Instagram, Facebook, TikTok et
// YouTube étaient comptés — Bluesky, Threads, Pinterest et LinkedIn
// échappaient au quota de comptes connectés. Bug trouvé par le premier test
// automatique écrit pour cette fonction (tests/quality/plan.test.ts).
export function connectionSlotsFor(networks: string[]): number {
  const instagramCount = networks.filter((n) => n === "INSTAGRAM").length;
  const facebookCount = networks.filter((n) => n === "FACEBOOK").length;
  // Une connexion Meta ajoute généralement un compte Instagram ET une page
  // Facebook en même temps : on prend le plus grand des deux plutôt que
  // d'additionner, pour ne compter cette paire qu'une fois.
  const metaSlots = Math.max(instagramCount, facebookCount);
  const otherSlots = networks.filter((n) => n !== "INSTAGRAM" && n !== "FACEBOOK").length;
  return metaSlots + otherSlots;
}
