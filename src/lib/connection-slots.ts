// Décompte des comptes connectés pour les quotas, sans dépendance serveur :
// importable depuis un composant client (fenêtre « Trop de comptes
// connectés », page « Choisir ce que je garde », page Comptes). Déplacé de
// plan.ts le 09/10/2026 ; plan.ts le réexporte.
//
// Un compte connecté = un compte, quel que soit le réseau (09/10/2026,
// demande de Lucas). Avant, Instagram et Facebook comptaient ensemble pour
// un seul compte (ils passaient par une seule connexion « Meta ») ; ils ont
// maintenant chacun leur bouton « Connecter », et une Page Facebook compte
// comme un compte Instagram, un compte TikTok…
//
// Correctif du lot 3 (qualité) : seuls Instagram, Facebook, TikTok et
// YouTube étaient comptés — Bluesky, Threads, Pinterest et LinkedIn
// échappaient au quota de comptes connectés. Bug trouvé par le premier test
// automatique écrit pour cette fonction (tests/quality/plan.test.ts).
export function connectionSlotsFor(networks: string[]): number {
  return networks.length;
}
