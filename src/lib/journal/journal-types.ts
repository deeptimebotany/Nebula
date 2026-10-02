// Journal des mises à jour (02/10/2026) : types partagés par les données,
// la page /admin/journal et les tests.

export const JOURNAL_CATEGORIES = [
  "Publication",
  "Calendrier",
  "Analytics",
  "Réussites",
  "Communauté",
  "Outils",
  "IA",
  "Page bio et media kit",
  "Site public",
  "Compte et facturation",
  "Sécurité",
  "Fiabilité",
  "Performance",
  "Administration",
  "Interface"
] as const;

export type JournalCategory = (typeof JOURNAL_CATEGORIES)[number];

export interface JournalLink {
  /** Chemin interne d'une page qui existe (un ?onglet= ou un #ancre est permis). */
  href: string;
  label: string;
}

export interface JournalEntry {
  /** « AAAA-MM-JJ-titre-court », unique. */
  id: string;
  /** Date de la mise à jour (AAAA-MM-JJ). */
  date: string;
  title: string;
  category: JournalCategory;
  /** Pages concernées (1 à 4). */
  links: JournalLink[];
  /** Ce que l'utilisateur (ou le propriétaire) constate maintenant. */
  result: string;
  /** Ce qui a été modifié dans le site pour y arriver. */
  change: string;
  /** Numéro de l'élément de la section 4 du README, s'il y en a un. */
  readme?: number;
  /** Migrations de la base créées par cette mise à jour. */
  migrations: string[];
}
