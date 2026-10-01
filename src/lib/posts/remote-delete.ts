// « Supprimer aussi sur … » (01/10/2026) : retire une publication des
// réseaux choisis, depuis la fiche d'une publication (voir
// /api/posts/[id] DELETE et social/remote-delete-support.ts).
//
// Règles :
//  - seulement les cibles de CETTE publication, en ligne (publiées, avec un
//    identifiant chez le réseau) et sur un réseau qui donne ce droit ;
//  - les réseaux sont appelés en parallèle (fonction limitée à 60 s) ;
//  - une publication déjà absente du réseau compte comme supprimée (une
//    nouvelle tentative après un échec partiel ne bloque jamais) ;
//  - chaque suppression réussie est notée dans la cible
//    (metadata.removedFromNetworkAt) : si un autre réseau échoue, la
//    publication reste dans Nebula et affiche ce qui a déjà été retiré.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSocialClient, SocialApiError } from "@/lib/social";
import { classifyProviderError } from "@/lib/social/errors";
import { flagConnectionForReconnect } from "@/lib/social/connection-health";
import { instagramDeleteEnabled } from "@/lib/social/meta";
import { isOnlineTarget, remoteDeleteSupport, REMOVED_FROM_NETWORK_KEY } from "@/lib/social/remote-delete-support";
import { networkLabel } from "@/lib/notifications";
import type { Network } from "@/lib/types";

export interface RemoteDeleteResult {
  targetId: string;
  network: string;
  /** Retirée du réseau (ou déjà absente). */
  ok: boolean;
  /** Le réseau ne la trouve plus : déjà supprimée (ou plus visible pour Nebula). */
  alreadyGone?: boolean;
  /** Pourquoi la suppression n'a pas pu se faire. */
  error?: string;
  /** Lien pour vérifier ou supprimer à la main. */
  manualUrl?: string | null;
}

/** Le réseau ne connaît plus cette publication. */
export function isAlreadyGone(err: unknown): boolean {
  if (!(err instanceof SocialApiError)) return false;
  if (err.status === 404 || err.status === 410) return true;
  // Meta et Threads : « Object with ID … does not exist » (code 100, sous-code 33).
  return (err.network === "FACEBOOK" || err.network === "INSTAGRAM" || err.network === "THREADS") && err.code === "100/33";
}

/** Message d'échec affiché dans la fenêtre de suppression. */
export function deleteFailureMessage(err: unknown, network: string): string {
  const label = networkLabel(network);
  const raw = (err as Error)?.message?.replace(/^\[[A-Z_]+\]\s*/, "") || "erreur inconnue";
  const { category } = classifyProviderError(err);
  switch (category) {
    case "TIMEOUT":
      return `${label} n'a pas répondu à temps : vérifiez sur ${label} si la publication est encore en ligne, puis réessayez.`;
    case "UNEXPECTED_RESPONSE":
      return `${label} a répondu dans un format inattendu : vérifiez sur ${label} si la publication est encore en ligne, puis réessayez.`;
    case "AUTH_EXPIRED":
      return `La connexion à ${label} a expiré : reconnectez le compte dans Comptes, ou supprimez la publication directement sur ${label}.`;
    case "PERMISSION_MISSING":
      return `${label} refuse cette suppression avec les autorisations actuelles (${raw}) : reconnectez le compte en acceptant toutes les autorisations, ou supprimez-la directement sur ${label}.`;
    case "RATE_LIMITED":
    case "QUOTA_EXHAUSTED":
      return `${label} limite le nombre de suppressions pour le moment : réessayez plus tard.`;
    case "TRANSIENT":
      return `Incident passager chez ${label} : réessayez dans quelques minutes.`;
    default:
      return `${label} a refusé la suppression : ${raw}`;
  }
}

/**
 * Supprime la publication `postId` sur les réseaux des cibles `targetIds`.
 * Ne touche jamais à la publication dans Nebula (voir la route).
 */
export async function deleteTargetsOnNetworks(postId: string, targetIds: string[]): Promise<RemoteDeleteResult[]> {
  const wanted = Array.from(new Set(targetIds));
  if (wanted.length === 0) return [];
  const targets = await prisma.postTarget.findMany({
    where: { postId, id: { in: wanted } },
    include: { connection: true }
  });
  const byId = new Map(targets.map((t: (typeof targets)[number]) => [t.id, t]));
  const igEnabled = instagramDeleteEnabled();

  return Promise.all(
    wanted.map(async (targetId): Promise<RemoteDeleteResult> => {
      const target = byId.get(targetId);
      if (!target) return { targetId, network: "", ok: false, error: "Cette cible n'appartient pas à la publication." };
      const label = networkLabel(target.network);
      const base = { targetId, network: target.network, manualUrl: target.externalUrl ?? null };
      if (!isOnlineTarget(target)) {
        return { ...base, ok: false, error: `Cette publication n'est pas (ou plus) en ligne sur ${label} d'après Nebula.` };
      }
      const support = remoteDeleteSupport(target, target.connection, { instagramDeleteEnabled: igEnabled });
      if (support.mode !== "api") return { ...base, ok: false, error: support.how, manualUrl: support.manageUrl };

      const client = getSocialClient(target.network as Network);
      if (!client.deletePost) return { ...base, ok: false, error: `${label} ne permet pas la suppression depuis Nebula.` };

      let alreadyGone = false;
      try {
        await client.deletePost(target.connection, target.externalPostId as string);
      } catch (err) {
        if (isAlreadyGone(err)) {
          alreadyGone = true;
        } else {
          console.error(`[suppression ${target.network}] cible ${target.id} :`, (err as Error).message);
          if (classifyProviderError(err).needsReconnect) {
            await flagConnectionForReconnect(target.connection, (err as Error).message).catch(() => undefined);
          }
          return { ...base, ok: false, error: deleteFailureMessage(err, target.network) };
        }
      }

      const metadata = { ...((target.metadata as Record<string, unknown> | null) ?? {}), [REMOVED_FROM_NETWORK_KEY]: new Date().toISOString() };
      await prisma.postTarget.update({ where: { id: target.id }, data: { metadata: metadata as Prisma.InputJsonValue } });
      return { ...base, ok: true, ...(alreadyGone ? { alreadyGone: true } : {}) };
    })
  );
}
