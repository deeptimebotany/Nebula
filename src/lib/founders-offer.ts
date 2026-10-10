// Offres fondateurs (02/10/2026, avant l'ouverture) — valeurs partagées par
// le serveur (src/lib/billing/founders.ts) et l'affichage (Tarifs,
// Abonnement, modale de mise à niveau). Aucun import serveur ici.
//
//   - « Fondateur » : Pro 1 marque à 10 € par mois pendant 3 mois, puis le
//     prix normal (12 €), prélevé automatiquement comme tout abonnement.
//     Réservé aux 100 premiers abonnés (coupon Stripe plafonné à 100
//     utilisations), sur le mensuel, pour un premier abonnement.
//   - « Fondateur Premium » : 100 € en une fois, Pro 1 marque pendant 1 an,
//     100 places, sans renouvellement : à la fin, Nebula demande « quel
//     forfait vous faut-il ? » et rien n'est prélevé sans nouveau choix.
// Les deux donnent le badge « Fondateur », gardé à vie. Vente des deux
// offres jusqu'au 1er janvier 2027 (ou avant si les places partent).
import { findTier, type PaidPlan } from "@/lib/plans";

/**
 * Fin de la vente des deux offres (décision du 03/10/2026) : le 1er janvier
 * 2027 à 0 h, heure de Paris. Ceux qui ont déjà l'offre gardent leurs
 * avantages (3 mois à 10 €, année Premium, badge).
 */
export const FOUNDERS_SALE_ENDS_AT = new Date("2026-12-31T23:00:00Z");
export const FOUNDERS_SALE_END_LABEL = "1er janvier 2027";

/** Les offres fondateurs sont-elles encore en vente ? */
export function foundersSaleOpen(now: Date = new Date()): boolean {
  return now.getTime() < FOUNDERS_SALE_ENDS_AT.getTime();
}

export const FOUNDER_MONTHLY = {
  plan: "PRO" as PaidPlan,
  maxBrands: 1,
  /** Prix pendant les premiers mois, en euros. */
  priceMonthly: 10,
  months: 3,
  places: 100
} as const;

export const FOUNDER_PREMIUM = {
  plan: "PRO" as PaidPlan,
  maxBrands: 1,
  priceCents: 10_000,
  months: 12,
  places: 100
} as const;

export const FOUNDER_BADGE_LABEL = "Fondateur";
export const FOUNDER_PREMIUM_NOTE = "Fondateur Premium";

/** Prix normal de Pro 1 marque (mensuel), lu dans plans.ts. */
export function founderRegularPrice(): number {
  return findTier(FOUNDER_MONTHLY.plan, FOUNDER_MONTHLY.maxBrands)?.priceMonthly ?? 0;
}

/** Remise mensuelle du coupon « Fondateur », en centimes (12 € - 10 € = 200). */
export function founderDiscountCents(): number {
  return Math.max(0, Math.round((founderRegularPrice() - FOUNDER_MONTHLY.priceMonthly) * 100));
}

/** Ce palier peut-il recevoir l'offre « Fondateur » (Pro 1 marque, mensuel) ? */
export function isFounderMonthlyTier(plan: string, maxBrands: number, interval: string): boolean {
  return plan === FOUNDER_MONTHLY.plan && maxBrands === FOUNDER_MONTHLY.maxBrands && interval === "month";
}

export interface FounderPlaces {
  total: number;
  taken: number;
  left: number;
}

export function placesOf(total: number, taken: number): FounderPlaces {
  return { total, taken, left: Math.max(0, total - taken) };
}

/** Réponse de GET /api/billing/founders. */
export interface FoundersResponse {
  open: boolean;
  /** Vente encore ouverte (jusqu'au 1er janvier 2027). */
  saleOpen: boolean;
  saleEndsAt: string;
  monthly: FounderPlaces & { priceMonthly: number; months: number; regularPrice: number };
  premium: FounderPlaces & { priceCents: number; months: number };
  /** Compte connecté seulement. */
  me: {
    kind: "MONTHLY" | "PREMIUM" | null;
    since: string | null;
    premiumUntil: string | null;
    monthlyEligible: boolean;
    premiumEligible: boolean;
    /** Pourquoi le Premium n'est pas proposé (phrase affichable). */
    premiumBlocked: string | null;
  } | null;
}

/** « 100 € » */
export function euros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

/** Même jour, N mois plus tard (le 31 → dernier jour du mois s'il est plus court). */
export function addMonthsUtc(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function placesText(left: number): string {
  if (left <= 0) return "complet";
  return `${left} place${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}`;
}
