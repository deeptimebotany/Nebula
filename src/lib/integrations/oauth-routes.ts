// Départ et retour OAuth communs à Canva et OneDrive (lot 3). L'état signé
// (lib/connections.ts) porte l'utilisateur et la page où revenir ; le
// vérificateur PKCE de Canva voyage dans un cookie httpOnly de 10 minutes,
// jamais dans l'URL.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { encodeOAuthState, decodeOAuthState } from "@/lib/connections";
import { createPkce, saveIntegration, type IntegrationProvider, type TokenSet } from "./oauth-accounts";

const PKCE_COOKIE = "nb_int_pkce";

function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/composer";
}

export async function startIntegrationOAuth(
  req: NextRequest,
  provider: IntegrationProvider,
  buildUrl: (state: string, challenge: string) => string
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));
  const userId = (session.user as { id: string }).id;
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const { verifier, challenge } = createPkce();
  try {
    const url = buildUrl(encodeOAuthState({ userId, provider, returnTo }), challenge);
    const res = NextResponse.redirect(url);
    res.cookies.set({
      name: PKCE_COOKIE,
      value: `${provider}:${verifier}`,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/api/integrations/${provider}`,
      maxAge: 600
    });
    return res;
  } catch (err) {
    const back = new URL(returnTo, req.url);
    back.searchParams.set("integrationError", (err as Error).message);
    return NextResponse.redirect(back);
  }
}

export async function finishIntegrationOAuth(
  req: NextRequest,
  provider: IntegrationProvider,
  exchange: (code: string, verifier: string) => Promise<TokenSet>,
  displayName: (accessToken: string) => Promise<string | null>
): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const denied = req.nextUrl.searchParams.get("error_description") || req.nextUrl.searchParams.get("error");
  let returnTo = "/composer";
  const fail = (message: string) => {
    const back = new URL(returnTo, req.url);
    back.searchParams.set("integrationError", message);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: PKCE_COOKIE, path: `/api/integrations/${provider}` });
    return res;
  };

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));
  const userId = (session.user as { id: string }).id;

  let state: { userId?: string; provider?: string; returnTo?: string };
  try {
    state = decodeOAuthState(stateRaw || "");
  } catch (err) {
    return fail((err as Error).message);
  }
  returnTo = safeReturnTo(state.returnTo);
  if (state.userId !== userId || state.provider !== provider) return fail("Connexion invalide : relancez-la depuis Publier.");
  if (denied) return fail(denied);
  if (!code) return fail("Code d'autorisation manquant.");

  const cookie = req.cookies.get(PKCE_COOKIE)?.value ?? "";
  const verifier = cookie.startsWith(`${provider}:`) ? cookie.slice(provider.length + 1) : "";

  try {
    const tokens = await exchange(code, verifier);
    const name = await displayName(tokens.accessToken).catch(() => null);
    await saveIntegration(userId, provider, { ...tokens, displayName: name });
  } catch (err) {
    return fail((err as Error).message);
  }
  const back = new URL(returnTo, req.url);
  back.searchParams.set("integrationConnected", provider);
  const res = NextResponse.redirect(back);
  res.cookies.delete({ name: PKCE_COOKIE, path: `/api/integrations/${provider}` });
  return res;
}
