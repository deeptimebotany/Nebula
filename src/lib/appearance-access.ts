// Droits d'accès aux options d'apparence (thème étoilé, cosmétiques) pour un
// compte donné — logique auparavant dupliquée dans /api/settings/starfield et
// /api/settings/cosmetics, désormais partagée avec /api/me (voir ce fichier)
// qui charge TOUTES les préférences du compte en une seule requête au
// démarrage de l'application.
//
// Règle commune : le droit reflète le PALIER ACTUEL (revérifié à chaque
// appel), jamais seulement la préférence enregistrée. Le compte propriétaire
// (voir dev-preview.ts) voit tout déverrouillé, sauf s'il a choisi un aperçu
// de palier précis — auquel cas il est traité exactement comme ce palier.
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/billing/plan";
import { COSMETICS, canUseCosmetic } from "@/lib/cosmetics";
import { isOwnerEmail, resolvePreviewPlan } from "@/lib/dev-preview";
import type { Plan } from "@/lib/plans";

export interface AppearanceAccess {
  /** Palier réel du compte (jamais simulé). */
  plan: Plan;
  /** Palier utilisé pour les droits d'apparence (aperçu ou « tout déverrouillé » pour le propriétaire). */
  effectivePlan: Plan | "ALL";
  isOwner: boolean;
  previewPlan: Plan | null;
  starfieldAllowed: boolean;
  /** Clés de cosmétiques activables maintenant (palier OU easter egg trouvé). */
  cosmeticsAllowedKeys: string[];
}

async function eggAllowedKeys(userId: string): Promise<string[]> {
  const eggGated = COSMETICS.filter((c) => c.requiresEgg);
  if (eggGated.length === 0) return [];
  const foundRows: { key: string }[] = await prisma.easterEggFound.findMany({
    where: { userId, key: { in: eggGated.map((c) => c.requiresEgg as string) } },
    select: { key: true }
  });
  const foundSet = new Set(foundRows.map((f) => f.key));
  return eggGated.filter((c) => foundSet.has(c.requiresEgg as string)).map((c) => c.key);
}

export async function getAppearanceAccess(userId: string, email: string | null | undefined): Promise<AppearanceAccess> {
  const isOwner = isOwnerEmail(email);
  const previewPlan = isOwner ? resolvePreviewPlan(email) : null;
  const [{ plan }, eggKeys] = await Promise.all([getUserPlan(userId), eggAllowedKeys(userId)]);

  const effectivePlan: Plan | "ALL" = isOwner && !previewPlan ? "ALL" : (previewPlan ?? plan);
  const starfieldAllowed = effectivePlan === "ALL" || effectivePlan === "PRO" || effectivePlan === "AGENCY";
  const cosmeticsAllowedKeys =
    effectivePlan === "ALL"
      ? COSMETICS.map((c) => c.key)
      : [...COSMETICS.filter((c) => canUseCosmetic(c, effectivePlan)).map((c) => c.key), ...eggKeys];

  return { plan, effectivePlan, isOwner, previewPlan, starfieldAllowed, cosmeticsAllowedKeys };
}
