import { NextRequest, NextResponse } from "next/server";
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

  let brandId: string;
  try {
    const state = decodeOAuthState<{ brandId: string }>(stateRaw);
    brandId = state.brandId;
  } catch {
    redirectTo.searchParams.set("error", "État OAuth invalide.");
    return NextResponse.redirect(redirectTo);
  }

  try {
    await assertConnectionQuota(brandId);
    if (params.provider === "meta") {
      const { instagramAccounts, facebookPages } = await exchangeMetaCode(code);
      for (const ig of instagramAccounts) await upsertConnection(brandId, "INSTAGRAM", ig);
      for (const fb of facebookPages) await upsertConnection(brandId, "FACEBOOK", fb);
      if (instagramAccounts.length === 0 && facebookPages.length === 0) {
        throw new Error("Aucun compte Instagram/Facebook éligible n'a été trouvé pour cet utilisateur.");
      }
      redirectTo.searchParams.set("count", String(instagramAccounts.length + facebookPages.length));
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
