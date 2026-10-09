// Durées des règles de YouTube sur les données (09/10/2026), sans dépendance :
// importable par le client YouTube (youtube.ts) comme par la tâche du cron
// (youtube-data-policy.ts), sans import circulaire.
export const DAY_MS = 86_400_000;
/** Durée maximale de conservation sans actualisation (règle III.E.4). */
export const YOUTUBE_DATA_MAX_DAYS = 30;

/** true si ce commentaire YouTube a plus de 30 jours : ni enregistré, ni gardé. */
export function isStaleYoutubeComment(publishedAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  return Number.isFinite(t) && t < now.getTime() - YOUTUBE_DATA_MAX_DAYS * DAY_MS;
}
