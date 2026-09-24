// Garde-fou « pas de programmation dans le passé » (24/09/2026), partagé
// par les routes qui enregistrent une date de publication : création
// (POST /api/posts), modification / déplacement dans le calendrier
// (PATCH /api/posts/[id]) et import CSV (/api/posts/import). Le sélecteur de
// date (components/ui/date-time-picker.tsx) grise déjà le passé ; cette
// vérification serveur couvre tout le reste (page restée ouverte, requête
// forgée, horloge de l'appareil déréglée).

/** Tolérance pour les petits écarts d'horloge entre l'appareil et le serveur. */
const GRACE_MS = 60_000;

export const PAST_SCHEDULE_ERROR = "Cet horaire est déjà passé : choisissez une date et une heure à venir.";

export function isPastSchedule(date: Date, now: number = Date.now()): boolean {
  return date.getTime() < now - GRACE_MS;
}
