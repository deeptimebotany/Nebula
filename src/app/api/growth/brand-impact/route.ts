import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";

// GET /api/growth/brand-impact?brandId= — « Votre page bio a amené N
// visiteurs et M inscriptions sur Nebula » (brief growth, lot G1.a) :
// clics sur le badge / les blocs de conversion portant le slug de la
// marque (GrowthEvent) et comptes créés avec ce slug en acquisition
// (User.acqVia). Justifie le badge et prépare le parrainage.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { slug: true } });
  if (!brand) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });

  const [visits, signups, paid] = await Promise.all([
    prisma.growthEvent.count({ where: { name: { in: ["badge_click", "conversion_block_click"] }, meta: { path: ["via"], equals: brand.slug } } }),
    prisma.user.count({ where: { acqVia: brand.slug } }),
    prisma.user.count({ where: { acqVia: brand.slug, firstPaidAt: { not: null } } })
  ]);

  return NextResponse.json({ slug: brand.slug, visits, signups, paid });
}
