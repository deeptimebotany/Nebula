// Ouverture du panneau « Mon profil » depuis n'importe quel composant.
//
// Fichier séparé du panneau lui-même (profile-panel.tsx), qui est chargé à
// la demande : importer openProfilePanel ne doit pas embarquer tout le
// panneau dans la page (audit performance, lot 4).

export type ProfileSection = "activity" | "badges" | "eggs" | "referral";

export const PROFILE_OPEN_EVENT = "nebula:open-profile";

/** Ouvre le panneau, éventuellement positionné sur une section. */
export function openProfilePanel(section?: ProfileSection) {
  window.dispatchEvent(new CustomEvent<ProfileSection | undefined>(PROFILE_OPEN_EVENT, { detail: section }));
}
