// Meilleur moment pour publier : créneaux d'ordres de grandeur par réseau,
// partagés par l'outil public et l'outil de l'application. Sans IA.
import type { ToolNetwork } from "@/lib/tools/app-context-shared";

// Créneaux (heure de Paris) qui ressortent le plus souvent des études
// publiques annuelles (Sprout Social, Hootsuite, Buffer) relevées en
// septembre 2026 — moyennes générales, toutes audiences confondues.
export const BEST_TIME_SOURCE_DATE = "septembre 2026";
export const BEST_TIME_SLOTS: Record<ToolNetwork, { days: string; hours: number[]; note: string }[]> = {
  INSTAGRAM: [
    { days: "Lundi – vendredi", hours: [9, 12, 18], note: "Pause du matin, pause déjeuner, sortie du travail." },
    { days: "Samedi – dimanche", hours: [10, 19], note: "Matinées plus calmes, soirées engagées." }
  ],
  TIKTOK: [
    { days: "Mardi – jeudi", hours: [7, 12, 19, 22], note: "Le soir concentre le plus de temps de visionnage." },
    { days: "Vendredi – dimanche", hours: [11, 20], note: "Les week-ends favorisent les formats longs." }
  ],
  YOUTUBE: [
    { days: "Jeudi – samedi", hours: [15, 18], note: "Publier 2–3 h avant le pic de visionnage du soir." },
    { days: "Dimanche", hours: [11, 17], note: "Le dimanche reste le jour le plus regardé." }
  ],
  FACEBOOK: [
    { days: "Mardi – jeudi", hours: [9, 13], note: "Le matin en semaine, avant la pause déjeuner." },
    { days: "Samedi", hours: [12], note: "Le week-end, un seul créneau à la mi-journée." }
  ]
};

export const BEST_TIME_TIMEZONES = ["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "America/Montreal", "Africa/Casablanca", "Indian/Reunion", "America/Martinique", "Pacific/Noumea"];

/** Fuseaux proposés : la liste habituelle, plus celui de la marque s'il n'y est pas. */
export function timezoneChoices(extra?: string | null): string[] {
  return extra && !BEST_TIME_TIMEZONES.includes(extra) ? [extra, ...BEST_TIME_TIMEZONES] : BEST_TIME_TIMEZONES;
}

/** « 9 h », « 18 h ». */
export function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")} h`;
}
