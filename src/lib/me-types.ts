// Forme de la réponse de GET /api/me (bootstrap de l'application connectée),
// partagée entre la route et bootstrap-provider.tsx côté client.
import type { Plan } from "@/lib/plans";

export interface MeResponse {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  plan: Plan;
  maxBrands: number;
  brandsOwned: number;
  billingEnabled: boolean;
  isOwner: boolean;
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
  /** Offre de bienvenue -50 % (mensuel) : fin, ou null si absente/utilisée. */
  offerExpiresAt: string | null;
  /** Mois de Pro offerts en attente (badge apporteur, parrainage). */
  bonusMonths: number;
  /** Rappel annuel : ≥ 3 factures mensuelles payées. */
  annualNudge: boolean;
  lifecycleEmails: boolean;
  referralPromptsSeen: string[];
  referralCode: string | null;
}
