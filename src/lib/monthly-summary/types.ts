// Bilan du mois (03/10/2026) : données d'un bilan, partagées par l'e-mail,
// la page « Bilan du mois » d'Analytics et les tests. Aucun import serveur.
//
// Les phrases (essentiel, ce qui a marché…) sont du texte brut où
// **double astérisque** marque le gras : chaque affichage échappe le texte
// puis transforme ces marques (e-mail, page) ou les retire (version texte).

export type ViewsKind = "daily" | "cumulative" | "rolling30" | "posts" | "none";

export interface SummaryAccount {
  id: string;
  network: string;
  name: string;
}

export interface FollowerRow {
  accountId: string;
  network: string;
  name: string;
  total: number;
  gain: number | null;
  /** Évolution en % sur le mois (null sans valeur de départ). */
  pct: number | null;
}

export interface ViewRow {
  accountId: string;
  network: string;
  name: string;
  kind: ViewsKind;
  total: number | null;
  share: number | null;
  /** Évolution en % par rapport au mois précédent. */
  pct: number | null;
}

export interface TopPost {
  title: string;
  network: string;
  accountName: string;
  dayIndex: number;
  dayLabel: string;
  views: number | null;
  interactions: number | null;
  /** Interactions ÷ vues, en %. */
  rate: number | null;
  url: string | null;
  thumbnailUrl: string | null;
}

export interface MonthlySummaryData {
  month: string;
  monthTitle: string;
  monthLabel: string;
  previousMonth: string;
  /** « août » */
  previousName: string;
  days: number;
  brand: { id: string; name: string; slug: string };
  accounts: SummaryAccount[];
  /** Aucune donnée le mois précédent : pas de comparaison. */
  firstReport: boolean;
  hasData: boolean;
  essentials: string[];
  followers: {
    total: number | null;
    gain: number | null;
    prevGain: number | null;
    /** Gain jour par jour (longueur = jours du mois), null sans relevés. */
    daily: number[] | null;
    bestDay: { dayIndex: number; label: string; gain: number } | null;
    rows: FollowerRow[];
  };
  views: {
    total: number | null;
    prevTotal: number | null;
    pct: number | null;
    daily: number[] | null;
    /** Réseaux comptés dans la courbe par jour. */
    dailyNetworks: string[];
    rows: ViewRow[];
    notes: string[];
  };
  interactions: {
    total: number | null;
    prevTotal: number | null;
    pct: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    /** Interactions ÷ vues des publications du mois, en %. */
    rate: number | null;
    prevRate: number | null;
    /** Phrase d'explication (taux, ce qui progresse le plus). */
    note: string | null;
  };
  publications: {
    /** Publications distinctes (une publication sur 3 réseaux compte une fois). */
    count: number;
    prevCount: number | null;
    /** Mises en ligne (une par réseau). */
    online: number;
    videos: number;
    photos: number;
    others: number;
    /** Jours (0 = le 1er) avec au moins une mise en ligne. */
    activeDays: number[];
    prevActiveDays: number | null;
    perNetwork: { network: string; count: number }[];
    viaNebula: number;
  };
  top: TopPost[];
  insights: string[];
  community: { comments: number; replies: number } | null;
  bio: { total: number; delta: number | null } | null;
  reussites: { xp: number; missions: number; badges: string[]; rank: string | null; nextRank: string | null; xpToNext: number | null } | null;
  nextMonth: { key: string; title: string; scheduled: number; days: number; daysInMonth: number; missing: number; suggestion: string | null };
  /** Encart « Allez plus loin avec Pro » : ni abonnement payant, ni accès offert. */
  upsell: boolean;
}

/** **gras** → segments, pour l'e-mail et la page. */
export function boldSegments(text: string): { text: string; bold: boolean }[] {
  return text.split("**").map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((s) => s.text.length > 0);
}

/** Texte sans les marques de gras (version texte de l'e-mail). */
export function plainText(text: string): string {
  return text.replace(/\*\*/g, "");
}
