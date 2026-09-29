// Tâches périodiques du brief growth, regroupées pour /api/cron et le worker
// (appelés chaque minute) : les emails de cycle de vie et les purges ne
// tournent qu'une fois par heure (verrou en base via PublicToolUsage,
// partagé entre instances serverless), les essais à chaque passage.
import { prisma } from "@/lib/prisma";
import { fetchPendingImportMedia } from "@/lib/import-media";
import { applyTrialExpirations, grantTrialToLegacyAccounts } from "@/lib/billing/trial-expiry";
import { runLifecycleEmails } from "@/lib/emails/lifecycle";
import { purgeOldGrowthEvents } from "@/lib/growth";
import { purgeExpiredAudits } from "@/lib/audit/run";
import { refreshAnonStats } from "@/lib/anon-stats/load";
import { purgeOldTrialGrants } from "@/lib/billing/trial-eligibility";
import { reactivatePaidOwners } from "@/lib/billing/free-limits";

async function claimHourlySlot(name: string): Promise<boolean> {
  return claimSlot(name, `h:${Math.floor(Date.now() / (60 * 60 * 1000))}`);
}

/** Une fois par jour (UTC), même verrou que claimHourlySlot. */
async function claimDailySlot(name: string): Promise<boolean> {
  return claimSlot(name, `d:${new Date().toISOString().slice(0, 10)}`);
}

async function claimSlot(name: string, hour: string): Promise<boolean> {
  try {
    await prisma.publicToolUsage.create({ data: { ipHash: `job:${name}`, tool: "cron-slot", day: hour, count: 1 } });
    return true;
  } catch {
    // Ligne déjà présente (contrainte unique) : une autre instance a pris
    // ce créneau horaire.
    return false;
  }
}

export async function runGrowthMaintenance(): Promise<{
  legacyTrials: number;
  trialsApplied: number;
  importMedia: { done: number; failed: number };
  lifecycle: { sent: number; skipped: number; failed: number } | null;
  purged: { growthEvents: number; drafts: number; audits: number; contactMessages: number; trialGrants: number } | null;
  reactivated: number | null;
  anonStats: { current: number; previous: number } | null;
}> {
  const legacy = await grantTrialToLegacyAccounts().catch((err) => {
    console.error("[growth] essai offert aux anciens comptes :", (err as Error).message);
    return { granted: 0 };
  });
  const applied = await applyTrialExpirations().catch((err) => {
    console.error("[growth] fin d'essai :", (err as Error).message);
    return { applied: 0 };
  });
  // Médias des imports CSV (lot G6.a) : quelques fichiers par passage.
  const importMedia = await fetchPendingImportMedia().catch(() => ({ done: 0, failed: 0 }));

  let lifecycle: { sent: number; skipped: number; failed: number } | null = null;
  let purged: { growthEvents: number; drafts: number; audits: number; contactMessages: number; trialGrants: number } | null = null;
  let reactivated: number | null = null;
  if (await claimHourlySlot("growth")) {
    lifecycle = await runLifecycleEmails().catch(() => ({ sent: 0, skipped: 0, failed: 0 }));
    // Filet de la fin d'essai (lot E4) : comptes redevenus payants avec des
    // marques encore en veille (fin de pause, webhook perdu).
    reactivated = await reactivatePaidOwners().catch(() => 0);
    const [growthEvents, drafts, audits, contactMessages, trialGrants] = await Promise.all([
      purgeOldGrowthEvents().catch(() => 0),
      prisma.publicDraft.deleteMany({ where: { expiresAt: { lt: new Date() } } }).then((r) => r.count).catch(() => 0),
      // Rapports d'audit de présence : 30 jours, puis supprimés.
      purgeExpiredAudits().catch(() => 0),
      // Messages du formulaire de contact : 12 mois, puis supprimés.
      prisma.contactMessage
        .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 365 * 86_400_000) } } })
        .then((r) => r.count)
        .catch(() => 0),
      // Registre des essais (lot E3) : 12 mois, puis supprimé.
      purgeOldTrialGrants().catch(() => 0)
    ]);
    purged = { growthEvents, drafts, audits, contactMessages, trialGrants };
  }
  // Statistiques de groupe anonymes (accord facultatif, seuil de 20 comptes) :
  // une fois par jour, mois en cours et mois précédent (src/lib/anon-stats/).
  let anonStats: { current: number; previous: number } | null = null;
  if (await claimDailySlot("anon-stats")) anonStats = await refreshAnonStats().catch(() => null);
  return { legacyTrials: legacy.granted, trialsApplied: applied.applied, importMedia, lifecycle, purged, reactivated, anonStats };
}
