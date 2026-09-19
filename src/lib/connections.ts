import { prisma } from "@/lib/prisma";
import type { Network } from "@/lib/types";
import type { OAuthTokenResult } from "@/lib/social/base";

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

export function encodeOAuthState(payload: Record<string, unknown>): string {
  // NOTE : pour la production, signez cet état (ex: JWT court avec
  // NEXTAUTH_SECRET) pour empêcher qu'un tiers ne forge une redirection
  // OAuth avec un brandId arbitraire (protection CSRF/confused-deputy).
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeOAuthState<T = Record<string, unknown>>(state: string): T {
  return JSON.parse(Buffer.from(state, "base64url").toString());
}
