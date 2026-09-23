import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { isAiEnabled } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";

// GET /api/ai/status?brandId=... — l'UI l'appelle une fois pour savoir si
// elle doit afficher les boutons IA (clé Gemini configurée par l'hébergeur
// ET palier payant actif pour cette marque).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const keyConfigured = isAiEnabled();
  const { plan, limits } = await getBrandPlan(brandId);

  return NextResponse.json({
    enabled: keyConfigured && limits.aiEnabled,
    keyConfigured,
    plan,
    planAllowsAi: limits.aiEnabled
  });
}
