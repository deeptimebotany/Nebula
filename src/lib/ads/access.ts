// Droits sur le suivi publicitaire (lot 5) : tous les membres d'une marque
// voient les chiffres, seuls le propriétaire et les éditeurs connectent ou
// retirent des comptes. Palier Pro (3 comptes pub par marque) ou Agence
// (50) — celui du propriétaire de la marque, comme pour le reste. Le compte
// propriétaire de Nebula a toujours accès (ou le palier qu'il simule).
import { prisma } from "@/lib/prisma";
import { getBrandPlan } from "@/lib/billing/plan";
import { ownerUnlocksAll, resolvePreviewPlan } from "@/lib/dev-preview";
import type { Plan } from "@/lib/plans";
import { maxAdAccounts } from "./config";

export interface AdsAccess {
  role: string;
  plan: Plan;
  allowed: boolean;
  canManage: boolean;
  maxAccounts: number;
}

export async function adsAccessFor(userId: string, brandId: string): Promise<AdsAccess | null> {
  const membership = await prisma.membership.findUnique({ where: { userId_brandId: { userId, brandId } }, select: { role: true } });
  if (!membership) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  let plan: Plan;
  // Compte propriétaire : « Tout déverrouillé » = Agence, aperçu = palier
  // simulé, mode réel (défaut) = son vrai palier (voir dev-preview.ts).
  const preview = resolvePreviewPlan(user?.email);
  if (ownerUnlocksAll(user?.email)) {
    plan = "AGENCY";
  } else if (preview) {
    plan = preview;
  } else {
    plan = (await getBrandPlan(brandId)).plan;
  }
  const maxAccounts = maxAdAccounts(plan);
  const role = membership.role as string;
  return { role, plan, allowed: maxAccounts > 0, canManage: maxAccounts > 0 && (role === "OWNER" || role === "EDITOR"), maxAccounts };
}
