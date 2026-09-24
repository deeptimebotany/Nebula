// Forme de la réponse de GET /api/me (bootstrap de l'application connectée),
// partagée entre la route et bootstrap-provider.tsx côté client.
import type { Plan } from "@/lib/plans";
import type { Network } from "@/lib/types";

export interface MeResponse {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  plan: Plan;
  maxBrands: number;
  brandsOwned: number;
  billingEnabled: boolean;
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
  /** Essai Pro applicatif en cours (palier effectif = PRO sans abonnement). */
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
  referralPromptsSeen: string[];
  referralCode: string | null;
  /** Réseaux proposés dans l'application (clés configurées, voir network-availability.ts). */
  networks: Network[];
}
