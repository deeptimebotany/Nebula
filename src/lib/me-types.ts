// Forme de la réponse de GET /api/me (bootstrap de l'application connectée),
// partagée entre la route et bootstrap-provider.tsx côté client.
import type { Plan } from "@/lib/plans";
import type { Network } from "@/lib/types";

export interface MeResponse {
  /** hasPassword : faux pour un compte ouvert avec Google / Apple / Facebook
   *  qui n'a jamais défini de mot de passe Nebula (Paramètres → Compte). */
  user: { id: string; name: string; email: string; avatarUrl: string | null; emailVerified: boolean; hasPassword: boolean };
  plan: Plan;
  maxBrands: number;
  brandsOwned: number;
  billingEnabled: boolean;
  /** Recharges Rétention achetables (Stripe et STRIPE_PRICE_RETENTION_PACK configurés). */
  retentionPacksOpen: boolean;
  isOwner: boolean;
  /** Progression des easter eggs (section « Succès » de la page Réussites). */
  eggs: { found: number; total: number };
  /** Niveau de créateur (mini-jauge du menu) et nouveautés non vues (compteur « Réussites »). */
  reussites: { level: number; name: string; pct: number; xp: number; nextXp: number | null; unseen: number };
  previewPlan: Plan | null;
  theme: string;
  background: string;
  mode: "dark" | "light";
  focusMode: boolean;
  notifyOnFailure: boolean;
  starfield: { enabled: boolean; allowed: boolean };
  cosmetics: { enabled: string[]; allowedKeys: string[] };
  whiteLabel: { brandName: string | null; logoUrl: string | null };
  // --- Brief growth (lots G2/G3/G7) ---
  /** Essai en cours (palier « Essai », TRIAL, sans abonnement — lot E1). */
  onTrial: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  /** Modale « essai terminé » à afficher une seule fois. */
  trialEndedNoticeDue: boolean;
  /** Abonnement payant actif (hors pause). */
  paid: boolean;
  pausedUntil: string | null;
  /** Accès offert (partenaire) en vigueur : { until } (null = sans limite), sinon null. */
  comp: { until: string | null } | null;
  /** Offre de bienvenue -50 % (mensuel) : fin, ou null si absente/utilisée. */
  offerExpiresAt: string | null;
  /** Mois de Pro offerts en attente (badge apporteur, parrainage). */
  bonusMonths: number;
  /** Rappel annuel : ≥ 3 factures mensuelles payées. */
  annualNudge: boolean;
  lifecycleEmails: boolean;
  /** Accord facultatif aux statistiques anonymes (29/09/2026) et date du dernier choix. */
  statsConsent: boolean;
  statsConsentAt: string | null;
  /** Préférences d'affichage suivies d'un appareil à l'autre (voir src/lib/ui-prefs.ts). */
  uiPrefs: Record<string, unknown>;
  referralPromptsSeen: string[];
  referralCode: string | null;
  /** Réseaux proposés dans l'application (clés configurées, voir network-availability.ts). */
  networks: Network[];
  // --- Brief « Essai 14 jours » (lots E1 à E4, U4, U5) ---
  /**
   * IA : adresse confirmée (Gratuit et Essai l'exigent), âge confirmé (18 ans
   * et plus, obligatoire) et quotas par type — textes par jour, le reste par
   * mois (ou sur la durée de l'essai), analyses Rétention achetées.
   */
  ai: { emailConfirmed: boolean; ageConfirmed: boolean; quota: AiQuotaView };
  /** Essai refusé à l'inscription (adresse ou réseau déjà utilisés, adresse jetable). */
  trialDenied: { reason: string } | null;
  /** Fin d'essai : marque active choisie et date du prochain changement possible. */
  freeActiveBrandId: string | null;
  activeBrandChangeableAt: string | null;
  /** Nombre de marques en veille (palier Gratuit après l'essai). */
  dormantBrands: number;
  /** Payant : brouillons de la fin d'essai qui peuvent repartir à leur date d'origine. */
  reschedulable: number;
  /** Visite guidée : terminée (ou passée), sinon étape où la reprendre. */
  tour: { completed: boolean; step: number };
  /** Sons de l'interface (Paramètres → Apparence & Succès). */
  uiSounds: boolean;
}

export type AiQuotaKind = "text" | "image" | "studio" | "assistant" | "retention";

export interface AiQuotaEntryView {
  limit: number;
  used: number;
  remaining: number;
  /** « day » (textes), « month », ou « trial » (toute la durée de l'essai). */
  per: "day" | "month" | "trial";
}

export type AiQuotaView = Record<AiQuotaKind, AiQuotaEntryView> & {
  retentionCredits: number;
  retentionPacks: boolean;
  /** Remise à zéro des quotas du mois (« AAAA-MM-01 »), null pendant un essai. */
  resetsOn: string | null;
};
