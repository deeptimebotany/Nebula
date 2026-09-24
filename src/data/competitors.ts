// Données des pages « alternative à » et « prix de » (brief growth, lot
// G5.a) : un objet par concurrent. Les prix ont été relevés sur le site
// officiel de chaque éditeur (ou, à défaut, sur sa documentation d'aide et
// deux analyses tierces 2026 concordantes — voir `sources`) à la date
// `verifiedAt`. Chaque page affiche « prix constatés le {date} sur le site
// de l'éditeur, susceptibles d'évoluer ». Noms utilisés à titre nominatif,
// aucun logo, aucune affirmation invérifiable : quand une information n'est
// pas publiée, elle est marquée `null` et la page dit « non publié ».
//
// Ce fichier est importé par des pages serveur ET par le calculateur
// d'économies (client) : aucun import de Prisma ou de "use client" ici.
// Les prix de Nebula, eux, viennent EXCLUSIVEMENT de src/lib/plans.ts.

import { PLAN_LIMITS, type Plan } from "@/lib/plans";

export type Currency = "EUR" | "USD";

/** Taux de conversion indicatif utilisé quand l'éditeur n'affiche que des
 * dollars : cours de référence BCE du 22 septembre 2026, 1 € = 1,1463 $. */
export const USD_TO_EUR = 0.87;
export const FX_NOTE = "Prix en dollars convertis au cours indicatif BCE du 22 septembre 2026 (1 € ≈ 1,15 $), hors taxes éventuelles.";

export type FeatureLevel = "yes" | "no" | "higher" | "addon" | "partial" | "unknown";

export interface CompetitorFeatures {
  calendar: FeatureLevel;
  clientReports: FeatureLevel;
  linkInBio: FeatureLevel;
  approval: FeatureLevel;
  analytics: FeatureLevel;
  ai: FeatureLevel;
}

export interface CompetitorPlanLine {
  name: string;
  /** Prix par mois en facturation ANNUELLE (devise `currency`). */
  monthlyAnnual: number | null;
  /** Prix par mois en facturation MENSUELLE, si publié. */
  monthlyMonthly: number | null;
  detail: string;
}

export interface CostInput {
  brands: number;
  accounts: number;
  users: number;
}

export interface CompetitorEstimate {
  /** Coût mensuel estimé en facturation annuelle, dans la devise de l'éditeur ; null = non publié / sur devis. */
  monthly: number | null;
  /** Comment le chiffre a été obtenu (une phrase). */
  how: string;
}

export interface Competitor {
  slug: string;
  name: string;
  website: string;
  pricingUrl: string;
  currency: Currency;
  /** Une phrase neutre pour décrire l'outil. */
  tagline: string;
  /** Prix d'entrée public par mois (facturation annuelle), devise `currency`. */
  entryMonthly: number | null;
  entryLabel: string;
  freePlan: string | null;
  plans: CompetitorPlanLine[];
  /** Ce qui n'est pas inclus dans le prix d'entrée (pour /prix/[slug]). */
  notIncluded: string[];
  networks: string[];
  features: CompetitorFeatures;
  /** Langue de l'interface et du support. */
  language: string;
  /** Estimation du coût pour un scénario donné (voir SavingsCalculator). */
  estimate: (input: CostInput) => CompetitorEstimate;
  verifiedAt: string; // AAAA-MM-JJ
  sources: string[];
}

// ---------------------------------------------------------------------------
// Nebula, calculée depuis plans.ts (jamais de valeur en dur ici)
// ---------------------------------------------------------------------------

export interface NebulaEstimate {
  plan: Plan;
  maxBrands: number;
  monthlyAnnual: number;
  monthlyMonthly: number;
  how: string;
}

/** Palier Nebula le moins cher qui couvre `brands` marques et `accounts`
 * comptes (répartis sur les marques) — les utilisateurs sont illimités. */
export function nebulaEstimate({ brands, accounts }: CostInput): NebulaEstimate {
  const perBrand = Math.ceil(Math.max(1, accounts) / Math.max(1, brands));
  const order: Plan[] = ["FREE", "PRO", "AGENCY"];
  for (const plan of order) {
    const limits = PLAN_LIMITS[plan];
    if (perBrand > limits.maxConnections) continue;
    const tier = limits.tiers.find((t) => t.maxBrands >= brands);
    if (!tier) continue;
    return {
      plan,
      maxBrands: tier.maxBrands,
      monthlyAnnual: tier.priceYearly / 12,
      monthlyMonthly: tier.priceMonthly,
      how: plan === "FREE" ? "Palier Gratuit : 1 marque, jusqu'à 4 comptes." : `${limits.label} jusqu'à ${tier.maxBrands} marques (${limits.maxConnections >= 9999 ? "comptes illimités" : `${limits.maxConnections} comptes par marque`}), utilisateurs illimités.`
    };
  }
  const top = PLAN_LIMITS.AGENCY.tiers[PLAN_LIMITS.AGENCY.tiers.length - 1];
  return { plan: "AGENCY", maxBrands: top.maxBrands, monthlyAnnual: top.priceYearly / 12, monthlyMonthly: top.priceMonthly, how: `Agence jusqu'à ${top.maxBrands} marques (au-delà : nous contacter).` };
}

/** Convertit dans la devise de l'éditeur vers l'euro. */
export function toEur(amount: number | null, currency: Currency): number | null {
  if (amount === null) return null;
  return currency === "EUR" ? amount : amount * USD_TO_EUR;
}

export function formatEur(amount: number, digits = 0): string {
  return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
}

export function formatPrice(amount: number | null, currency: Currency): string {
  if (amount === null) return "non publié";
  const n = amount.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "EUR" ? `${n} €` : `${n} $`;
}

export function formatVerifiedAt(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Concurrents
// ---------------------------------------------------------------------------

const VERIFIED = "2026-09-23";

export const COMPETITORS: Competitor[] = [
  {
    slug: "hootsuite",
    name: "Hootsuite",
    website: "https://www.hootsuite.com",
    pricingUrl: "https://www.hootsuite.com/plans",
    currency: "USD",
    tagline: "L'outil historique des grandes équipes marketing, facturé par utilisateur.",
    entryMonthly: 99,
    entryLabel: "Standard, 99 $ par utilisateur et par mois (facturation annuelle)",
    freePlan: null,
    plans: [
      { name: "Standard", monthlyAnnual: 99, monthlyMonthly: null, detail: "par utilisateur, jusqu'à 10 comptes" },
      { name: "Professional", monthlyAnnual: 199, monthlyMonthly: null, detail: "par utilisateur, comptes illimités" },
      { name: "Advanced", monthlyAnnual: 399, monthlyMonthly: null, detail: "par utilisateur, approbations et rapports avancés" },
      { name: "Enterprise", monthlyAnnual: null, monthlyMonthly: null, detail: "sur devis" }
    ],
    notIncluded: ["Le prix est par utilisateur : chaque collaborateur ajouté est facturé au même tarif.", "Rapports personnalisés et flux d'approbation réservés aux paliers supérieurs.", "Le tarif en facturation mensuelle n'est pas publié ; seul l'annuel est affiché.", "Pas de plan gratuit (essai de 14 jours)."],
    networks: ["Facebook", "Instagram", "LinkedIn", "X", "TikTok", "YouTube", "Threads", "Pinterest"],
    features: { calendar: "yes", clientReports: "higher", linkInBio: "no", approval: "higher", analytics: "yes", ai: "yes" },
    language: "Interface en français ; support principalement en anglais.",
    estimate: ({ accounts, users }) => {
      const perUser = accounts <= 10 ? 99 : 199;
      return { monthly: perUser * Math.max(1, users), how: `${accounts <= 10 ? "Standard" : "Professional"} à ${perUser} $ × ${Math.max(1, users)} utilisateur(s), facturation annuelle.` };
    },
    verifiedAt: VERIFIED,
    sources: ["https://www.hootsuite.com/plans"]
  },
  {
    slug: "buffer",
    name: "Buffer",
    website: "https://buffer.com",
    pricingUrl: "https://buffer.com/pricing",
    currency: "USD",
    tagline: "Un planificateur simple, facturé par canal connecté.",
    entryMonthly: 5,
    entryLabel: "Essentials, 5 $ par canal et par mois (facturation annuelle), 6 $ en mensuel",
    freePlan: "3 canaux, 10 publications en attente par canal, 1 utilisateur",
    plans: [
      { name: "Free", monthlyAnnual: 0, monthlyMonthly: 0, detail: "3 canaux" },
      { name: "Essentials", monthlyAnnual: 5, monthlyMonthly: 6, detail: "par canal, 1 utilisateur" },
      { name: "Team", monthlyAnnual: 10, monthlyMonthly: 12, detail: "par canal, utilisateurs illimités, approbations" }
    ],
    notIncluded: ["Le prix s'entend par canal : 8 comptes connectés = 8 fois le tarif.", "Plusieurs utilisateurs et flux d'approbation : palier Team, deux fois plus cher par canal.", "Pas de notion de marque ou d'espace client séparé."],
    networks: ["Instagram", "Facebook", "TikTok", "LinkedIn", "X", "YouTube", "Threads", "Pinterest", "Google Business Profile", "Bluesky", "Mastodon"],
    features: { calendar: "yes", clientReports: "yes", linkInBio: "yes", approval: "higher", analytics: "yes", ai: "yes" },
    language: "Interface en français ; support en anglais.",
    estimate: ({ accounts, users }) => {
      const rate = users > 1 ? 10 : 5;
      return { monthly: rate * Math.max(1, accounts), how: `${users > 1 ? "Team" : "Essentials"} à ${rate} $ × ${Math.max(1, accounts)} canaux, facturation annuelle.` };
    },
    verifiedAt: VERIFIED,
    sources: ["https://buffer.com/pricing"]
  },
  {
    slug: "later",
    name: "Later",
    website: "https://later.com",
    pricingUrl: "https://later.com/pricing/",
    currency: "USD",
    tagline: "Planificateur visuel orienté Instagram, facturé par « social set ».",
    entryMonthly: 18.75,
    entryLabel: "Starter, 18,75 $ par mois (facturation annuelle), 25 $ en mensuel",
    freePlan: null,
    plans: [
      { name: "Starter", monthlyAnnual: 18.75, monthlyMonthly: 25, detail: "1 social set, 1 utilisateur" },
      { name: "Growth", monthlyAnnual: 37.5, monthlyMonthly: 50, detail: "2 social sets, 2 utilisateurs ; set supplémentaire 11,25 $" },
      { name: "Scale", monthlyAnnual: 82.5, monthlyMonthly: 110, detail: "6 social sets, 4 utilisateurs" }
    ],
    notIncluded: ["Un « social set » = une marque : la troisième marque se paie en supplément.", "Approbations et options supplémentaires à partir de Growth seulement.", "Pas de rapport client partageable identifié.", "Pas de plan gratuit affiché (essai de 14 jours)."],
    networks: ["Instagram", "Facebook", "TikTok", "Threads", "YouTube", "Pinterest", "LinkedIn", "Snapchat"],
    features: { calendar: "yes", clientReports: "no", linkInBio: "yes", approval: "higher", analytics: "yes", ai: "yes" },
    language: "Interface en français (web) ; support en anglais.",
    estimate: ({ brands, accounts, users }) => {
      const sets = Math.max(brands, Math.ceil(accounts / 8), 1);
      if (sets <= 1 && users <= 1) return { monthly: 18.75, how: "Starter : 1 social set, 1 utilisateur, facturation annuelle." };
      const growth = 37.5 + Math.max(0, sets - 2) * 11.25 + Math.max(0, users - 2) * 3.75;
      const scale = 82.5 + Math.max(0, sets - 6) * 11.25 + Math.max(0, users - 4) * 3.75;
      const best = Math.min(growth, scale);
      return { monthly: best, how: best === growth ? `Growth (2 sets, 2 utilisateurs) + ${Math.max(0, sets - 2)} set(s) et ${Math.max(0, users - 2)} utilisateur(s) supplémentaires, facturation annuelle.` : `Scale (6 sets, 4 utilisateurs) + suppléments, facturation annuelle.` };
    },
    verifiedAt: VERIFIED,
    sources: ["https://later.com/pricing/"]
  },
  {
    slug: "metricool",
    name: "Metricool",
    website: "https://metricool.com",
    pricingUrl: "https://metricool.com/fr/tarifs/",
    currency: "EUR",
    tagline: "Analytics et planification, avec des paliers par nombre de marques.",
    entryMonthly: 16,
    entryLabel: "Starter 5 marques, 16 € par mois (facturation annuelle), 20 € en mensuel",
    freePlan: "1 marque, 20 publications par mois, 30 jours d'historique",
    plans: [
      { name: "Free", monthlyAnnual: 0, monthlyMonthly: 0, detail: "1 marque, 20 publications/mois" },
      { name: "Starter 5", monthlyAnnual: 16, monthlyMonthly: 20, detail: "5 marques" },
      { name: "Starter 10", monthlyAnnual: 29, monthlyMonthly: 36, detail: "10 marques" },
      { name: "Advanced 15", monthlyAnnual: 43, monthlyMonthly: 54, detail: "15 marques, équipe illimitée, approbations" },
      { name: "Advanced 25", monthlyAnnual: 69, monthlyMonthly: 87, detail: "25 marques" },
      { name: "Advanced 50", monthlyAnnual: 130, monthlyMonthly: 172, detail: "50 marques" }
    ],
    notIncluded: ["X (Twitter) : connexion facturée en supplément par compte.", "Flux d'approbation et équipe illimitée : palier Advanced seulement.", "Marque blanche des rapports : offre sur mesure.", "Pas de palier à 3 marques : le premier palier payant en compte 5."],
    networks: ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Pinterest", "Threads", "Bluesky", "Google Business Profile", "Twitch", "X (supplément)"],
    features: { calendar: "yes", clientReports: "partial", linkInBio: "yes", approval: "higher", analytics: "yes", ai: "yes" },
    language: "Interface et support en français.",
    estimate: ({ brands, users }) => {
      const table: [number, number, string][] = [
        [5, 16, "Starter 5 marques"],
        [10, 29, "Starter 10 marques"],
        [15, 43, "Advanced 15 marques"],
        [25, 69, "Advanced 25 marques"],
        [50, 130, "Advanced 50 marques"]
      ];
      const minIdx = users > 1 ? 2 : 0; // équipe : Advanced
      for (let i = minIdx; i < table.length; i += 1) {
        const [max, price, label] = table[i];
        if (brands <= max) return { monthly: price, how: `${label}${users > 1 ? " (équipe au-delà d'un utilisateur)" : ""}, facturation annuelle.` };
      }
      return { monthly: null, how: "Au-delà de 50 marques : sur devis." };
    },
    verifiedAt: VERIFIED,
    sources: ["https://metricool.com/pricing/", "https://help.metricool.com/"]
  },
  {
    slug: "swello",
    name: "Swello",
    website: "https://swello.com",
    pricingUrl: "https://swello.com/fr/tarifs",
    currency: "EUR",
    tagline: "Planificateur français, facturé par comptes et par utilisateurs (prix HT).",
    entryMonthly: 19,
    entryLabel: "Medium, 19 € HT par mois (5 comptes, 1 utilisateur)",
    freePlan: "5 profils (un par réseau), 1 utilisateur, environ 40 publications par mois",
    plans: [
      { name: "Starter", monthlyAnnual: 0, monthlyMonthly: 0, detail: "5 profils, 1 utilisateur" },
      { name: "Medium", monthlyAnnual: 19, monthlyMonthly: 19, detail: "5 comptes, 1 utilisateur ; compte supplémentaire 5 € HT, utilisateur dès 20 € HT" },
      { name: "Large", monthlyAnnual: 59, monthlyMonthly: 59, detail: "10 comptes, 3 utilisateurs" },
      { name: "Business", monthlyAnnual: 99, monthlyMonthly: 99, detail: "15 comptes, 5 utilisateurs" }
    ],
    notIncluded: ["Prix affichés hors taxes.", "Chaque compte au-delà de 5 et chaque utilisateur supplémentaire sont facturés en plus.", "Pas de flux d'approbation ni de page « link in bio » identifiés.", "YouTube n'est pas pris en charge."],
    networks: ["LinkedIn", "Instagram", "TikTok", "Threads", "Bluesky", "Facebook", "X"],
    features: { calendar: "yes", clientReports: "partial", linkInBio: "no", approval: "no", analytics: "yes", ai: "yes" },
    language: "Interface et support en français.",
    estimate: ({ accounts, users }) => {
      const medium = 19 + Math.max(0, accounts - 5) * 5 + Math.max(0, users - 1) * 20;
      const large = 59 + Math.max(0, accounts - 10) * 5 + Math.max(0, users - 3) * 20;
      const business = 99 + Math.max(0, accounts - 15) * 5 + Math.max(0, users - 5) * 20;
      const best = Math.min(medium, large, business);
      const label = best === medium ? "Medium + suppléments" : best === large ? "Large + suppléments" : "Business + suppléments";
      return { monthly: best, how: `${label} (comptes 5 € HT, utilisateurs 20 € HT), prix HT.` };
    },
    verifiedAt: VERIFIED,
    sources: ["https://swello.com/fr/tarifs"]
  },
  {
    slug: "agorapulse",
    name: "Agorapulse",
    website: "https://www.agorapulse.com",
    pricingUrl: "https://www.agorapulse.com/fr/tarifs/",
    currency: "USD",
    tagline: "Suite complète (boîte de réception, écoute, rapports), facturée par utilisateur.",
    entryMonthly: 79,
    entryLabel: "Standard, 79 $ par utilisateur et par mois (facturation annuelle), 99 $ en mensuel",
    freePlan: null,
    plans: [
      { name: "Standard", monthlyAnnual: 79, monthlyMonthly: 99, detail: "par utilisateur, 10 profils" },
      { name: "Professional", monthlyAnnual: 119, monthlyMonthly: 149, detail: "par utilisateur, 10 profils, approbations" },
      { name: "Advanced", monthlyAnnual: 149, monthlyMonthly: 199, detail: "par utilisateur, 10 profils, rapports avancés" },
      { name: "Custom", monthlyAnnual: null, monthlyMonthly: null, detail: "sur devis" }
    ],
    notIncluded: ["Le prix est par utilisateur.", "Profils au-delà de 10 : supplément non publié.", "Approbations et page bio à partir de Professional.", "Prix affichés en dollars, même sur le site français."],
    networks: ["Facebook", "Instagram", "Threads", "X", "LinkedIn", "YouTube", "Pinterest", "Google Business Profile", "TikTok", "Bluesky", "Reddit"],
    features: { calendar: "yes", clientReports: "yes", linkInBio: "higher", approval: "higher", analytics: "yes", ai: "yes" },
    language: "Interface et support en français.",
    estimate: ({ accounts, users }) => {
      if (accounts > 10) return { monthly: null, how: "Au-delà de 10 profils : supplément non publié." };
      return { monthly: 79 * Math.max(1, users), how: `Standard à 79 $ × ${Math.max(1, users)} utilisateur(s), facturation annuelle.` };
    },
    verifiedAt: VERIFIED,
    sources: ["https://www.agorapulse.com/pricing/"]
  },
  {
    slug: "publer",
    name: "Publer",
    website: "https://publer.com",
    pricingUrl: "https://publer.com/plans",
    currency: "USD",
    tagline: "Planificateur à la carte : un prix de base puis chaque compte et chaque utilisateur en plus.",
    entryMonthly: 4,
    entryLabel: "Professional, 4 $ par mois (facturation annuelle) pour 1 compte, puis 3,20 $ par compte supplémentaire",
    freePlan: "3 comptes, 10 publications programmées par compte, 1 utilisateur",
    plans: [
      { name: "Free", monthlyAnnual: 0, monthlyMonthly: 0, detail: "3 comptes" },
      { name: "Professional", monthlyAnnual: 4, monthlyMonthly: 5, detail: "1 compte, 1 utilisateur ; compte +3,20 $, utilisateur +1,60 $" },
      { name: "Business", monthlyAnnual: 8, monthlyMonthly: 10, detail: "1 compte, 1 utilisateur ; compte +5,60 $, utilisateur +2,40 $ ; analytics" }
    ],
    notIncluded: ["Le prix affiché ne couvre qu'un seul compte : chaque compte s'ajoute.", "Analytics réservées au palier Business (plus cher par compte).", "Rapports en marque blanche non disponibles."],
    networks: ["Facebook", "Instagram", "TikTok", "X", "LinkedIn", "Pinterest", "YouTube", "Threads", "Mastodon", "Bluesky", "Google Business Profile", "Telegram"],
    features: { calendar: "yes", clientReports: "addon", linkInBio: "yes", approval: "yes", analytics: "higher", ai: "yes" },
    language: "Interface en français ; support en anglais.",
    estimate: ({ accounts, users }) => {
      const pro = 4 + Math.max(0, accounts - 1) * 3.2 + Math.max(0, users - 1) * 1.6;
      return { monthly: pro, how: `Professional 4 $ + ${Math.max(0, accounts - 1)} compte(s) × 3,20 $ + ${Math.max(0, users - 1)} utilisateur(s) × 1,60 $, facturation annuelle (analytics : palier Business, plus cher).` };
    },
    verifiedAt: VERIFIED,
    sources: ["https://publer.com/plans", "https://publer.com/help"]
  },
  {
    slug: "planoly",
    name: "Planoly",
    website: "https://www.planoly.com",
    pricingUrl: "https://www.planoly.com/pricing",
    currency: "USD",
    tagline: "Planificateur visuel Instagram et Pinterest, facturé par « social set ».",
    entryMonthly: 14,
    entryLabel: "Starter, 14 $ par mois (facturation annuelle), 16 $ en mensuel",
    freePlan: null,
    plans: [
      { name: "Starter", monthlyAnnual: 14, monthlyMonthly: 16, detail: "1 social set, 1 utilisateur" },
      { name: "Growth", monthlyAnnual: 24, monthlyMonthly: 28, detail: "2 social sets, 2 utilisateurs ; set +10 $, utilisateur +5 $" },
      { name: "Pro", monthlyAnnual: 47, monthlyMonthly: 55, detail: "6 social sets, 6 utilisateurs ; set +8 $, utilisateur +3 $" }
    ],
    notIncluded: ["Un « social set » = une marque : la troisième marque se paie en supplément.", "Interface et support en anglais uniquement.", "Approbation et aperçu client limités à Instagram.", "Pas de plan gratuit (essai de 14 jours)."],
    networks: ["Instagram", "Facebook", "X", "TikTok", "Pinterest", "LinkedIn", "YouTube", "Threads"],
    features: { calendar: "yes", clientReports: "partial", linkInBio: "yes", approval: "partial", analytics: "yes", ai: "yes" },
    language: "Interface et support en anglais.",
    estimate: ({ brands, users }) => {
      const sets = Math.max(1, brands);
      if (sets <= 1 && users <= 1) return { monthly: 14, how: "Starter : 1 social set, 1 utilisateur, facturation annuelle." };
      const growth = 24 + Math.max(0, sets - 2) * 10 + Math.max(0, users - 2) * 5;
      const pro = 47 + Math.max(0, sets - 6) * 8 + Math.max(0, users - 6) * 3;
      const best = Math.min(growth, pro);
      return { monthly: best, how: best === growth ? `Growth (2 sets, 2 utilisateurs) + ${Math.max(0, sets - 2)} set(s) et ${Math.max(0, users - 2)} utilisateur(s) supplémentaires, facturation annuelle.` : "Pro (6 sets, 6 utilisateurs) + suppléments, facturation annuelle." };
    },
    verifiedAt: VERIFIED,
    sources: ["https://www.planoly.com/pricing", "https://help.planoly.com/"]
  }
];

export const COMPETITOR_SLUGS = COMPETITORS.map((c) => c.slug);

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}

/** Scénario de référence des pages : 3 marques, 8 comptes, 1 utilisateur. */
export const REFERENCE_SCENARIO: CostInput = { brands: 3, accounts: 8, users: 1 };

/** Ce que Nebula ne fait pas encore (réseaux) — lu par les pages
 * « alternative à » (section honnête) et /reseaux. */
export const UPCOMING_NETWORKS: { slug: string; label: string; blurb: string }[] = [
  { slug: "threads", label: "Threads", blurb: "Le réseau de conversation de Meta, en texte court." },
  { slug: "linkedin", label: "LinkedIn", blurb: "Pages entreprise et profils, pour les indépendants et les marques B2B." },
  { slug: "pinterest", label: "Pinterest", blurb: "Épingles et tableaux, pour le visuel qui dure dans le temps." }
  // Bluesky : disponible depuis le 25/09/2026 (retiré de la liste d'attente,
  // /reseaux/bluesky redirige vers /reseaux — voir next.config.js).
];

export const FEATURE_LABELS: Record<keyof CompetitorFeatures, string> = {
  calendar: "Calendrier de publication",
  clientReports: "Rapports clients partageables",
  linkInBio: "Page « link in bio »",
  approval: "Approbation client",
  analytics: "Analytics",
  ai: "Assistant IA"
};

export function featureText(level: FeatureLevel): string {
  switch (level) {
    case "yes":
      return "Oui";
    case "no":
      return "Non";
    case "higher":
      return "Palier supérieur";
    case "addon":
      return "En option";
    case "partial":
      return "Partiel";
    default:
      return "Non publié";
  }
}
