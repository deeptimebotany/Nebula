// Comptes déconnectés (10/10/2026, retour de Lucas : après avoir tout
// déconnecté, Interactions montrait encore ses comptes et leurs chiffres).
//
// « Déconnecter » efface maintenant, pour TOUS les réseaux (avant : YouTube
// seulement, règles de YouTube), ce que Nebula avait relevé avec ce compte :
// statistiques, métriques des publications, commentaires et analyses de
// rétention. La ligne du compte reste (sans jeton) : elle porte l'historique
// des publications faites avec Nebula, qui serait sinon effacé avec elle.
// Les pages ne montrent plus les comptes déconnectés (statut DISCONNECTED).
//
// Filet de sécurité (cron) : ce qui reste aux comptes déjà déconnectés
// (déconnectés avant ce changement, accès retiré depuis les réglages de Meta,
// autorisation YouTube retirée…) est effacé au passage suivant.
import { prisma } from "@/lib/prisma";

/** Nom affiché d'une chaîne déconnectée (le vrai nom vient de YouTube : effacé). */
export const ANONYMIZED_CHANNEL_NAME = "Chaîne YouTube déconnectée";

export interface ConnectionDataDeletion {
  analytics: number;
  videoStats: number;
  comments: number;
  retention: number;
}

/**
 * Efface les données relevées avec ce compte : statistiques, métriques des
 * publications, commentaires et analyses de rétention. Ne touche ni à la
 * ligne du compte ni aux publications faites avec Nebula.
 */
export async function deleteConnectionData(connectionId: string): Promise<ConnectionDataDeletion> {
  const [analytics, videoStats, comments, retention] = await Promise.all([
    prisma.analyticsSnapshot.deleteMany({ where: { connectionId } }),
    prisma.postMetric.deleteMany({ where: { connectionId } }),
    prisma.engagementItem.deleteMany({ where: { connectionId } }),
    prisma.videoInsight.deleteMany({ where: { OR: [{ connectionId }, { postTarget: { connectionId } }] } })
  ]);
  return { analytics: analytics.count, videoStats: videoStats.count, comments: comments.count, retention: retention.count };
}

/** Chaîne YouTube : nom, identifiant et photo effacés (ils viennent de YouTube). */
export async function anonymizeYoutubeChannel(connectionId: string): Promise<void> {
  await prisma.socialConnection.update({
    where: { id: connectionId },
    data: { displayName: ANONYMIZED_CHANNEL_NAME, handle: null, avatarUrl: null }
  });
}

/** Comptes traités par passage du cron. */
const PURGE_PER_RUN = 50;

/**
 * Tâche du cron : comptes déconnectés qui ont encore des données (ou, pour
 * YouTube, encore le nom de la chaîne) → tout est effacé.
 */
export async function purgeDisconnectedData(limit = PURGE_PER_RUN): Promise<{ connections: number }> {
  const rows = (await prisma.socialConnection.findMany({
    where: {
      status: "DISCONNECTED",
      OR: [
        { analytics: { some: {} } },
        { postMetrics: { some: {} } },
        { engagementItems: { some: {} } },
        { videoInsights: { some: {} } },
        { network: "YOUTUBE", NOT: { displayName: ANONYMIZED_CHANNEL_NAME } },
        { network: "YOUTUBE", OR: [{ handle: { not: null } }, { avatarUrl: { not: null } }] }
      ]
    },
    select: { id: true, network: true },
    orderBy: { id: "asc" },
    take: limit
  })) as { id: string; network: string }[];
  for (const row of rows) {
    await deleteConnectionData(row.id);
    if (row.network === "YOUTUBE") await anonymizeYoutubeChannel(row.id);
  }
  return { connections: rows.length };
}
