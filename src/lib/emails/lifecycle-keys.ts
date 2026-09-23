// Clés des emails de cycle de vie (brief growth, lot G3) — fichier PUR
// (sans Prisma ni Resend) pour être importable par la page propriétaire et
// les routes d'aperçu. La logique d'éligibilité et les templates sont dans
// lifecycle.ts.
export const LIFECYCLE_KEYS = [
  "welcome",
  "no_connection_48h",
  "first_post_scheduled",
  "unused_features_d7",
  "trial_ends_48h",
  "trial_ended",
  "inactive_14d",
  "trial_gift",
  "annual_nudge",
  "lead_t0",
  "lead_t2",
  "lead_t5"
] as const;

export type LifecycleKey = (typeof LIFECYCLE_KEYS)[number];

/** Emails de SERVICE (information sur l'essai) : envoyés même si la
 *  personne a refusé les conseils. */
export const SERVICE_KEYS: LifecycleKey[] = ["trial_ends_48h", "trial_ended", "trial_gift"];

export const LIFECYCLE_LABELS: Record<LifecycleKey, string> = {
  welcome: "Bienvenue (immédiat)",
  no_connection_48h: "Aucun compte connecté après 48 h",
  first_post_scheduled: "Première publication programmée",
  unused_features_d7: "Fonctions non essayées à J+7",
  trial_ends_48h: "Essai Pro : fin dans 48 h",
  trial_ended: "Essai Pro terminé",
  inactive_14d: "Inactif depuis 14 jours",
  trial_gift: "14 jours de Pro offerts (comptes existants)",
  annual_nudge: "Rappel annuel (3e facture)",
  lead_t0: "Lead outil : générations bonus actives",
  lead_t2: "Lead outil : J+2",
  lead_t5: "Lead outil : J+5"
};
