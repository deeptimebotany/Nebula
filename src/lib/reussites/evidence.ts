// Preuve d'un record de qualité (Réussites v3, 02/10/2026), gardée avec le
// palier gagné (AchievementUnlock.detail) : de quoi dessiner la carte à
// partager. Sans dépendance (serveur et pages).

export interface QualityEvidence {
  /** « 2,4× votre médiane de vues ». */
  headline: string;
  /** « 3 120 vues, pour une médiane de 1 300 ». */
  detail: string;
  title?: string | null;
  network?: string | null;
  permalink?: string | null;
  /** Date du relevé (ISO). */
  measuredAt: string;
}

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Lit une preuve enregistrée (JSON en base) ; null si absente ou illisible. */
export function parseEvidence(raw: unknown): QualityEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const headline = text(r.headline, 120);
  const detail = text(r.detail, 240);
  const measuredAt = text(r.measuredAt, 40);
  if (!headline || !detail || !measuredAt || Number.isNaN(new Date(measuredAt).getTime())) return null;
  const permalink = text(r.permalink, 500);
  return {
    headline,
    detail,
    title: text(r.title, 160),
    network: text(r.network, 20),
    // Lien vers la publication : seulement http(s).
    permalink: permalink && /^https?:\/\//i.test(permalink) ? permalink : null,
    measuredAt
  };
}
