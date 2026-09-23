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
}
