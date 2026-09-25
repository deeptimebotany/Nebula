// Tâches périodiques du 25/09/2026, lancées par /api/cron et par le worker
// (scripts/worker.ts) : récompenses de parrainage arrivées à échéance,
// conversion des mois offerts en attente, rappel des publications du
// lendemain, purge des notifications de plus de 90 jours et rappels des
// missions de la semaine (Réussites v2). Chaque tâche est
// isolée : l'échec de l'une n'empêche jamais les autres.
import { processDueRewards, flushAllBonusMonths } from "@/lib/billing/rewards";
import { sendTomorrowReminders, purgeOldNotifications, remindExpiringConnections } from "@/lib/notifications";
import { processWebhookRetries, purgeOldWebhookDeliveries } from "@/lib/webhooks";
import { purgePendingAdAuths, syncDueAdAccounts } from "@/lib/ads/sync";
import { runReussitesNudges } from "@/lib/reussites/nudges";

function safe<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  return run().catch((err) => {
    console.error(`[jobs] ${label} :`, (err as Error).message);
    return null;
  });
}

export async function runAccountJobs() {
  const rewards = await safe("parrainage", processDueRewards);
  const bonusFlushed = await safe("mois offerts", flushAllBonusMonths);
  const reminders = await safe("rappels", () => sendTomorrowReminders());
  const notificationsPurged = await safe("purge notifications", purgeOldNotifications);
  const expiring = await safe("connexions qui expirent", () => remindExpiringConnections());
  // Webhooks (lot 4) : relances des envois en échec, journal gardé 30 jours.
  const webhookRetries = await safe("relances webhooks", processWebhookRetries);
  const webhookPurged = await safe("purge webhooks", purgeOldWebhookDeliveries);
  // Publicité (lot 5) : synchro des comptes pub toutes les 12 h.
  const adsSynced = await safe("synchro publicité", syncDueAdAccounts);
  const adsPendingPurged = await safe("purge autorisations pub", purgePendingAdAuths);
  // Réussites v2 : rappels des missions (lundi matin, dimanche soir).
  const missionNudges = await safe("rappels des missions", () => runReussitesNudges());
  return { rewards, bonusFlushed, reminders, notificationsPurged, expiring, webhookRetries, webhookPurged, adsSynced, adsPendingPurged, missionNudges };
}
