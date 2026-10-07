// Durées et instants d'une vidéo, en français (serveur et navigateur).

/** « 2 min 14 s », « 45 s », « 3 min ». */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m === 0) return `${rest} s`;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

/** « 0:42 », « 12:05 ». */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
