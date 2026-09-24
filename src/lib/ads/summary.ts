// Vue d'ensemble publicitaire d'une marque (lot 5) : utilisée par l'onglet
// « Publicité » d'Analytics et par l'API (GET /api/v1/ads). Aucun jeton n'en
// sort. Une seule devise à la fois : si les comptes n'utilisent pas tous la
// même, on affiche par défaut celle qui a le plus dépensé, les autres sont
// consultables séparément (additionner des euros et des dollars n'a pas de
// sens).
import { adAccountDb, adMetricDailyDb, type AdAccountRow } from "@/lib/prisma-extra";
import { isAdPlatformConfigured } from "./config";
import { AD_PLATFORMS, AD_PLATFORM_META, type AdCampaign, type AdPlatform } from "./types";

const DAY = 86_400_000;
export const ADS_PERIODS = [7, 30, 90] as const;

export interface AdTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Taux de clic, en % (null sans impression). */
  ctr: number | null;
  /** Coût par clic (null sans clic). */
  cpc: number | null;
  /** Coût par conversion (null sans conversion). */
  cpa: number | null;
}

export interface AdsSummary {
  platforms: { platform: AdPlatform; label: string; configured: boolean }[];
  accounts: {
    id: string;
    platform: AdPlatform;
    name: string;
    externalId: string;
    currency: string;
    status: string;
    lastError: string | null;
    lastSyncedAt: string | null;
    connectedAt: string;
    tokenExpiresAt: string | null;
  }[];
  currencies: string[];
  currency: string | null;
  range: { start: string; end: string; days: number };
  totals: AdTotals;
  previous: AdTotals | null;
  byPlatform: ({ platform: AdPlatform; label: string } & AdTotals)[];
  daily: ({ date: string; total: number } & Partial<Record<AdPlatform, number>>)[];
  campaigns: (AdCampaign & { platform: AdPlatform; accountId: string; accountName: string })[];
}

function totals(rows: { spend: number; impressions: number; clicks: number; conversions: number }[]): AdTotals {
  const t = rows.reduce(
    (a, r) => ({ spend: a.spend + r.spend, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, conversions: a.conversions + r.conversions }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    spend: round(t.spend),
    impressions: t.impressions,
    clicks: t.clicks,
    conversions: round(t.conversions),
    ctr: t.impressions > 0 ? round((t.clicks / t.impressions) * 100) : null,
    cpc: t.clicks > 0 ? round(t.spend / t.clicks) : null,
    cpa: t.conversions > 0 ? round(t.spend / t.conversions) : null
  };
}

function parseCampaigns(a: AdAccountRow): AdCampaign[] {
  try {
    const list = JSON.parse(a.campaigns || "[]") as AdCampaign[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function buildAdsSummary(brandId: string, days: number, wantedCurrency?: string | null): Promise<AdsSummary> {
  const period = (ADS_PERIODS as readonly number[]).includes(days) ? days : 30;
  const accounts = await adAccountDb.findMany({ where: { brandId }, orderBy: { connectedAt: "asc" } });

  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end.getTime() - (period - 1) * DAY);
  const prevStart = new Date(start.getTime() - period * DAY);

  const metrics = accounts.length
    ? await adMetricDailyDb.findMany({
        where: { adAccountId: { in: accounts.map((a) => a.id) }, date: { gte: prevStart, lte: end } }
      })
    : [];

  // Devise affichée : celle demandée si un compte l'utilise, sinon celle qui
  // a le plus dépensé sur la période.
  const spendByCurrency = new Map<string, number>();
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  for (const a of accounts) if (!spendByCurrency.has(a.currency)) spendByCurrency.set(a.currency, 0);
  for (const m of metrics) {
    const a = accountById.get(m.adAccountId);
    if (a && m.date >= start) spendByCurrency.set(a.currency, (spendByCurrency.get(a.currency) ?? 0) + m.spend);
  }
  const currencies = Array.from(spendByCurrency.entries()).sort((x, y) => y[1] - x[1]).map(([c]) => c);
  const currency = wantedCurrency && currencies.includes(wantedCurrency) ? wantedCurrency : currencies[0] ?? null;

  const inCurrency = new Set(accounts.filter((a) => a.currency === currency).map((a) => a.id));
  const current = metrics.filter((m) => inCurrency.has(m.adAccountId) && m.date >= start);
  const previousRows = metrics.filter((m) => inCurrency.has(m.adAccountId) && m.date < start);

  // Comparaison avec la période précédente : seulement si l'historique la
  // couvre (90 jours chargés à la connexion → 7 et 30 jours).
  const oldestHistory = Math.min(...accounts.filter((a) => inCurrency.has(a.id)).map((a) => a.connectedAt.getTime() - 89 * DAY));
  const historyLoaded = accounts.every((a) => !inCurrency.has(a.id) || a.lastSyncedAt !== null);
  const previous = inCurrency.size > 0 && historyLoaded && oldestHistory <= prevStart.getTime() + DAY ? totals(previousRows) : null;

  const daily: AdsSummary["daily"] = [];
  const byDay = new Map<string, AdsSummary["daily"][number]>();
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    const point = { date: key, total: 0 } as AdsSummary["daily"][number];
    byDay.set(key, point);
    daily.push(point);
  }
  for (const m of current) {
    const a = accountById.get(m.adAccountId);
    const point = byDay.get(m.date.toISOString().slice(0, 10));
    if (!a || !point) continue;
    const p = a.platform as AdPlatform;
    point[p] = Math.round(((point[p] ?? 0) + m.spend) * 100) / 100;
    point.total = Math.round((point.total + m.spend) * 100) / 100;
  }

  const byPlatform = AD_PLATFORMS.filter((p) => accounts.some((a) => a.platform === p && inCurrency.has(a.id))).map((p) => ({
    platform: p,
    label: AD_PLATFORM_META[p].label,
    ...totals(current.filter((m) => accountById.get(m.adAccountId)?.platform === p))
  }));

  const campaigns = accounts
    .filter((a) => inCurrency.has(a.id))
    .flatMap((a) => parseCampaigns(a).map((c) => ({ ...c, platform: a.platform as AdPlatform, accountId: a.id, accountName: a.name })))
    .sort((x, y) => y.spend - x.spend)
    .slice(0, 50);

  return {
    platforms: AD_PLATFORMS.map((p) => ({ platform: p, label: AD_PLATFORM_META[p].label, configured: isAdPlatformConfigured(p) })),
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform as AdPlatform,
      name: a.name,
      externalId: a.externalId,
      currency: a.currency,
      status: a.status,
      lastError: a.lastError,
      lastSyncedAt: a.lastSyncedAt ? a.lastSyncedAt.toISOString() : null,
      connectedAt: a.connectedAt.toISOString(),
      tokenExpiresAt: a.tokenExpiresAt ? a.tokenExpiresAt.toISOString() : null
    })),
    currencies,
    currency,
    range: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days: period },
    totals: totals(current),
    previous,
    byPlatform,
    daily,
    campaigns
  };
}
