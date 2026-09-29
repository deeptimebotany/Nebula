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

// Palier « Essai » (29/09/2026, brief « Essai 14 jours », lot E1) : l'essai
// n'est plus « Pro sans payer » mais un palier à part entière, avec ses
// propres limites (bridé sur ce qui coûte : l'IA). Jamais achetable, jamais
// dans la grille publique des tarifs. Toute garde de fonctionnalité lit une
// CAPACITÉ ou une LIMITE ci-dessous, jamais le nom d'un palier
// (tests/quality/plan-guards.test.ts le vérifie).
export const PLANS = ["FREE", "TRIAL", "PRO", "AGENCY"] as const;
export type Plan = (typeof PLANS)[number];
/** Paliers achetables (Stripe) : seuls acceptés par le paiement et le webhook. */
export const PAID_PLANS = ["PRO", "AGENCY"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
/** Paliers de la grille publique des tarifs (l'essai n'y figure pas). */
export const PUBLIC_PLANS = ["FREE", "PRO", "AGENCY"] as const;
export type PublicPlan = (typeof PUBLIC_PLANS)[number];

export function isPaidPlanId(value: unknown): value is PaidPlan {
  return typeof value === "string" && (PAID_PLANS as readonly string[]).includes(value);
}

/** Limites d'IA par jour et par compte (heure de Paris). 0 = non inclus. */
export interface AiDailyLimits {
  /** Textes : outils, légendes, titres, idées, recyclage, choix d'images. */
  text: number;
  /** Images : miniatures, stickers. */
  image: number;
  /** Messages de l'assistant IA (chat). */
  assistant: number;
  /** Analyses Rétention IA. */
  retention: number;
}

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
  // Studio IA (produit n°9, /studio) : générations par jour et par compte
  // (idées + accroches, scripts). 0 = aperçu seulement. Voir src/lib/studio.
  studioDailyLimit: number;
  // Publier la même vidéo/post sur un ensemble de comptes choisis librement,
  // à travers TOUS les réseaux en même temps — réservé au palier Agence.
  massPublishEnabled: boolean;
  // Nombre de liens affichables sur la page "link in bio" publique de la
  // marque (voir /link-in-bio et /l/[slug]) — un chiffre très élevé sert de
  // "illimité" côté UI (voir isUnlimitedBioLinks ci-dessous).
  maxBioLinks: number;
  // Paliers "nombre de marques" disponibles pour ce plan, du moins cher au
  // plus cher. Le palier Gratuit n'en a qu'un seul (1 marque, 0€).
  tiers: BrandTier[];
  features: string[];
  // Rapports clients automatiques (voir /reports et BrandReport dans
  // prisma/schema.prisma) — page publique de reporting par marque, avec
  // envoi email périodique optionnel. Réservé aux paliers payants, comme
  // aiEnabled.
  reportsEnabled: boolean;
  // Calendrier client public en lecture seule (voir /calendar-share et
  // CalendarShare dans prisma/schema.prisma) — vue "vers l'avant" qui
  // complète les rapports (reportsEnabled). Réservé aux mêmes paliers.
  calendarShareEnabled: boolean;
  // Media kit public (produit n°10, /media-kit et /kit/[slug]) : la page à
  // envoyer aux sponsors, chiffres relevés par Nebula. En Gratuit : aperçu
  // dans l'application, publication réservée aux paliers payants.
  mediaKitEnabled: boolean;

  // --- Capacités (lot E1 : plus aucune comparaison de noms de paliers) ---
  /** Achetable par Stripe (Pro, Agence). */
  purchasable: boolean;
  /** Palier proposé ensuite (bouton « Passer en … ») ; null = le plus haut. */
  upgradeTo: Plan | null;
  /** Limites d'IA par jour et par compte (Studio : studioDailyLimit). */
  aiDaily: AiDailyLimits;
  /**
   * Garde-fous des paliers sans paiement (Gratuit, Essai) : IA seulement avec
   * une adresse confirmée, TOUT usage de l'IA compté par compte (outils et
   * application, toutes marques confondues), plafond par adresse IP sur les
   * outils, budget global du jour (voir src/lib/ai/guard.ts). Pro et Agence
   * gardent le comptage d'avant : outils, Studio, assistant, Rétention.
   */
  aiGuardrails: boolean;
  /** Budget global du jour de l'IA partagé par ce palier (null = jamais compté). */
  aiBudgetBucket: "trial" | "free" | null;
  /** Lien d'approbation client (calendrier). */
  approvalsEnabled: boolean;
  /** Rapport PDF des statistiques (Analytics). */
  pdfReportEnabled: boolean;
  /** API et webhooks (n8n, Make, Zapier). */
  apiEnabled: boolean;
  /** Marque blanche (nom et logo de l'agence). */
  whiteLabelEnabled: boolean;
  /** Thèmes et fonds premium (ciel étoilé…). */
  premiumAppearance: boolean;
  /** Taille de la carte de page bio. */
  bioCardTier: "base" | "pro" | "agency";
  /** Comptes publicitaires reliables par marque (0 = aucun, pas de synchro). */
  maxAdAccounts: number;
  /** Plafond de l'objectif « Habitude » des missions de la semaine. */
  weeklyHabitCap: number;
  /**
   * Niveau des fonctions incluses (0 Gratuit, 1 Pro, 2 Agence) : un thème,
   * un fond ou un cosmétique « Pro » s'ouvre à tout palier de niveau ≥ 1
   * (l'Essai compris). Voir planIncludes().
   */
  featureLevel: 0 | 1 | 2;
}

export const PLAN_LIMITS = {
  FREE: {
    id: "FREE",
    label: "Gratuit",
    maxConnections: 4,
    maxPostsPerMonth: 20,
    aiEnabled: false,
    studioDailyLimit: 0,
    massPublishEnabled: false,
    maxBioLinks: 3,
    tiers: [{ maxBrands: 1, priceMonthly: 0, priceYearly: 0, stripePriceEnvVars: { month: "", year: "" } }],
    features: [
      "1 marque",
      "4 comptes connectés",
      "20 publications programmées par mois",
      "Publier une même vidéo sur vos réseaux en même temps",
      "Calendrier + analytics de base",
      "Page « link in bio » publique (3 liens)"
    ],
    reportsEnabled: false,
    calendarShareEnabled: false,
    mediaKitEnabled: false,
    purchasable: false,
    upgradeTo: "PRO",
    aiDaily: { text: 10, image: 2, assistant: 0, retention: 0 },
    aiGuardrails: true,
    aiBudgetBucket: "free",
    approvalsEnabled: false,
    pdfReportEnabled: false,
    apiEnabled: false,
    whiteLabelEnabled: false,
    premiumAppearance: false,
    bioCardTier: "base",
    maxAdAccounts: 0,
    weeklyHabitCap: 4,
    featureLevel: 0
  },
  // Essai (14 jours, 30 avec un parrainage) : les fonctions de Pro, 2 marques
  // au plus à la création, et une IA bridée (texte 20, images 3, Studio 5,
  // assistant 20, Rétention 3 par jour). Pire cas IA ≈ 3 $ par essai.
  TRIAL: {
    id: "TRIAL",
    label: "Essai",
    maxConnections: 8,
    maxPostsPerMonth: 100,
    aiEnabled: true,
    studioDailyLimit: 5,
    massPublishEnabled: false,
    maxBioLinks: 15,
    tiers: [{ maxBrands: 2, priceMonthly: 0, priceYearly: 0, stripePriceEnvVars: { month: "", year: "" } }],
    features: [
      "Jusqu'à 2 marques",
      "Comptes connectés et publications comme en Pro",
      "IA : 20 textes, 3 miniatures et 5 générations du Studio par jour",
      "Assistant IA : 20 messages par jour ; 3 analyses de rétention par jour",
      "Rapports clients, calendrier partagé, media kit",
      "Page « link in bio » publique (15 liens)"
    ],
    reportsEnabled: true,
    calendarShareEnabled: true,
    mediaKitEnabled: true,
    purchasable: false,
    upgradeTo: "PRO",
    aiDaily: { text: 20, image: 3, assistant: 20, retention: 3 },
    aiGuardrails: true,
    aiBudgetBucket: "trial",
    approvalsEnabled: false,
    pdfReportEnabled: false,
    apiEnabled: false,
    whiteLabelEnabled: false,
    premiumAppearance: true,
    bioCardTier: "pro",
    maxAdAccounts: 3,
    weeklyHabitCap: 7,
    featureLevel: 1
  },
  PRO: {
    id: "PRO",
    label: "Pro",
    maxConnections: 8,
    maxPostsPerMonth: 100,
    aiEnabled: true,
    studioDailyLimit: 15,
    massPublishEnabled: false,
    maxBioLinks: 15,
    tiers: [
      { maxBrands: 3, priceMonthly: 9, priceYearly: 90, stripePriceEnvVars: { month: "STRIPE_PRICE_PRO_3_MONTHLY", year: "STRIPE_PRICE_PRO_3_YEARLY" } },
      { maxBrands: 5, priceMonthly: 15, priceYearly: 150, stripePriceEnvVars: { month: "STRIPE_PRICE_PRO_5_MONTHLY", year: "STRIPE_PRICE_PRO_5_YEARLY" } },
      { maxBrands: 10, priceMonthly: 25, priceYearly: 250, stripePriceEnvVars: { month: "STRIPE_PRICE_PRO_10_MONTHLY", year: "STRIPE_PRICE_PRO_10_YEARLY" } }
    ],
    features: [
      "3, 5 ou 10 marques au choix",
      "Jusqu'à 8 comptes connectés par marque (plusieurs comptes par réseau)",
      "100 publications programmées par mois et par marque",
      "Publications envoyées plus rapidement",
      "Assistant IA (titres, légendes, chat)",
      "Studio IA : idées, accroches et scripts tirés de vos chiffres (15 par jour)",
      "Analyse de rétention vidéo par IA",
      "Génération de miniatures",
      "Page « link in bio » publique (15 liens)",
      "Thèmes exclusifs « Saphir », « Or Impérial » et « Aube »",
      "Rapports clients automatiques",
      "Calendrier client public",
      "Media kit public pour les sponsors, avec vos vrais chiffres"
    ],
    reportsEnabled: true,
    calendarShareEnabled: true,
    mediaKitEnabled: true,
    purchasable: true,
    upgradeTo: "AGENCY",
    aiDaily: { text: 60, image: 15, assistant: 100, retention: 10 },
    aiGuardrails: false,
    aiBudgetBucket: null,
    approvalsEnabled: false,
    pdfReportEnabled: false,
    apiEnabled: false,
    whiteLabelEnabled: false,
    premiumAppearance: true,
    bioCardTier: "pro",
    maxAdAccounts: 3,
    weeklyHabitCap: 7,
    featureLevel: 1
  },
  AGENCY: {
    id: "AGENCY",
    label: "Agence",
    maxConnections: 9999,
    maxPostsPerMonth: 999999,
    aiEnabled: true,
    studioDailyLimit: 40,
    massPublishEnabled: true,
    maxBioLinks: 9999,
    tiers: [
      { maxBrands: 15, priceMonthly: 29, priceYearly: 290, stripePriceEnvVars: { month: "STRIPE_PRICE_AGENCY_15_MONTHLY", year: "STRIPE_PRICE_AGENCY_15_YEARLY" } },
      { maxBrands: 25, priceMonthly: 45, priceYearly: 450, stripePriceEnvVars: { month: "STRIPE_PRICE_AGENCY_25_MONTHLY", year: "STRIPE_PRICE_AGENCY_25_YEARLY" } },
      { maxBrands: 50, priceMonthly: 75, priceYearly: 750, stripePriceEnvVars: { month: "STRIPE_PRICE_AGENCY_50_MONTHLY", year: "STRIPE_PRICE_AGENCY_50_YEARLY" } }
    ],
    features: [
      "15, 25 ou 50 marques au choix",
      "Comptes réseaux illimités par marque",
      "Publications illimitées",
      "Publication en masse (1 vidéo → tous les réseaux/comptes en 1 clic)",
      "Assistant IA + analyse de rétention",
      "Studio IA : 40 idées ou scripts par jour",
      "Publications prioritaires",
      "Support prioritaire",
      "Page « link in bio » publique (liens illimités)",
      "Tous les thèmes Pro + le thème exclusif « Éclipse totale »",
      "Rapports clients automatiques",
      "Calendrier client public",
      "Media kit public pour chaque marque",
      "API et webhooks (n8n, Make, Zapier)"
    ],
    reportsEnabled: true,
    calendarShareEnabled: true,
    mediaKitEnabled: true,
    purchasable: true,
    upgradeTo: null,
    aiDaily: { text: 150, image: 40, assistant: 300, retention: 30 },
    aiGuardrails: false,
    aiBudgetBucket: null,
    approvalsEnabled: true,
    pdfReportEnabled: true,
    apiEnabled: true,
    whiteLabelEnabled: true,
    premiumAppearance: true,
    bioCardTier: "agency",
    maxAdAccounts: 50,
    weeklyHabitCap: 7,
    featureLevel: 2
  }
} satisfies Record<Plan, PlanLimits>;

/** Ce palier inclut les fonctions réservées à `required` (thèmes, fonds…). */
export function planIncludes(plan: Plan, required: Plan): boolean {
  return PLAN_LIMITS[plan].featureLevel >= PLAN_LIMITS[required].featureLevel;
}

/** Limites d'un palier lu dans une réponse d'API (valeur inconnue → Gratuit). */
export function limitsOf(plan: string | null | undefined): PlanLimits {
  return (PLANS as readonly string[]).includes(plan ?? "") ? PLAN_LIMITS[plan as Plan] : PLAN_LIMITS.FREE;
}

/** Valeur au-delà de laquelle une limite est « illimitée » pour l'affichage. */
const UNLIMITED = 9999;

/** true dès que le palier n'impose pas de vrai plafond (utilisé pour masquer
 * les barres de progression de quota, qui n'ont pas de sens en illimité). */
export function isUnlimitedPlan(plan: Plan): boolean {
  return PLAN_LIMITS[plan].maxPostsPerMonth >= UNLIMITED;
}

/** true dès que le palier n'impose pas de vrai plafond de liens sur la page
 * "link in bio" (voir maxBioLinks) — utilisé pour masquer le compteur. */
export function isUnlimitedBioLinks(plan: Plan): boolean {
  return PLAN_LIMITS[plan].maxBioLinks >= UNLIMITED;
}

/** Palier d'un abonnement Stripe : seulement un palier achetable, sinon Gratuit. */
export function planOf(subscription: { plan?: string | null; status?: string | null } | null | undefined): Plan {
  if (!subscription) return "FREE";
  if (subscription.status && !["ACTIVE", "TRIALING"].includes(subscription.status)) return "FREE";
  return isPaidPlanId(subscription.plan) ? subscription.plan : "FREE";
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

/** Mois offerts par la facturation annuelle d'un palier (ex. 90 € / an pour
 *  9 € / mois → 2 mois offerts). Calculé, jamais écrit en dur dans l'UI. */
export function annualFreeMonths(tier: BrandTier): number {
  if (!tier.priceMonthly) return 0;
  return Math.max(0, Math.round(12 - tier.priceYearly / tier.priceMonthly));
}
