import { prisma } from "@/lib/prisma";
import type { Network } from "@/lib/types";
import type { OAuthTokenResult } from "@/lib/social/base";
import { createHmac, timingSafeEqual } from "crypto";

export async function upsertConnection(brandId: string, network: Network, token: OAuthTokenResult) {
  return prisma.socialConnection.upsert({
    where: {
      brandId_network_externalAccountId: {
        brandId,
        network,
        externalAccountId: token.externalAccountId
      }
    },
    update: {
      displayName: token.displayName,
      handle: token.handle,
      avatarUrl: token.avatarUrl,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? undefined,
      tokenExpiresAt: token.expiresAt,
      scopes: token.scopes,
      status: "CONNECTED",
      lastError: null,
      lastSyncedAt: new Date()
    },
    create: {
      brandId,
      network,
      externalAccountId: token.externalAccountId,
      displayName: token.displayName,
      handle: token.handle,
      avatarUrl: token.avatarUrl,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt: token.expiresAt,
      scopes: token.scopes
    }
  });
}

// État OAuth SIGNÉ (HMAC-SHA256 avec NEXTAUTH_SECRET) et daté : le
// paramètre `state` transite par le navigateur et par le fournisseur OAuth,
// donc un tiers pouvait auparavant en forger un avec le brandId d'une autre
// marque et y rattacher son propre compte social (confused deputy). Le
// callback refuse tout état dont la signature ne correspond pas ou qui a
// plus de OAUTH_STATE_TTL_MS.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function oauthStateSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET manquant : impossible de signer l'état OAuth.");
  return secret;
}

function signOAuthPayload(encoded: string): string {
  return createHmac("sha256", oauthStateSecret()).update(encoded).digest("base64url");
}

export function encodeOAuthState(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString("base64url");
  return `${encoded}.${signOAuthPayload(encoded)}`;
}

export function decodeOAuthState<T = Record<string, unknown>>(state: string): T {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) throw new Error("État OAuth invalide.");
  const expected = signOAuthPayload(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("État OAuth invalide.");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as T & { iat?: number };
  if (typeof payload.iat !== "number" || Date.now() - payload.iat > OAUTH_STATE_TTL_MS) {
    throw new Error("État OAuth expiré : relancez la connexion du compte.");
  }
  return payload;
}
