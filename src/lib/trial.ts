// Essai Pro applicatif (« reverse trial », brief growth lot G2) — helpers
// purs, sans base de données, partagés par l'inscription, getUserPlan(),
// /api/me et l'interface.
//
// Tout nouvel inscrit est en Pro pendant TRIAL_DAYS, sans carte bancaire ;
// avec un code de parrainage valide, REFERRED_TRIAL_DAYS (lot G7). Un seul
// essai par adresse email, jamais réinitialisé. À la fin, le compte
// redescend en Gratuit sans rien perdre (voir applyTrialExpirations dans
// src/lib/billing/trial-expiry.ts).

export const TRIAL_DAYS = 14;
export const REFERRED_TRIAL_DAYS = 30;
/** Durée de validité de l'offre de bienvenue (-50 % premier mois). */
export const WELCOME_OFFER_HOURS = 48;

const DAY_MS = 24 * 60 * 60 * 1000;

export function trialEndDate(referred: boolean, from = new Date()): Date {
  return new Date(from.getTime() + (referred ? REFERRED_TRIAL_DAYS : TRIAL_DAYS) * DAY_MS);
}

export function isTrialActive(trialEndsAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() > now.getTime();
}

/** Jours restants, arrondis vers le haut (« 1 jour restant » jusqu'à la fin). */
export function trialDaysLeft(trialEndsAt: Date | string | null | undefined, now = new Date()): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / DAY_MS));
}

export function isOfferActive(offerExpiresAt: Date | string | null | undefined, offerUsedAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!offerExpiresAt || offerUsedAt) return false;
  return new Date(offerExpiresAt).getTime() > now.getTime();
}
