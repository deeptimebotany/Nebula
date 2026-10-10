// Aller à un bloc de la page Réussites depuis un autre onglet (10/10/2026,
// retour de Lucas : « Faire mon bilan » ne faisait rien). Les étoiles et
// leurs leçons sont dans l'onglet Compétences, le bilan de la semaine dans
// l'onglet Missions : chaque onglet n'est rendu que s'il est ouvert, donc
// un simple défilement vers #bilan ne trouvait rien. La page écoute cet
// événement, ouvre le bon onglet puis fait défiler et met le bloc en
// surbrillance (goTo, page Réussites).
export const REUSSITES_GOTO_EVENT = "nebula:reussites-goto";

/** Ouvre l'onglet qui contient le bloc `id` (ex. « bilan ») et y fait défiler. */
export function goToInReussites(id: string) {
  window.dispatchEvent(new CustomEvent<string>(REUSSITES_GOTO_EVENT, { detail: id }));
}
