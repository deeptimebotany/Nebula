import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertBrandMembership } from "@/lib/brand-access";
import { getSocialClient } from "@/lib/social";
import { exchangeMetaCode } from "@/lib/social/meta";
import { decodeOAuthState, upsertConnection } from "@/lib/connections";
import { assertConnectionQuota } from "@/lib/billing/plan";
import type { Network } from "@/lib/types";

const PROVIDER_TO_NETWORK: Record<string, Network> = {
  tiktok: "TIKTOK",
  youtube: "YOUTUBE"
};

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error_description") || req.nextUrl.searchParams.get("error");

  const redirectTo = new URL("/accounts", req.url);

  if (oauthError) {
    redirectTo.searchParams.set("error", oauthError);
    return NextResponse.redirect(redirectTo);
  }
  if (!code || !stateRaw) {
    redirectTo.searchParams.set("error", "Code ou état OAuth manquant.");
    return NextResponse.redirect(redirectTo);
  }

  // Le retour OAuth doit venir de la MÊME personne connectée que le départ
  // (état signé, voir lib/connections.ts) et cette personne doit toujours
  // être membre de la marque visée.
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));
  const userId = (session.user as { id: string }).id;

  let brandId: string;
  try {
    const state = decodeOAuthState<{ brandId: string; provider?: string; userId?: string }>(stateRaw);
    if (state.userId !== userId || state.provider !== params.provider) throw new Error("mismatch");
    brandId = state.brandId;
  } catch (err) {
    const message = err instanceof Error && err.message.startsWith("État OAuth expiré") ? err.message : "État OAuth invalide.";
    redirectTo.searchParams.set("error", message);
    return NextResponse.redirect(redirectTo);
  }
  if (!(await assertBrandMembership(userId, brandId))) {
    redirectTo.searchParams.set("error", "Marque introuvable.");
    return NextResponse.redirect(redirectTo);
  }

  try {
    await assertConnectionQuota(brandId);
    if (params.provider === "facebook" || params.provider === "instagram") {
      // Facebook et Instagram partagent la même boîte de dialogue OAuth Meta
      // (une autorisation retourne les deux à la fois), mais on ne crée ici
      // que les comptes du réseau que la personne a explicitement demandé de
      // connecter — voir src/lib/providers.ts pour le contexte.
      const { instagramAccounts, facebookPages } = await exchangeMetaCode(code);
      if (params.provider === "facebook") {
        for (const fb of facebookPages) await upsertConnection(brandId, "FACEBOOK", fb);
        if (facebookPages.length === 0) {
          throw new Error("Aucune Page Facebook n'a été trouvée pour cet utilisateur.");
        }
        redirectTo.searchParams.set("count", String(facebookPages.length));
      } else {
        for (const ig of instagramAccounts) await upsertConnection(brandId, "INSTAGRAM", ig);
        if (instagramAccounts.length === 0) {
          throw new Error(
            "Aucun compte Instagram Business/Creator (lié à une Page Facebook) n'a été trouvé pour cet utilisateur."
          );
        }
        redirectTo.searchParams.set("count", String(instagramAccounts.length));
      }
    } else {
      const network = PROVIDER_TO_NETWORK[params.provider];
      if (!network) throw new Error("Fournisseur inconnu.");
      const token = await getSocialClient(network).exchangeCodeForToken(code);
      await upsertConnection(brandId, network, token);
    }
  } catch (err) {
    redirectTo.searchParams.set("error", (err as Error).message);
    return NextResponse.redirect(redirectTo);
  }

  redirectTo.searchParams.set("connected", params.provider);
  return NextResponse.redirect(redirectTo);
}
