// Audit « YouTube API Services » (09/10/2026). Google a validé l'écran
// d'autorisation de Nebula, mais tant que YouTube n'a pas aussi validé
// l'audit de l'application (formulaire « YouTube API Services – Audit and
// Quota Extension »), toute vidéo envoyée par l'API arrive verrouillée en
// « Privée » sur YouTube, quel que soit le choix fait dans Publier. Publier
// le dit à côté du choix de confidentialité. Passer à false une fois
// l'audit validé.
export const YOUTUBE_UPLOADS_LOCKED_PRIVATE = true;

export const YOUTUBE_PRIVATE_LOCK_NOTE =
  "En attendant la validation de Nebula par YouTube, les vidéos envoyées arrivent en « Privée » : passez-les en public depuis YouTube Studio.";
