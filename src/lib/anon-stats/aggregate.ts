// Statistiques de groupe anonymes (29/09/2026) — calcul PUR, sans base de
// données (testé dans tests/quality/anon-stats.test.ts).
//
// Règles fixées avec Lucas :
//  1. Sources séparées : uniquement des données PROPRES à Nebula — ce que
//     les comptes font dans Nebula (réseaux visés, créneaux et formats
//     programmés, longueur des textes, fonctions utilisées). Jamais les
//     données reçues des API des réseaux (vues, abonnés, commentaires…),
//     que les conditions de YouTube, Meta et TikTok interdisent de revendre
//     ou d'agréger.
//  2. Anonymat strict : aucune donnée individuelle, seulement des chiffres de
//     groupe ; une valeur n'existe que si au moins ANON_MIN_ACCOUNTS comptes
//     différents y contribuent. Dans un groupe de parts (qui font 100 %),
//     une case masquée seule serait devinable par soustraction : on en masque
//     alors une seconde (la plus petite).
//  3. Accord explicite : seuls les comptes qui ont coché la case facultative
//     sont lus (voir load.ts) — rien ici ne sait qui ils sont : les lignes
//     arrivent avec un identifiant de propriétaire opaque, qui ne sort jamais.

export const ANON_MIN_ACCOUNTS = 20;

export type AnonFormat = "VIDEO" | "IMAGE" | "TEXT";

/** Une publication programmée d'un compte qui a donné son accord. */
export interface AnonPostRow {
  /** Identifiant opaque du compte propriétaire (sert seulement à compter les comptes). */
  owner: string;
  networks: string[];
  /** Jour local de la marque : 0 = lundi … 6 = dimanche. */
  weekday: number;
  /** Heure locale de la marque (0–23). */
  hour: number;
  format: AnonFormat;
  captionLength: number;
  hashtagCount: number;
}

/** Fonctions de Nebula utilisées par un compte (au moins une de ses marques). */
export interface AnonAccountRow {
  owner: string;
  features: Record<AnonFeature, boolean>;
}

export const ANON_FEATURES = ["page_bio", "media_kit", "studio_ia", "rapports_clients", "calendrier_partage"] as const;
export type AnonFeature = (typeof ANON_FEATURES)[number];

export interface AnonCell {
  metric: string;
  dimension: string;
  value: number;
  sampleAccounts: number;
  sampleItems: number;
}

export const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

/** Tranches horaires des créneaux (heure locale). */
export function hourBand(hour: number): string {
  if (hour < 6) return "0-6h";
  if (hour < 9) return "6-9h";
  if (hour < 12) return "9-12h";
  if (hour < 15) return "12-15h";
  if (hour < 18) return "15-18h";
  if (hour < 21) return "18-21h";
  return "21-24h";
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

interface Bucket {
  owners: Set<string>;
  items: number;
}

function bucket(map: Map<string, Bucket>, key: string, owner: string, items = 1): void {
  const b = map.get(key) ?? { owners: new Set<string>(), items: 0 };
  b.owners.add(owner);
  b.items += items;
  map.set(key, b);
}

/**
 * Parts (en %) d'un groupe de cases qui font 100 %, avec masquage des cases
 * sous le seuil (et masquage secondaire si une seule case est masquée).
 */
function shareCells(metric: string, buckets: Map<string, Bucket>, total: number, min: number): AnonCell[] {
  if (total <= 0) return [];
  const entries = [...buckets.entries()];
  const hidden = new Set(entries.filter(([, b]) => b.owners.size < min).map(([k]) => k));
  if (hidden.size === 1) {
    const visible = entries.filter(([k]) => !hidden.has(k)).sort((a, b) => a[1].owners.size - b[1].owners.size || a[1].items - b[1].items);
    if (visible.length) hidden.add(visible[0][0]);
  }
  return entries
    .filter(([k]) => !hidden.has(k))
    .map(([dimension, b]) => ({ metric, dimension, value: round1((b.items / total) * 100), sampleAccounts: b.owners.size, sampleItems: b.items }));
}

export function aggregateAnonStats(posts: AnonPostRow[], accounts: AnonAccountRow[], min = ANON_MIN_ACCOUNTS): AnonCell[] {
  const cells: AnonCell[] = [];
  const postOwners = new Set(posts.map((p) => p.owner));

  if (postOwners.size >= min) {
    // Réseaux visés (part des envois programmés).
    const byNetwork = new Map<string, Bucket>();
    let targets = 0;
    for (const p of posts) {
      for (const n of p.networks) {
        bucket(byNetwork, n, p.owner);
        targets += 1;
      }
    }
    cells.push(...shareCells("publications.reseau", byNetwork, targets, min));

    // Créneaux (jour × tranche horaire, heure locale de la marque).
    const bySlot = new Map<string, Bucket>();
    for (const p of posts) bucket(bySlot, `${WEEKDAYS[p.weekday] ?? "?"}|${hourBand(p.hour)}`, p.owner);
    cells.push(...shareCells("publications.creneau", bySlot, posts.length, min));

    // Formats, réseau par réseau (parts au sein du réseau).
    const networks = [...new Set(posts.flatMap((p) => p.networks))];
    for (const network of networks) {
      const onNetwork = posts.filter((p) => p.networks.includes(network));
      const netOwners = new Set(onNetwork.map((p) => p.owner));
      if (netOwners.size < min) continue;
      const byFormat = new Map<string, Bucket>();
      for (const p of onNetwork) bucket(byFormat, `${network}|${p.format}`, p.owner);
      cells.push(...shareCells("publications.format", byFormat, onNetwork.length, min));

      // Longueur du texte et nombre de hashtags : médiane par réseau.
      cells.push({ metric: "publications.longueur_texte_mediane", dimension: network, value: round1(median(onNetwork.map((p) => p.captionLength))), sampleAccounts: netOwners.size, sampleItems: onNetwork.length });
      cells.push({ metric: "publications.hashtags_median", dimension: network, value: round1(median(onNetwork.map((p) => p.hashtagCount))), sampleAccounts: netOwners.size, sampleItems: onNetwork.length });
    }

    // Rythme : publications programmées par compte (médiane).
    const perOwner = new Map<string, number>();
    for (const p of posts) perOwner.set(p.owner, (perOwner.get(p.owner) ?? 0) + 1);
    cells.push({ metric: "publications.par_compte_mediane", dimension: "", value: round1(median([...perOwner.values()])), sampleAccounts: perOwner.size, sampleItems: posts.length });
  }

  // Fonctions utilisées (part des comptes qui ont donné leur accord).
  const owners = new Map(accounts.map((a) => [a.owner, a]));
  if (owners.size >= min) {
    for (const feature of ANON_FEATURES) {
      const users = [...owners.values()].filter((a) => a.features[feature]).length;
      cells.push({ metric: "fonctions.adoption", dimension: feature, value: round1((users / owners.size) * 100), sampleAccounts: owners.size, sampleItems: users });
    }
  }
  return cells;
}

/** Nombre de hashtags d'un texte. */
export function countHashtags(text: string): number {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

/** Libellés lisibles (page d'administration, export). */
export const METRIC_LABELS: Record<string, string> = {
  "publications.reseau": "Réseaux visés (% des envois programmés)",
  "publications.creneau": "Créneaux programmés (% des publications, heure locale)",
  "publications.format": "Formats par réseau (% des envois du réseau)",
  "publications.longueur_texte_mediane": "Longueur médiane du texte (caractères)",
  "publications.hashtags_median": "Hashtags par publication (médiane)",
  "publications.par_compte_mediane": "Publications programmées par compte et par mois (médiane)",
  "fonctions.adoption": "Fonctions utilisées (% des comptes)"
};

export const FEATURE_LABELS: Record<AnonFeature, string> = {
  page_bio: "Page bio publiée",
  media_kit: "Media kit publié",
  studio_ia: "Studio IA utilisé dans le mois",
  rapports_clients: "Rapports clients activés",
  calendrier_partage: "Calendrier partagé activé"
};
