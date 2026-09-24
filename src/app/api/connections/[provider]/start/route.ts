import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { getSocialClient } from "@/lib/social";
import { instagramClient } from "@/lib/social/meta";
import { encodeOAuthState } from "@/lib/connections";
import type { Network } from "@/lib/types";
import { isNetworkConfigured } from "@/lib/network-availability";

const PROVIDER_TO_NETWORK: Record<string, Network> = {
  tiktok: "TIKTOK",
  youtube: "YOUTUBE",
  threads: "THREADS",
  pinterest: "PINTEREST",
  linkedin: "LINKEDIN"
};

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  }

  // On ne peut connecter un compte social qu'à une de SES marques ; l'état
  // signé embarque aussi l'identifiant de l'utilisateur, revérifié au retour.
  const userId = (session.user as { id: string }).id;
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  // Bluesky : pas de page d'autorisation, un formulaire « mot de passe
  // d'application » dans Nebula (voir src/lib/social/bluesky.ts).
  if (params.provider === "bluesky") {
    const form = new URL("/accounts/bluesky", req.url);
    form.searchParams.set("brandId", brandId);
    return NextResponse.redirect(form);
  }

  // Réseaux du lot 2 : refusés tant que leurs clés ne sont pas configurées.
  const lot2 = PROVIDER_TO_NETWORK[params.provider];
  if (lot2 && !isNetworkConfigured(lot2)) {
    const back = new URL("/accounts", req.url);
    back.searchParams.set("error", "Ce réseau n'est pas encore disponible sur Nebula.");
    return NextResponse.redirect(back);
  }

  const state = encodeOAuthState({ brandId, provider: params.provider, userId });

  try {
    const authUrl =
      params.provider === "facebook" || params.provider === "instagram"
        ? instagramClient.getAuthUrl(state) // OAuth Meta partagé Instagram + Facebook, même URL pour les deux
        : getSocialClient(PROVIDER_TO_NETWORK[params.provider]).getAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    const back = new URL("/accounts", req.url);
    back.searchParams.set("error", (err as Error).message);
    return NextResponse.redirect(back);
  }
}
