// Saisons des Réussites (v2, lot C) — importable client et serveur.
//
// Badge de saison : réussir le défi du mois 2 fois dans les 3 mois d'une
// saison (hiver = décembre, janvier, février ; printemps = mars à mai ;
// été = juin à août ; automne = septembre à novembre). Il ne se gagne que
// pendant la saison : c'est ce qui le rend rare. Enregistré comme un défi
// réussi (ChallengeCompletion kind « SEASON », période = id de la saison).

export const SEASON_XP = 80;
/** Défis du mois à réussir dans la saison. */
export const SEASON_TARGET = 2;

export type SeasonName = "hiver" | "printemps" | "ete" | "automne";

export interface Season {
  /** « 2026-automne » ; l'hiver porte l'année de son mois de décembre (« 2026-hiver »). */
  id: string;
  name: SeasonName;
  /** « Automne 2026 », « Hiver 2026-2027 ». */
  label: string;
  emoji: string;
  /** Les 3 mois, « 2026-09 »… */
  months: string[];
}

const LABELS: Record<SeasonName, { label: string; emoji: string }> = {
  hiver: { label: "Hiver", emoji: "❄️" },
  printemps: { label: "Printemps", emoji: "🌱" },
  ete: { label: "Été", emoji: "☀️" },
  automne: { label: "Automne", emoji: "🍂" }
};

const pad = (m: number) => String(m).padStart(2, "0");

/** Saison d'un mois « AAAA-MM ». */
export function seasonOfMonth(monthId: string): Season {
  const [y, m] = monthId.split("-").map(Number);
  let name: SeasonName;
  let startYear = y;
  let startMonth: number;
  if (m === 12 || m <= 2) {
    name = "hiver";
    startYear = m === 12 ? y : y - 1;
    startMonth = 12;
  } else if (m <= 5) {
    name = "printemps";
    startMonth = 3;
  } else if (m <= 8) {
    name = "ete";
    startMonth = 6;
  } else {
    name = "automne";
    startMonth = 9;
  }
  const months: string[] = [];
  for (let i = 0; i < 3; i++) {
    const mm = ((startMonth - 1 + i) % 12) + 1;
    const yy = startYear + Math.floor((startMonth - 1 + i) / 12);
    months.push(`${yy}-${pad(mm)}`);
  }
  const { label, emoji } = LABELS[name];
  return { id: `${startYear}-${name}`, name, label: name === "hiver" ? `${label} ${startYear}-${startYear + 1}` : `${label} ${startYear}`, emoji, months };
}

/** Saison à partir de son id (« 2026-automne »), ou null. */
export function seasonById(id: string): Season | null {
  const match = /^(\d{4})-(hiver|printemps|ete|automne)$/.exec(id);
  if (!match) return null;
  const first = { hiver: 12, printemps: 3, ete: 6, automne: 9 }[match[2] as SeasonName];
  return seasonOfMonth(`${match[1]}-${pad(first)}`);
}
