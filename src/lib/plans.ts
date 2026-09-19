// Définition des paliers d'abonnement. Purement déclaratif ici — la
// vérité côté paiement vient de Stripe (voir src/lib/billing/stripe.ts et
// /api/billing/webhook), ce fichier ne fait qu'exprimer les limites
// associées à chaque plan pour les vérifier côté serveur.
//
// L'abonnement est rattaché au COMPTE (à l'utilisateur), pas à une marque en
// particulier : un seul abonnement gouverne combien de marques au total vous
// pouvez créer avec votre compte Nebula. Pour les paliers payants, vous
// choisissez combien de marques vous voulez pouvoir gérer (3/5/10 en Pro,
// 15/25/50 en Agence) — le prix augmente avec ce nombre, exactement comme
// une grille "jusqu'à X marques" classique, mais à des tarifs plus bas.
// Les quotas de comptes connectés et de publications/mois s'appliquent,
// eux, individuellement à CHAQUE marque.

export const PLANS = ["FREE", "PRO", "AGENCY"] as const;
export type Plan = (typeof PLANS)[number];

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export interface BrandTier {
  maxBrands: number;
  priceMonthly: number; // en euros
  priceYearly: number; // en euros, remise annuelle incluse
  // Nom de la variable d'env contenant le Price ID Stripe, par intervalle.
  stripePriceEnvVars: Record<BillingInterval, string>;
}

export interface PlanLimits {
  id: Plan;
  label: string;
  maxConnections: number; // comptes réseaux connectés, PAR marque
  maxPostsPerMonth: number; // publications programmées/mois, PAR marque
  aiEnabled: boolean;
  // Publier la même vidéo/post sur un ensemble de comptes choisis librement,
  // à travers TOUS les réseaux en même temps — réservé au palier Agence.
  massPublishEnabled: boolean;
  // Paliers "nombre de marques" disponibles pour ce plan, du moins cher au
  // plus cher. Le palier Gratuit n'en a qu'un seul (1 marque, 0€).
  tiers: BrandTier[];
  features: string[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    id: "FREE",
    label: "Gratuit",
    maxConnections: 4,
    maxPostsPerMonth: 20,
    aiEnabled: false,
    massPublishEnabled: false,
    tiers: [{ maxBrands: 1, priceMonthly: 0, priceYearly: 0, stripePriceEnvVars: { month: "", year: "" } }],
    features: [
      "1 marque",
      "4 comptes connectés (Instagram + Facebook comptent pour un seul)",
      "20 publications programmées / mois",
      "Publier une même vidéo sur vos réseaux en même temps",
      "Calendrier + analytics de base",
      "Sans assistant IA"
    ]
  },
  PRO: {
    id: "PRO",
    label: "Pro",
    maxConnections: 8,
    maxPostsPerMonth: 100,
    aiEnabled: true,
    massPublishEnabled: false,
    tiers: [
      { maxBrands: 3, priceMonthly: 9, priceYearly: 90, stripePriceEnvVars: { month: "STRIPE_PRICE_PRO_3_MONTHLY", year: "STRIPE_PRICE_PRO_3_YEARLY" } },
      { maxBrands: 5, priceMonthly: 15, priceYearly: 150, stripePriceEnvVars: { month: "STRIPE_PRICE_PRO_5_MONTHLY", year: "STRIPE_PRICE_PRO_5_YEARLY" } },
      { maxBrands: 10, priceMonthly: 25, priceYearly: 250, stripePriceEnvVars: { month: "STRIPE_PRICE_PRO_10_MONTHLY", year: "STRIPE_PRICE_PRO_10_YEARLY" } }
    ],
    features: [
      "Jusqu'à 3, 5 ou 10 marques au choix",
      "Avec un abonnement, ajoutez plusieurs comptes à votre marque sur chaque réseau",
      "100 publications programmées / mois et par marque",
      "Publications envoyées plus rapidement",
      "Assistant IA (titres, légendes, chat)",
      "Analyse de rétention vidéo par IA",
      "Génération de miniatures",
      "Thème de couleurs exclusif « Saphir »"
    ]
  },
  AGENCY: {
    id: "AGENCY",
    label: "Agence",
    maxConnections: 9999,
    maxPostsPerMonth: 999999,
    aiEnabled: true,
    massPublishEnabled: true,
    tiers: [
      { maxBrands: 15, priceMonthly: 29, priceYearly: 290, stripePriceEnvVars: { month: "STRIPE_PRICE_AGENCY_15_MONTHLY", year: "STRIPE_PRICE_AGENCY_15_YEARLY" } },
      { maxBrands: 25, priceMonthly: 45, priceYearly: 450, stripePriceEnvVars: { month: "STRIPE_PRICE_AGENCY_25_MONTHLY", year: "STRIPE_PRICE_AGENCY_25_YEARLY" } },
      { maxBrands: 50, priceMonthly: 75, priceYearly: 750, stripePriceEnvVars: { month: "STRIPE_PRICE_AGENCY_50_MONTHLY", year: "STRIPE_PRICE_AGENCY_50_YEARLY" } }
    ],
    features: [
      "Jusqu'à 15, 25 ou 50 marques au choix",
      "Comptes réseaux illimités par marque",
      "Publications illimitées",
      "Publication en masse (1 vidéo → tous les réseaux/comptes en 1 clic)",
      "Assistant IA + analyse de rétention",
      "Publications prioritaires",
      "Support prioritaire",
      "Thème de couleurs exclusif « Or Impérial »"
    ]
  }
};

/** true dès que le palier n'impose pas de vrai plafond (utilisé pour masquer
 * les barres de progression de quota, qui n'ont pas de sens en illimité). */
export function isUnlimitedPlan(plan: Plan): boolean {
  return plan === "AGENCY";
}

export function planOf(subscription: { plan?: string | null; status?: string | null } | null | undefined): Plan {
  if (!subscription) return "FREE";
  if (subscription.status && !["ACTIVE", "TRIALING"].includes(subscription.status)) return "FREE";
  const plan = subscription.plan as Plan | undefined;
  return plan && PLANS.includes(plan) ? plan : "FREE";
}

export function intervalOf(subscription: { interval?: string | null } | null | undefined): BillingInterval {
  return subscription?.interval === "year" ? "year" : "month";
}

/** Nombre de marques autorisées pour cet abonnement. Retombe sur le plus
 * petit palier du plan si aucune valeur n'a été enregistrée (ex : compte
 * gratuit sans ligne Subscription du tout). */
export function maxBrandsOf(subscription: { plan?: string | null; status?: string | null; maxBrands?: number | null } | null | undefined): number {
  const plan = planOf(subscription);
  if (subscription?.maxBrands && subscription.maxBrands > 0) return subscription.maxBrands;
  return PLAN_LIMITS[plan].tiers[0].maxBrands;
}

export function findTier(plan: Plan, maxBrands: number): BrandTier | undefined {
  return PLAN_LIMITS[plan].tiers.find((t) => t.maxBrands === maxBrands);
}
