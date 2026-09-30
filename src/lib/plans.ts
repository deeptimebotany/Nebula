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

/**
 * Limite d'IA PAR JOUR et par compte (heure de Paris) : les textes (titres,
 * légendes, choix des 3 images, recyclage, idées, outils de /outils). Comptés
 * en Gratuit et en Essai partout, et sur les outils de /outils pour tous ;
 * pas dans l'application en Pro et Agence (appels les moins chers).
 */
export interface AiDailyLimits {
  text: number;
}

/**
 * Quotas d'IA PAR MOIS et par compte (30/09/2026, passage de Gemini au palier
 * payant) : mois du calendrier, heure de Paris ; pendant l'Essai, sur toute
 * la durée de l'essai. 0 = non inclus. Les images se comptent en images.
 */
export interface AiMonthlyLimits {
  /** Analyses Rétention IA (en plus : recharges achetées, voir RETENTION_PACK). */
  retention: number;
  /** Images générées (miniatures « Rendre plus percutante »). */
  image: number;
  /** Générations du Studio IA (idées et accroches, scripts). */
  studio: number;
  /** Messages à l'assistant IA (chat). */
  assistant: number;
}

export const AI_MONTHLY: Record<Plan, AiMonthlyLimits> = {
  FREE: { retention: 0, image: 0, studio: 0, assistant: 0 },
  TRIAL: { retention: 5, image: 5, studio: 15, assistant: 50 },
  PRO: { retention: 15, image: 20, studio: 50, assistant: 150 },
  AGENCY: { retention: 50, image: 60, studio: 120, assistant: 400 }
};

/**
 * Recharge Rétention (30/09/2026) : paiement unique Stripe, Pro et Agence.
 * Les analyses achetées s'ajoutent au quota du mois, sont utilisées APRÈS
 * lui et n'expirent pas. Prix Stripe : variable STRIPE_PRICE_RETENTION_PACK.
 */
export const RETENTION_PACK = { credits: 20, priceCents: 399, currency: "eur", stripePriceEnvVar: "STRIPE_PRICE_RETENTION_PACK" } as const;

/** « 3,99 € » */
export function formatEuroCents(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

const PACK_LINE = `Recharges Rétention : +${RETENTION_PACK.credits} analyses pour ${formatEuroCents(RETENTION_PACK.priceCents)}, sans date limite`;

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
  /** Limite d'IA par jour et par compte (textes). */
  aiDaily: AiDailyLimits;
  /** Quotas d'IA par mois et par compte (Essai : sur toute sa durée). */
  aiMonthly: AiMonthlyLimits;
  /** Recharges Rétention achetables et utilisables (Pro, Agence). */
  retentionPacks: boolean;
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
    aiDaily: { text: 10 },
    aiMonthly: AI_MONTHLY.FREE,
    retentionPacks: false,
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
  // au plus à la création, et une IA bridée : textes 20 par jour ; pour tout
  // l'essai, 5 analyses Rétention, 5 images, 15 générations du Studio et 50
  // messages à l'assistant (30/09/2026). Pire cas IA ≈ 2 $ par essai.
  TRIAL: {
    id: "TRIAL",
    label: "Essai",
    maxConnections: 8,
    maxPostsPerMonth: 100,
    aiEnabled: true,
    massPublishEnabled: false,
    maxBioLinks: 15,
    tiers: [{ maxBrands: 2, priceMonthly: 0, priceYearly: 0, stripePriceEnvVars: { month: "", year: "" } }],
    features: [
      "Jusqu'à 2 marques",
      "Comptes connectés et publications comme en Pro",
      `IA pendant l'essai : ${AI_MONTHLY.TRIAL.retention} analyses Rétention, ${AI_MONTHLY.TRIAL.image} miniatures, ${AI_MONTHLY.TRIAL.studio} générations du Studio et ${AI_MONTHLY.TRIAL.assistant} messages à l'assistant`,
      "Textes IA (titres, légendes) : 20 par jour",
      "Rapports clients, calendrier partagé, media kit",
      "Page « link in bio » publique (15 liens)"
    ],
    reportsEnabled: true,
    calendarShareEnabled: true,
    mediaKitEnabled: true,
    purchasable: false,
    upgradeTo: "PRO",
    aiDaily: { text: 20 },
    aiMonthly: AI_MONTHLY.TRIAL,
    retentionPacks: false,
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
      `Assistant IA (titres, légendes, chat) : ${AI_MONTHLY.PRO.assistant} messages par mois`,
      `Studio IA : idées, accroches et scripts tirés de vos chiffres (${AI_MONTHLY.PRO.studio} par mois)`,
      `Rétention IA : ${AI_MONTHLY.PRO.retention} analyses par mois, l'IA regarde vos vidéos YouTube publiques`,
      `Miniatures IA : ${AI_MONTHLY.PRO.image} par mois`,
      PACK_LINE,
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
    aiDaily: { text: 60 },
    aiMonthly: AI_MONTHLY.PRO,
    retentionPacks: true,
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
      `Assistant IA : ${AI_MONTHLY.AGENCY.assistant} messages par mois`,
      `Rétention IA : ${AI_MONTHLY.AGENCY.retention} analyses par mois, avec une réflexion plus poussée`,
      `Studio IA : ${AI_MONTHLY.AGENCY.studio} idées ou scripts par mois`,
      `Miniatures IA : ${AI_MONTHLY.AGENCY.image} par mois`,
      PACK_LINE,
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
    aiDaily: { text: 150 },
    aiMonthly: AI_MONTHLY.AGENCY,
    retentionPacks: true,
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
