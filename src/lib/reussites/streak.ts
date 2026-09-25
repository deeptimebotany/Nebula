// Série de semaines et boucliers (Réussites v2, 26/09/2026) — calculs purs,
// importables côté client et serveur.
//
// Une semaine est « active » dès qu'une publication est réellement en ligne
// (heure de Paris). Une semaine « protégée » par un bouclier compte comme
// active pour la série. Règles :
//  - la semaine en cours ne casse jamais la série tant qu'elle n'est pas
//    finie ;
//  - un bouclier se gagne toutes les 4 semaines de série (2 au maximum en
//    réserve) ;
//  - les boucliers ne servent que s'ils sauvent vraiment la série : toutes
//    les semaines manquées depuis la dernière semaine active doivent pouvoir
//    être couvertes, et la série sauvée doit compter au moins 2 semaines ;
//  - la meilleure série reste acquise pour toujours.

export interface StreakInfo {
  /** Série en cours (semaines actives ou protégées d'affilée). */
  current: number;
  /** Meilleure série de toujours. */
  best: number;
  /** Dernière semaine de la série en cours (null si aucune). */
  end: number | null;
}

function runEndingAt(covered: Set<number>, end: number): number {
  let n = 0;
  for (let w = end; covered.has(w); w--) n++;
  return n;
}

export function streakOf(covered: Set<number>, currentWeek: number): StreakInfo {
  const end = covered.has(currentWeek) ? currentWeek : covered.has(currentWeek - 1) ? currentWeek - 1 : null;
  const current = end === null ? 0 : runEndingAt(covered, end);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of Array.from(covered).sort((a, b) => a - b)) {
    run = prev !== null && w === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return { current, best, end };
}

/**
 * Semaines à protéger maintenant (boucliers à dépenser), ou [] : les
 * semaines terminées manquées juste avant la semaine en cours, si le solde
 * les couvre toutes et que la série sauvée compte au moins 2 semaines.
 */
export function shieldsToUse(covered: Set<number>, currentWeek: number, balance: number): number[] {
  if (balance <= 0 || covered.size === 0) return [];
  const first = Math.min(...Array.from(covered));
  const missed: number[] = [];
  let w = currentWeek - 1;
  while (w >= first && !covered.has(w)) {
    missed.push(w);
    w--;
  }
  if (missed.length === 0 || w < first) return [];
  if (missed.length > balance) return [];
  if (runEndingAt(covered, w) < 2) return [];
  return missed.sort((a, b) => a - b);
}

/**
 * Bouclier à gagner pour la série en cours (clé unique du gain), ou null :
 * à chaque multiple de 4 semaines, tant que la réserve n'est pas pleine.
 */
export function shieldToGrant(covered: Set<number>, currentWeek: number, balance: number, max: number): string | null {
  if (balance >= max) return null;
  const { current, end } = streakOf(covered, currentWeek);
  if (end === null || current < 4) return null;
  const milestone = Math.floor(current / 4) * 4;
  const start = end - current + 1;
  return `streak:${start}:${milestone}`;
}
