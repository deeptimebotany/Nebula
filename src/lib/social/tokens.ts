// Renouvellement des jetons sans « course » (lot 2, fiabilité).
//
// Deux traitements (le cron et une synchronisation lancée à la main, par
// exemple) pouvaient renouveler le même jeton en même temps : le second
// utilisait un jeton de rafraîchissement déjà remplacé, recevait
// « invalid_grant »… et effaçait le NOUVEAU jeton valide que le premier
// venait d'enregistrer : la connexion passait « expirée » pour rien.
// Désormais, avant de conclure à une connexion expirée, on relit la base :
// si le jeton a changé entre-temps, on utilise le nouveau.
import { prisma } from "@/lib/prisma";
import type { ConnectionLike } from "./base";

/**
 * Vrai si un autre traitement a renouvelé le jeton depuis qu'on l'a lu :
 * `connection` reçoit alors les nouveaux jetons.
 */
export async function adoptConcurrentRefresh(connection: ConnectionLike, usedRefreshToken: string | null): Promise<boolean> {
  const row = await prisma.socialConnection.findUnique({
    where: { id: connection.id },
    select: { accessToken: true, refreshToken: true, tokenExpiresAt: true }
  });
  if (!row) return false;
  const changed = row.refreshToken !== usedRefreshToken && Boolean(row.refreshToken || row.accessToken !== connection.accessToken);
  if (!changed) return false;
  connection.accessToken = row.accessToken;
  connection.refreshToken = row.refreshToken;
  connection.tokenExpiresAt = row.tokenExpiresAt;
  return true;
}
