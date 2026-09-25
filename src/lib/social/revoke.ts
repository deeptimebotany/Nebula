// Déconnexion propre d'un compte social (lot 2, fiabilité).
//
// Avant, « Déconnecter » changeait seulement le statut : les jetons restaient
// en base, n'étaient pas révoqués, et les publications déjà programmées
// partaient quand même. Désormais :
//  - les jetons sont effacés de la base ;
//  - l'accès est retiré chez le réseau quand c'est possible SANS toucher aux
//    autres connexions (voir revokeAtProvider) ;
//  - la publication refuse un compte déconnecté (voir lib/publish.ts).
import { prisma } from "@/lib/prisma";
import type { Network } from "@/lib/types";
import { sendRequest } from "./base";
import { deleteBlueskySession } from "./bluesky";

type ConnectionRow = {
  id: string;
  brandId: string;
  network: string;
  externalAccountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string;
  status: string;
};

async function postForm(network: Network, url: string, params: Record<string, string>): Promise<boolean> {
  const res = await sendRequest(network, url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
    timeoutMs: 15_000
  });
  return res.ok;
}

/**
 * Retire l'accès chez le réseau. Prudence : une révocation chez Meta ou
 * Google retire TOUTE l'autorisation de la personne, donc aussi ses autres
 * comptes connectés (autres Pages, autres chaînes, autres marques). On ne
 * révoque donc que si aucune autre connexion ne peut en dépendre :
 *  - TikTok : jeton propre à ce compte, sauf s'il est connecté à une autre marque ;
 *  - YouTube : sauf si le propriétaire de la marque a une autre chaîne connectée ;
 *  - Bluesky : on ferme seulement la session de cette connexion ;
 *  - Meta (Facebook, Instagram), Threads, Pinterest, LinkedIn : pas de
 *    révocation à distance (autorisation partagée entre plusieurs comptes,
 *    ou pas d'API prévue pour ça) — les jetons sont quand même effacés de
 *    Nebula, et la personne peut retirer l'application dans les réglages du
 *    réseau.
 */
export async function revokeAtProvider(connection: ConnectionRow): Promise<boolean> {
  const network = connection.network as Network;
  const sameAccountElsewhere = await prisma.socialConnection.count({
    where: { id: { not: connection.id }, network, externalAccountId: connection.externalAccountId, status: { not: "DISCONNECTED" } }
  });
  if (sameAccountElsewhere > 0) return false;

  if (network === "TIKTOK") {
    const key = process.env.TIKTOK_CLIENT_KEY;
    const secret = process.env.TIKTOK_CLIENT_SECRET;
    if (!key || !secret || !connection.accessToken) return false;
    return postForm("TIKTOK", "https://open.tiktokapis.com/v2/oauth/revoke/", { client_key: key, client_secret: secret, token: connection.accessToken });
  }

  if (network === "YOUTUBE") {
    const owners = await prisma.membership.findMany({ where: { brandId: connection.brandId, role: "OWNER" }, select: { userId: true } });
    const otherChannels = await prisma.socialConnection.count({
      where: {
        id: { not: connection.id },
        network: "YOUTUBE",
        status: { not: "DISCONNECTED" },
        brand: { memberships: { some: { role: "OWNER", userId: { in: owners.map((o: { userId: string }) => o.userId) } } } }
      }
    });
    if (otherChannels > 0) return false;
    const token = connection.refreshToken || connection.accessToken;
    if (!token) return false;
    return postForm("YOUTUBE", "https://oauth2.googleapis.com/revoke", { token });
  }

  if (network === "BLUESKY") {
    await deleteBlueskySession(connection);
    return true;
  }

  return false;
}

/** Déconnecte un compte : révocation (si possible), jetons effacés, statut DISCONNECTED. */
export async function disconnectConnection(connectionId: string): Promise<{ revoked: boolean }> {
  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection) return { revoked: false };
  let revoked = false;
  if (connection.status !== "DISCONNECTED") {
    revoked = await revokeAtProvider(connection).catch((err: Error) => {
      console.warn(`[déconnexion] révocation ${connection.network} impossible :`, err.message);
      return false;
    });
  }
  await prisma.socialConnection.update({
    where: { id: connectionId },
    data: { status: "DISCONNECTED", accessToken: "", refreshToken: null, tokenExpiresAt: null, lastError: null }
  });
  return { revoked };
}
