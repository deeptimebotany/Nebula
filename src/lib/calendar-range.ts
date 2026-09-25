// Mois à charger pour le calendrier (audit performance, lot 4) : au lieu de
// toutes les publications de la marque, seulement les mois visibles — la
// grille (6 semaines autour du mois affiché), le jour de la vue Heures et la
// bande du scrubber (6 semaines avant aujourd'hui, 8 après).

export type MonthKey = string; // "AAAA-MM"

export function monthKey(d: Date): MonthKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m - 1 };
}

/** Clés de mois de `start` à `end` inclus (dates locales). */
export function monthsBetween(start: Date, end: Date): MonthKey[] {
  const keys: MonthKey[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last && keys.length < 60) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function mondayOf(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

/** Mois nécessaires à l'affichage courant du calendrier. */
export function calendarMonthsNeeded({ cursor, agendaDay, today }: { cursor: Date; agendaDay: Date; today: Date }): MonthKey[] {
  const set = new Set<MonthKey>();
  // Grille du mois : du lundi précédant le 1er, sur 42 jours.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = mondayOf(first);
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + 41);
  monthsBetween(gridStart, gridEnd).forEach((k) => set.add(k));
  // Scrubber : 6 semaines avant la semaine en cours, 14 semaines en tout.
  const scrubStart = mondayOf(today);
  scrubStart.setDate(scrubStart.getDate() - 7 * 6);
  const scrubEnd = new Date(scrubStart);
  scrubEnd.setDate(scrubEnd.getDate() + 7 * 14 - 1);
  monthsBetween(scrubStart, scrubEnd).forEach((k) => set.add(k));
  set.add(monthKey(agendaDay));
  return Array.from(set).sort();
}

/**
 * Regroupe des mois consécutifs en périodes à demander au serveur, avec une
 * marge d'un jour de chaque côté : une publication à 00 h 30 le 1er (heure
 * de Paris) est encore la veille en UTC.
 */
export function monthKeysToRanges(keys: MonthKey[]): { from: Date; to: Date }[] {
  const sorted = Array.from(new Set(keys)).sort();
  const ranges: { from: Date; to: Date }[] = [];
  let startKey: MonthKey | null = null;
  let prev: { year: number; month: number } | null = null;
  const flush = (endKey: MonthKey) => {
    if (!startKey) return;
    const s = parseMonthKey(startKey);
    const e = parseMonthKey(endKey);
    ranges.push({ from: new Date(Date.UTC(s.year, s.month, 1) - 86_400_000), to: new Date(Date.UTC(e.year, e.month + 1, 1) + 86_400_000) });
  };
  let lastKey: MonthKey | null = null;
  for (const key of sorted) {
    const cur = parseMonthKey(key);
    const contiguous = prev && (cur.year * 12 + cur.month) - (prev.year * 12 + prev.month) === 1;
    if (!contiguous) {
      if (lastKey) flush(lastKey);
      startKey = key;
    }
    prev = cur;
    lastKey = key;
  }
  if (lastKey) flush(lastKey);
  return ranges;
}
