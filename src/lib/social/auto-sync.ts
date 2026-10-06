// Synchro quotidienne automatique des comptes connectés (Réussites v3,
// 02/10/2026). Jusqu'ici, les statistiques (abonnés) et les métriques par
// publication (vues, j'aime, rétention YouTube) n'arrivaient que quand on
// cliquait sur « Actualiser » : les records de qualité, la croissance réelle
// et le meilleur moment pour publier manquaient de relevés.
//
// À chaque passage du cron (tâches de compte), au plus AUTO_SYNC_PER_RUN
// comptes, choisis parmi ceux :
//  - connectés, pas en veille (compte ou marque, lot E4) ;
//  - pas relevés automatiquement depuis 20 h (autoSyncedAt, qui sert aussi
//    de verrou : deux passages du cron ne prennent jamais le même compte) ;
//  - d'une marque dont un membre a ouvert Nebula dans les 30 derniers jours
//    (Réussites évaluées : tableau de bord, Réussites, publication) — pas
//    d'appels aux réseaux pour un compte abandonné — ou, les 1er et 2 du
//    mois, inscrit au bilan du mois (relevé de fin de mois) ;
//  - dont le réseau n'est pas suspendu (disjoncteur, lot 5).
// Un relevé fait à la main dans les 20 dernières heures n'est pas refait.
// Uniquement les API officielles et gratuites déjà utilisées par
// « Actualiser » ; aucun appel en double.
import { prisma } from "@/lib/prisma";
import { withoutDormant } from "@/lib/billing/dormant";
import { NETWORK_META, type Network } from "@/lib/types";
import { getSocialClient } from "@/lib/social";
import { onSyncError, onSyncSuccess, syncBlockedReason } from "./connection-health";
import { saveAnalyticsSnapshot, savePostMetrics } from "./metrics-store";
import { endOfMonthSyncWindow } from "@/lib/monthly-summary/period-window";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const AUTO_SYNC_EVERY_MS = 20 * HOUR;
export const AUTO_SYNC_ACTIVE_DAYS = 30;
export const AUTO_SYNC_PER_RUN = 3;
/** Pas de nouveau compte entamé au-delà (le cron a 60 s en tout). */
const TIME_BUDGET_MS = 25_000;

export interface AutoSyncResult {
  synced: number;
  failed: number;
}

/** Comptes à relever (sans verrou : voir autoSyncDueConnections). */
export async function dueConnections(now: Date, take: number) {
  const cutoff = new Date(now.getTime() - AUTO_SYNC_EVERY_MS);
  const activeSince = new Date(now.getTime() - AUTO_SYNC_ACTIVE_DAYS * DAY);
  const rows = await prisma.socialConnection.findMany({
    where: {
      status: "CONNECTED",
      dormantAt: null,
      OR: [{ autoSyncedAt: null }, { autoSyncedAt: { lt: cutoff } }],
      // Membre actif ces 30 derniers jours, ou, en fin de mois (les 1er et 2),
      // inscrit au bilan du mois : son bilan doit partir avec les vrais
      // chiffres de fin de mois même s'il ne s'est pas connecté (03/10/2026).
      brand: {
        memberships: {
          some: {
            user: endOfMonthSyncWindow(now)
              ? { OR: [{ reussitesCheckedAt: { gte: activeSince } }, { monthlySummaryAt: { not: null } }] }
              : { reussitesCheckedAt: { gte: activeSince } }
          }
        }
      }
    },
    orderBy: { autoSyncedAt: { sort: "asc", nulls: "first" } },
    take
  });
  return withoutDormant(rows);
}

export async function autoSyncDueConnections(now: Date = new Date(), perRun = AUTO_SYNC_PER_RUN): Promise<AutoSyncResult> {
  const started = Date.now();
  const cutoff = now.getTime() - AUTO_SYNC_EVERY_MS;
  const result: AutoSyncResult = { synced: 0, failed: 0 };
  for (const connection of await dueConnections(now, perRun * 3)) {
    if (result.synced + result.failed >= perRun || Date.now() - started > TIME_BUDGET_MS) break;
    // Verrou : la date ne change que si personne ne l'a prise entre-temps.
    const claimed = await prisma.socialConnection.updateMany({
      where: { id: connection.id, autoSyncedAt: connection.autoSyncedAt },
      data: { autoSyncedAt: now }
    });
    if (claimed.count === 0) continue;
    if (await syncBlockedReason(connection.network)) {
      // Réseau suspendu : on réessaiera au prochain tour de 20 h.
      continue;
    }
    const client = getSocialClient(connection.network as Network);
    const recent = (d: Date | null) => Boolean(d && d.getTime() >= cutoff);
    try {
      if (NETWORK_META[connection.network as Network]?.statsAvailable !== false && !recent(connection.lastSyncedAt)) {
        await saveAnalyticsSnapshot(connection, await client.fetchAnalytics(connection), now);
      }
      if (client.fetchPostMetrics && !recent(connection.lastMetricsSyncedAt)) {
        await savePostMetrics(connection, await client.fetchPostMetrics(connection), now);
      }
      await onSyncSuccess(connection);
      result.synced++;
    } catch (err) {
      const message = await onSyncError(connection, err);
      await prisma.socialConnection.update({ where: { id: connection.id }, data: { lastError: message } }).catch(() => undefined);
      result.failed++;
    }
  }
  return result;
}
