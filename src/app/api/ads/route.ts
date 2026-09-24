import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { adsAccessFor } from "@/lib/ads/access";
import { buildAdsSummary } from "@/lib/ads/summary";
import { AD_PLATFORMS, AD_PLATFORM_META } from "@/lib/ads/types";
import { isAdPlatformConfigured } from "@/lib/ads/config";
import { adAccountDb } from "@/lib/prisma-extra";

export const dynamic = "force-dynamic";

// GET /api/ads?brandId=&days=7|30|90&currency= — onglet Publicité d'Analytics.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const q = req.nextUrl.searchParams;
  const brandId = q.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const access = await adsAccessFor(userId, brandId);
  if (!access) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

  const anyConfigured = AD_PLATFORMS.some(isAdPlatformConfigured);
  const base = {
    enabled: anyConfigured,
    configured: AD_PLATFORMS.filter(isAdPlatformConfigured).map((p) => AD_PLATFORM_META[p].label),
    plan: access.plan,
    allowed: access.allowed,
    canManage: access.canManage,
    maxAccounts: access.maxAccounts
  };
  // Palier gratuit : pas de chiffres, seulement de quoi afficher l'offre
  // (les données déjà synchronisées restent en base si la marque repasse Pro).
  // ?probe=1 : juste savoir s'il faut afficher l'onglet (page Analytics).
  if (q.get("probe")) return NextResponse.json(base);
  if (!anyConfigured || !access.allowed) {
    const accountsCount = anyConfigured ? await adAccountDb.count({ where: { brandId } }) : 0;
    return NextResponse.json({ ...base, summary: null, accountsCount });
  }
  const summary = await buildAdsSummary(brandId, Number(q.get("days")) || 30, q.get("currency"));
  return NextResponse.json({ ...base, summary });
}
