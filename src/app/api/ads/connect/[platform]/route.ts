import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { encodeOAuthState } from "@/lib/connections";
import { adsAccessFor } from "@/lib/ads/access";
import { isAdPlatformConfigured } from "@/lib/ads/config";
import { getAdsClient } from "@/lib/ads";
import { platformFromSlug } from "@/lib/ads/types";
import { adAccountDb } from "@/lib/prisma-extra";

export const dynamic = "force-dynamic";

function back(req: NextRequest, error: string) {
  const url = new URL("/analytics", req.url);
  url.searchParams.set("tab", "ads");
  url.searchParams.set("adsError", error);
  return NextResponse.redirect(url);
}

// GET /api/ads/connect/google|meta|tiktok?brandId= — départ de l'autorisation.
export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));
  const userId = (session.user as { id: string }).id;
  const platform = platformFromSlug(params.platform);
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!platform || !brandId) return back(req, "Lien de connexion invalide.");
  if (!isAdPlatformConfigured(platform)) return back(req, "Cette régie n'est pas encore disponible sur Nebula.");

  const access = await adsAccessFor(userId, brandId);
  if (!access) return back(req, "Marque introuvable.");
  if (!access.allowed) return back(req, "Le suivi publicitaire est inclus dans les formules Pro et Agence.");
  if (!access.canManage) return back(req, "Seuls le propriétaire et les éditeurs de la marque peuvent connecter un compte publicitaire.");
  // Limite atteinte : on laisse quand même passer une RECONNEXION (compte
  // de cette régie déjà suivi, dont le jeton a expiré).
  const [count, samePlatform] = await Promise.all([adAccountDb.count({ where: { brandId } }), adAccountDb.count({ where: { brandId, platform } })]);
  if (count >= access.maxAccounts && samePlatform === 0) {
    return back(req, `Limite atteinte : ${access.maxAccounts} comptes publicitaires par marque avec votre formule.`);
  }

  const state = encodeOAuthState({ userId, brandId, platform, kind: "ads" });
  try {
    return NextResponse.redirect(getAdsClient(platform).authUrl(state));
  } catch (err) {
    return back(req, (err as Error).message);
  }
}
