// Synchronisation des comptes publicitaires (lot 5). Chaque passage relit
// les 30 derniers jours (les conversions arrivent souvent avec quelques
// jours de retard) ; la toute première fois, 90 jours d'historique, par
// tranches de 30 jours (limite de TikTok, appliquée partout par simplicité).
// Le cron repasse sur chaque compte toutes les 12 h ; « Actualiser » dans
// Analytics force une synchro immédiate.
import { adAccountDb, adMetricDailyDb, pendingAdAuthDb, type AdAccountRow } from "@/lib/prisma-extra";
import { brandEditorIds, notifyMany } from "@/lib/notifications";
import { getBrandPlan } from "@/lib/billing/plan";
import { getAdsClient } from "./index";
import { isAdPlatformConfigured } from "./config";
import { AD_PLATFORM_META, AdsError, type AdCampaign, type AdDay, type AdPlatform } from "./types";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const CHUNK_DAYS = 30;
const FIRST_SYNC_DAYS = 90;
const RESYNC_DAYS = 30;
const EVERY_MS = 12 * HOUR;

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface SyncResult {
  ok: boolean;
  error?: string;
}

export async function syncAdAccount(account: AdAccountRow): Promise<SyncResult> {
  const platform = account.platform as AdPlatform;
  if (!isAdPlatformConfigured(platform)) return { ok: false, error: "Cette régie n'est plus configurée sur Nebula." };
  const client = getAdsClient(platform);
  const ref = {
    id: account.id,
    externalId: account.externalId,
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    tokenExpiresAt: account.tokenExpiresAt,
    loginCustomerId: account.loginCustomerId
  };
  try {
    let accessToken = account.accessToken;
    const fresh = await client.freshToken(ref);
    if (fresh) {
      accessToken = fresh.accessToken;
      await adAccountDb.update({ where: { id: account.id }, data: { accessToken, tokenExpiresAt: fresh.expiresAt ?? null } });
    }

    const end = utcDay(new Date());
    const totalDays = account.lastSyncedAt ? RESYNC_DAYS : FIRST_SYNC_DAYS;
    const start = new Date(end.getTime() - (totalDays - 1) * DAY);

    const days = new Map<string, AdDay>();
    let campaigns: AdCampaign[] = [];
    for (let chunkEnd = end; chunkEnd >= start; chunkEnd = new Date(chunkEnd.getTime() - CHUNK_DAYS * DAY)) {
      const chunkStart = new Date(Math.max(start.getTime(), chunkEnd.getTime() - (CHUNK_DAYS - 1) * DAY));
      const latest = chunkEnd.getTime() === end.getTime();
      // Le tableau des campagnes couvre les 30 derniers jours : seule la
      // tranche la plus récente le demande.
      const report = await client.report(ref, accessToken, chunkStart, chunkEnd, latest);
      for (const d of report.days) if (/^\d{4}-\d{2}-\d{2}$/.test(d.date)) days.set(d.date, d);
      if (latest) campaigns = report.campaigns;
    }

    // Garde-fou (lot 8) : un rapport entièrement vide alors que des dépenses
    // sont déjà enregistrées sur la période n'est pas une correction de la
    // régie (elle ne remet jamais 30 jours à zéro) mais une réponse suspecte.
    // On garde alors les chiffres enregistrés au lieu de les effacer.
    const suspicious =
      days.size === 0 && (await adMetricDailyDb.count({ where: { adAccountId: account.id, date: { gte: start, lte: end }, spend: { gt: 0 } } })) > 0;
    if (suspicious) {
      console.warn(`[publicité] rapport vide pour ${platform} ${account.externalId} alors que des dépenses sont enregistrées : chiffres conservés.`);
    }

    for (let t = start.getTime(); t <= end.getTime() && !suspicious; t += DAY) {
      const date = new Date(t);
      const d = days.get(date.toISOString().slice(0, 10));
      const values = {
        spend: Math.round((d?.spend ?? 0) * 100) / 100,
        impressions: Math.round(d?.impressions ?? 0),
        clicks: Math.round(d?.clicks ?? 0),
        conversions: Math.round((d?.conversions ?? 0) * 100) / 100,
        reach: d?.reach ?? null
      };
      if (!d) {
        // Jour absent du rapport = aucune diffusion. On ne crée pas de ligne
        // vide, mais on remet à zéro une valeur corrigée depuis par la régie.
        await adMetricDailyDb.updateMany({ where: { adAccountId: account.id, date }, data: values });
        continue;
      }
      await adMetricDailyDb.upsert({
        where: { adAccountId_date: { adAccountId: account.id, date } },
        create: { adAccountId: account.id, date, ...values },
        update: values
      });
    }

    await adAccountDb.update({
      where: { id: account.id },
      data: {
        status: "CONNECTED",
        lastError: null,
        lastSyncedAt: new Date(),
        nextSyncAt: new Date(Date.now() + EVERY_MS),
        ...(suspicious ? {} : { campaigns: JSON.stringify(campaigns.slice(0, 50)) })
      }
    });
    return { ok: true };
  } catch (err) {
    const auth = err instanceof AdsError && err.status === 401;
    const transient = err instanceof AdsError && err.status === 429;
    const message = (err as Error).message.slice(0, 300);
    await adAccountDb.update({
      where: { id: account.id },
      data: {
        status: auth ? "EXPIRED" : "ERROR",
        lastError: message,
        // Limite de requêtes : nouvel essai dans 30 min ; autre erreur : au
        // prochain cycle. Un compte expiré attend sa reconnexion.
        nextSyncAt: new Date(Date.now() + (transient ? HOUR / 2 : EVERY_MS))
      }
    });
    if (auth && account.status !== "EXPIRED") {
      await notifyMany(await brandEditorIds(account.brandId), {
        kind: "reconnect",
        title: `${AD_PLATFORM_META[platform].label} à reconnecter`,
        body: `La connexion au compte publicitaire « ${account.name} » a expiré : ses dépenses ne sont plus mises à jour.`,
        href: "/analytics?tab=ads",
        actionLabel: "Reconnecter",
        dedupeKey: `ads-expired:${account.id}:${account.connectedAt.getTime()}`
      });
    }
    return { ok: false, error: message };
  }
}

/**
 * Cron : comptes arrivés à échéance (10 par passage). Prévient aussi, 7
 * jours avant, quand un jeton Meta (60 jours) va expirer.
 */
export async function syncDueAdAccounts(): Promise<number> {
  const now = Date.now();
  const due = await adAccountDb.findMany({
    where: { status: { not: "EXPIRED" }, nextSyncAt: { lte: new Date(now) } },
    orderBy: { nextSyncAt: "asc" },
    take: 10
  });
  let done = 0;
  const planCache = new Map<string, string>();
  for (const account of due) {
    // Verrou : un autre passage du cron ne reprend pas le même compte.
    const claimed = await adAccountDb.updateMany({
      where: { id: account.id, nextSyncAt: account.nextSyncAt },
      data: { nextSyncAt: new Date(now + 15 * 60_000) }
    });
    if (claimed.count === 0) continue;
    // Marque redescendue en gratuit : plus de synchro (les données restent).
    if (!planCache.has(account.brandId)) planCache.set(account.brandId, (await getBrandPlan(account.brandId)).plan);
    if (planCache.get(account.brandId) === "FREE") {
      await adAccountDb.update({ where: { id: account.id }, data: { nextSyncAt: new Date(now + EVERY_MS) } });
      continue;
    }
    if ((await syncAdAccount(account)).ok) done++;

    const exp = account.tokenExpiresAt?.getTime();
    if (account.platform === "META_ADS" && exp && exp - now < 7 * DAY && exp > now) {
      await notifyMany(await brandEditorIds(account.brandId), {
        kind: "reconnect",
        title: "Meta Ads à reconnecter bientôt",
        body: `La connexion au compte publicitaire « ${account.name} » expire le ${new Date(exp).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}. Reconnectez-le pour ne pas interrompre le suivi.`,
        href: "/analytics?tab=ads",
        actionLabel: "Reconnecter",
        dedupeKey: `ads-expiring:${account.id}:${exp}`
      });
    }
  }
  return done;
}

/** Cron : autorisations en attente de choix de comptes, gardées 1 h. */
export async function purgePendingAdAuths(): Promise<number> {
  const res = await pendingAdAuthDb.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - HOUR) } } });
  return res.count;
}
