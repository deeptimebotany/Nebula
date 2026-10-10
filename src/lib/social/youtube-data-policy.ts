// Règles de YouTube sur les données (09/10/2026), exigées pour l'audit
// « YouTube API Services » (règles des développeurs, sections III.D.2 et
// III.E.4 : https://developers.google.com/youtube/terms/developer-policies).
//
//  - Déconnexion d'une chaîne dans Nebula (Comptes connectés) : toutes les
//    données YouTube obtenues avec cette autorisation sont effacées tout de
//    suite (la règle laisse 7 jours) — statistiques, statistiques des vidéos
//    (titres, miniatures), commentaires, analyses de rétention, nom et photo
//    de la chaîne. L'historique des publications faites avec Nebula reste.
//  - Données autres que des statistiques (commentaires, titres et miniatures
//    des vidéos) : jamais gardées plus de 30 jours sans être actualisées.
//    Les commentaires de plus de 30 jours ne sont ni enregistrés ni gardés ;
//    les fiches de vidéo non actualisées depuis 30 jours sont effacées (elles
//    reviennent à la prochaine synchro).
//  - Statistiques et YouTube Analytics : gardées tant que la chaîne est
//    connectée, mais Nebula vérifie au moins tous les 30 jours que
//    l'autorisation est toujours valable (renouvellement du jeton auprès de
//    Google, sans coût de quota). Autorisation retirée chez Google (page
//    « Autorisations » du compte Google) : la chaîne est déconnectée et ses
//    données effacées, au plus tard 30 jours après le retrait.
//
// Lancé par le cron (account-jobs.ts) et par la déconnexion (revoke.ts).
import { prisma } from "@/lib/prisma";
import { SocialApiError } from "./base";
import { classifyProviderError } from "./errors";
import { freshYoutubeToken } from "./youtube";
import { DAY_MS, YOUTUBE_DATA_MAX_DAYS } from "./youtube-data-retention";
import { ANONYMIZED_CHANNEL_NAME, anonymizeYoutubeChannel, deleteConnectionData } from "./disconnected-data";

export { YOUTUBE_DATA_MAX_DAYS, isStaleYoutubeComment } from "./youtube-data-retention";
/**
 * Vérification de l'autorisation des chaînes sans synchro réussie depuis ce
 * nombre de jours (marge sous les 30 jours de la règle : une autorisation
 * retirée est détectée, et les données effacées, avant 30 jours).
 */
export const YOUTUBE_AUTH_CHECK_DAYS = 25;
/** Au plus une vérification par chaîne et par jour (le jeton dure 1 h). */
const AUTH_CHECK_SPACING_MS = DAY_MS;
/** Vérifications par passage du cron (le cron passe souvent). */
const AUTH_CHECKS_PER_RUN = 10;

export { ANONYMIZED_CHANNEL_NAME };

export interface YoutubeDeletion {
  analytics: number;
  videoStats: number;
  comments: number;
  retention: number;
}

/**
 * Efface les données YouTube obtenues avec l'autorisation de cette chaîne.
 * `anonymize` efface aussi le nom, l'identifiant et la photo de la chaîne
 * (déconnexion ou autorisation retirée).
 */
export async function deleteYoutubeAuthorizedData(connectionId: string, { anonymize = true }: { anonymize?: boolean } = {}): Promise<YoutubeDeletion> {
  // Même effacement que pour les autres réseaux (disconnected-data.ts), plus
  // le nom et la photo de la chaîne.
  const deleted = await deleteConnectionData(connectionId);
  if (anonymize) await anonymizeYoutubeChannel(connectionId);
  return deleted;
}

/**
 * Commentaires de plus de 30 jours et fiches de vidéo non actualisées depuis
 * 30 jours : effacés (règle III.E.4.c).
 */
export async function purgeStaleYoutubeData(now = new Date()): Promise<{ comments: number; videoStats: number }> {
  const cutoff = new Date(now.getTime() - YOUTUBE_DATA_MAX_DAYS * DAY_MS);
  const [comments, videoStats] = await Promise.all([
    prisma.engagementItem.deleteMany({
      where: {
        network: "YOUTUBE",
        OR: [{ publishedAt: { lt: cutoff } }, { publishedAt: null, createdAt: { lt: cutoff } }]
      }
    }),
    prisma.postMetric.deleteMany({ where: { network: "YOUTUBE", capturedAt: { lt: cutoff } } })
  ]);
  return { comments: comments.count, videoStats: videoStats.count };
}

/** Déconnecte une chaîne dont l'autorisation a disparu, et efface ses données. */
async function retireConnection(connectionId: string, reason: string): Promise<void> {
  await prisma.socialConnection.update({
    where: { id: connectionId },
    data: { status: "DISCONNECTED", accessToken: "", refreshToken: null, tokenExpiresAt: null, lastError: reason.slice(0, 500) }
  });
  await deleteYoutubeAuthorizedData(connectionId);
}

/**
 * Chaînes sans synchro réussie depuis 25 jours (marque en veille, chaîne à
 * reconnecter…) : Nebula redemande un jeton à Google, au plus une fois par
 * jour. Accepté : l'autorisation tient, les statistiques restent. Refusé
 * (accès retiré, invalid_grant) ou plus de jeton du tout : la chaîne est
 * déconnectée et ses données YouTube effacées (règles III.E.4.b et III.D.2).
 * Une panne de Google ou du réseau ne touche à rien (nouvel essai demain).
 */
export async function checkYoutubeAuthorizations(now = new Date()): Promise<{ checked: number; kept: number; retired: number }> {
  const staleBefore = new Date(now.getTime() - YOUTUBE_AUTH_CHECK_DAYS * DAY_MS);
  const lastCheckBefore = new Date(now.getTime() - AUTH_CHECK_SPACING_MS);
  const due = await prisma.socialConnection.findMany({
    where: {
      network: "YOUTUBE",
      status: { not: "DISCONNECTED" },
      OR: [{ lastSyncedAt: { lt: staleBefore } }, { lastSyncedAt: null, connectedAt: { lt: staleBefore } }],
      AND: [{ OR: [{ tokenExpiresAt: null }, { tokenExpiresAt: { lt: lastCheckBefore } }] }]
    },
    orderBy: { tokenExpiresAt: "asc" },
    take: AUTH_CHECKS_PER_RUN
  });
  let kept = 0;
  let retired = 0;
  for (const connection of due) {
    if (!connection.refreshToken) {
      await retireConnection(connection.id, "Autorisation YouTube retirée ou expirée : données YouTube effacées (règles de YouTube).");
      retired += 1;
      continue;
    }
    // Jeton encore « valide » d'après sa date : on force le renouvellement,
    // seul moyen de savoir si Google accepte toujours l'autorisation.
    const probe = { ...connection, tokenExpiresAt: new Date(0) };
    try {
      await freshYoutubeToken(probe);
      kept += 1;
    } catch (err) {
      const refused = err instanceof SocialApiError && classifyProviderError(err).needsReconnect;
      if (refused) {
        await retireConnection(connection.id, "Autorisation YouTube retirée chez Google : données YouTube effacées (règles de YouTube).");
        retired += 1;
      } else {
        // Panne passagère : on réessaiera au prochain passage, sans boucler
        // d'ici là (date du jeton avancée à maintenant).
        await prisma.socialConnection.update({ where: { id: connection.id }, data: { tokenExpiresAt: now } }).catch(() => undefined);
      }
    }
  }
  return { checked: due.length, kept, retired };
}

/** Tâche du cron : purge des données trop anciennes, puis vérification des autorisations. */
export async function runYoutubeDataPolicy(now = new Date()) {
  const purged = await purgeStaleYoutubeData(now);
  const authorizations = await checkYoutubeAuthorizations(now);
  return { ...purged, ...authorizations };
}
