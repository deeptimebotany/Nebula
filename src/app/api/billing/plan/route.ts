import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { getBrandPlan, getUserPlan, countOwnedBrands } from "@/lib/billing/plan";
import { isBillingEnabled } from "@/lib/billing/stripe";
import { PLAN_LIMITS } from "@/lib/plans";

// GET /api/billing/plan[?brandId=...] — avec brandId, résout le plan via le
// propriétaire de cette marque (comportement historique, utilisé par le
// composer/la quota bar/etc.) ; sans brandId, résout le plan du compte
// connecté directement (utilisé par la page Facturation, qui n'est plus
// liée à une marque précise).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  const userId = (session.user as { id: string }).id;

  // Avec brandId : la marque doit être une des marques de l'utilisateur
  // (sinon on révélerait le palier d'un autre compte).
  if (brandId) {
    const denied = await requireBrandMembership(userId, brandId);
    if (denied) return denied;
  }

  const { plan, limits, interval, maxBrands } = brandId ? await getBrandPlan(brandId) : await getUserPlan(userId);
  const brandsOwned = await countOwnedBrands(userId);

  return NextResponse.json({ plan, limits, interval, maxBrands, brandsOwned, billingEnabled: isBillingEnabled(), allPlans: PLAN_LIMITS });
}
