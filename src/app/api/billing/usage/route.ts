import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { getBrandUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

// GET /api/billing/usage?brandId=... — consommation réelle de la marque
// (publications ce mois, comptes connectés) et limites de son palier, avec
// les mêmes règles que les quotas appliqués côté serveur (voir
// src/lib/billing/usage.ts).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  return NextResponse.json(await getBrandUsage(brandId), { headers: { "Cache-Control": "no-store" } });
}
