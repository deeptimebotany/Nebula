import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSocialClient } from "@/lib/social";
import { instagramClient } from "@/lib/social/meta";
import { encodeOAuthState } from "@/lib/connections";
import type { Network } from "@/lib/types";

const PROVIDER_TO_NETWORK: Record<string, Network> = {
  tiktok: "TIKTOK",
  youtube: "YOUTUBE"
};

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  }

  const state = encodeOAuthState({ brandId, provider: params.provider });

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
