// Droits d'accès à l'API et aux webhooks (lot 4) : réservés au palier
// Agence (le compte propriétaire y a toujours accès), revérifiés à CHAQUE
// requête — un compte qui perd l'Agence perd l'API immédiatement.
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/billing/plan";
import { isOwnerEmail } from "@/lib/dev-preview";

export async function hasApiAccess(userId: string): Promise<boolean> {
  const [plan, user] = await Promise.all([getUserPlan(userId), prisma.user.findUnique({ where: { id: userId }, select: { email: true } })]);
  return plan.plan === "AGENCY" || isOwnerEmail(user?.email);
}

export interface BrandAccess {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/** Marques accessibles à ce compte (éventuellement limitées à une seule par la clé). */
export async function accessibleBrands(userId: string, onlyBrandId?: string | null): Promise<BrandAccess[]> {
  const rows = await prisma.membership.findMany({
    where: { userId, ...(onlyBrandId ? { brandId: onlyBrandId } : {}) },
    select: { role: true, brand: { select: { id: true, name: true, slug: true } } },
    orderBy: { brand: { name: "asc" } }
  });
  return (rows as { role: string; brand: { id: string; name: string; slug: string } }[]).map((r) => ({ ...r.brand, role: r.role }));
}

export const canWrite = (role: string) => role === "OWNER" || role === "EDITOR";
