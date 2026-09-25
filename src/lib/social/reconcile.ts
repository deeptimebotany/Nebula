// « Déjà en ligne ? » (lot 6, résilience des API).
//
// Quand on ne sait pas si un envoi a abouti — le réseau n'a pas répondu à
// temps, la connexion a été coupée, la fonction a été interrompue —,
// renvoyer la publication risque de la publier deux fois. Avant tout nouvel
// envoi de ce type, Nebula consulte les dernières publications du compte
// (client.listRecentPosts) et cherche la sienne :
//  - même texte (début de la légende, ou titre pour YouTube), sans tenir
//    compte de la casse, des accents ni des espaces ;
//  - publiée pendant l'envoi incertain (à 2 min près) ;
//  - pas déjà rattachée à une autre publication Nebula.
// Sans texte (média seul), on ne conclut que s'il y a exactement une
// publication dans la fenêtre.
import type { RecentPost } from "./base";

/** Marge autour de la fenêtre d'envoi (horloges, délai de mise en ligne). */
export const RECONCILE_MARGIN_MS = 2 * 60_000;
/** Longueur du début de texte comparé (les réseaux tronquent parfois). */
const COMPARE_CHARS = 40;
/** En dessous, un texte est trop court pour identifier une publication. */
const MIN_TEXT_CHARS = 8;

export function normalizeForMatch(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface MatchCriteria {
  /** Texte envoyé (légende, ou titre pour YouTube). */
  text: string | null | undefined;
  /** Début de l'envoi incertain. */
  since: Date;
  /** Fin de la fenêtre (en général : maintenant). */
  until: Date;
  /** Publications déjà rattachées à d'autres publications Nebula. */
  excludeIds?: Iterable<string>;
}

export function matchRecentPost(candidates: RecentPost[], criteria: MatchCriteria): RecentPost | null {
  const excluded = new Set(criteria.excludeIds ?? []);
  const from = criteria.since.getTime() - RECONCILE_MARGIN_MS;
  const to = criteria.until.getTime() + RECONCILE_MARGIN_MS;
  const inWindow = candidates.filter((c) => {
    if (excluded.has(c.externalPostId)) return false;
    // Sans date, on ne peut pas savoir si c'est la nôtre.
    if (!c.publishedAt) return false;
    const t = c.publishedAt.getTime();
    return t >= from && t <= to;
  });
  const wanted = normalizeForMatch(criteria.text);
  if (wanted.length < MIN_TEXT_CHARS) return inWindow.length === 1 ? inWindow[0] : null;
  const head = wanted.slice(0, COMPARE_CHARS);
  const matches = inWindow.filter((c) => {
    const got = normalizeForMatch(c.text);
    if (got.length < MIN_TEXT_CHARS) return false;
    return got.startsWith(head) || head.startsWith(got.slice(0, COMPARE_CHARS));
  });
  // Deux publications identiques dans la même minute : impossible de choisir.
  return matches.length === 1 ? matches[0] : null;
}
