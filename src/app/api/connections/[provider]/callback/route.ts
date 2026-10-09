import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertBrandMembership } from "@/lib/brand-access";
import { getSocialClient } from "@/lib/social";
import { exchangeMetaCode } from "@/lib/social/meta";
import { decodeOAuthState, upsertConnection } from "@/lib/connections";
import { assertConnectionAllowed } from "@/lib/billing/connection-limit";
import type { Network } from "@/lib/types";

const PROVIDER_TO_NETWORK: Record<string, Network> = {
  tiktok: "TIKTOK",
  youtube: "YOUTUBE",
  threads: "THREADS",
  pinterest: "PINTEREST",
  linkedin: "LINKEDIN"
};

/** Instagram et Facebook : même connexion Meta (voir metaRedirectUri). */
const META_PROVIDERS = ["facebook", "instagram"];

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
  // Réseau demandé au départ (/start). Meta revient sur UNE seule adresse,
  // /api/connections/meta/callback (META_REDIRECT_URI) : le réseau voulu,
  // Instagram ou Facebook, est alors celui de l'état signé. Les anciennes
  // adresses /instagram/callback et /facebook/callback restent acceptées.
  let provider: string;
  try {
    const state = decodeOAuthState<{ brandId: string; provider?: string; userId?: string }>(stateRaw);
    if (state.userId !== userId) throw new Error("mismatch");
    const viaMeta = params.provider === "meta" && typeof state.provider === "string" && META_PROVIDERS.includes(state.provider);
    if (!viaMeta && state.provider !== params.provider) throw new Error("mismatch");
    provider = state.provider as string;
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
    // Limite de comptes du palier (09/10/2026, connection-limit.ts) : vérifiée
    // compte par compte, après l'autorisation, quand on sait QUEL compte
    // arrive. Reconnecter un compte déjà relié passe toujours ; un nouveau
    // compte seulement s'il tient dans le palier (avant : refus global dès
    // la limite atteinte, même pour une simple reconnexion).
    if (META_PROVIDERS.includes(provider)) {
      // Facebook et Instagram partagent la même boîte de dialogue OAuth Meta
      // (une autorisation retourne les deux à la fois), mais on ne crée ici
      // que les comptes du réseau que la personne a explicitement demandé de
      // connecter — voir src/lib/providers.ts pour le contexte.
      const { instagramAccounts, facebookPages } = await exchangeMetaCode(code);
      const network = provider === "facebook" ? "FACEBOOK" : "INSTAGRAM";
      const accounts = provider === "facebook" ? facebookPages : instagramAccounts;
      if (accounts.length === 0) {
        throw new Error(
          provider === "facebook"
            ? "Aucune Page Facebook n'a été trouvée pour cet utilisateur."
            : "Aucun compte Instagram Business/Creator (lié à une Page Facebook) n'a été trouvé pour cet utilisateur."
        );
      }
      let added = 0;
      let refusal: string | null = null;
      for (const account of accounts) {
        try {
          await assertConnectionAllowed(brandId, network, account.externalAccountId);
        } catch (err) {
          refusal = (err as Error).message;
          continue;
        }
        await upsertConnection(brandId, network, account);
        added += 1;
      }
      if (added === 0 && refusal) throw new Error(refusal);
      redirectTo.searchParams.set("count", String(added));
      if (refusal) {
        redirectTo.searchParams.set("error", `${accounts.length - added} compte(s) non ajouté(s). ${refusal}`);
        return NextResponse.redirect(redirectTo);
      }
    } else {
      const network = PROVIDER_TO_NETWORK[provider];
      if (!network) throw new Error("Fournisseur inconnu.");
      const token = await getSocialClient(network).exchangeCodeForToken(code);
      await assertConnectionAllowed(brandId, network, token.externalAccountId);
      await upsertConnection(brandId, network, token);
    }
  } catch (err) {
    redirectTo.searchParams.set("error", (err as Error).message);
    return NextResponse.redirect(redirectTo);
  }

  redirectTo.searchParams.set("connected", provider);
  return NextResponse.redirect(redirectTo);
}
