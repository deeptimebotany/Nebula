import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decodeOAuthState } from "@/lib/connections";
import { adsAccessFor } from "@/lib/ads/access";
import { isAdPlatformConfigured } from "@/lib/ads/config";
import { getAdsClient } from "@/lib/ads";
import { platformFromSlug } from "@/lib/ads/types";
import { pendingAdAuthDb } from "@/lib/prisma-extra";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toAnalytics(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/analytics", req.url);
  url.searchParams.set("tab", "ads");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

// Retour de Google / Meta / TikTok. Les comptes trouvés sont mis de côté
// (1 h maximum) le temps que l'utilisateur choisisse lesquels suivre, dans
// la fenêtre qui s'ouvre sur l'onglet Publicité.
export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));
  const userId = (session.user as { id: string }).id;
  const platform = platformFromSlug(params.platform);
  const q = req.nextUrl.searchParams;
  const fail = (message: string) => toAnalytics(req, { adsError: message });

  let state: { userId?: string; brandId?: string; platform?: string; kind?: string };
  try {
    state = decodeOAuthState(q.get("state") || "");
  } catch (err) {
    return fail((err as Error).message);
  }
  if (!platform || state.kind !== "ads" || state.platform !== platform || state.userId !== userId || !state.brandId) {
    return fail("Connexion invalide : relancez-la depuis Analytics.");
  }
  const denied = q.get("error_description") || q.get("error_message") || q.get("error");
  if (denied) return fail(denied === "access_denied" ? "Autorisation refusée." : denied);
  // TikTok renvoie auth_code (et code), Google et Meta renvoient code.
  const code = q.get("auth_code") || q.get("code");
  if (!code) return fail("Code d'autorisation manquant.");
  if (!isAdPlatformConfigured(platform)) return fail("Cette régie n'est pas encore disponible sur Nebula.");

  const access = await adsAccessFor(userId, state.brandId);
  if (!access?.canManage) return fail("Vous ne pouvez pas connecter de compte publicitaire à cette marque.");

  try {
    const { tokens, accounts } = await getAdsClient(platform).connect(code);
    if (accounts.length === 0) return fail("Aucun compte publicitaire accessible avec ce profil.");
    // Une seule autorisation en attente par personne et par régie.
    await pendingAdAuthDb.deleteMany({ where: { userId, platform } });
    const pending = await pendingAdAuthDb.create({
      data: {
        userId,
        brandId: state.brandId,
        platform,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        tokenExpiresAt: tokens.expiresAt ?? null,
        accounts: JSON.stringify(accounts.slice(0, 200))
      }
    });
    return toAnalytics(req, { adsPending: pending.id });
  } catch (err) {
    return fail((err as Error).message);
  }
}
