// Meta Ads (Facebook + Instagram) — API Marketing officielle, gratuite.
//
// Prérequis (côté Lucas) : la même application Meta que pour Instagram et
// Facebook (META_APP_ID / META_APP_SECRET), avec le cas d'usage « Créer et
// gérer des publicités avec l'API Marketing » et la permission ads_read
// validée par Meta (App Review, accès avancé). Tant qu'elle ne l'est pas,
// seuls les comptes pub des administrateurs de l'app fonctionnent : c'est
// pour ça que Meta Ads ne s'affiche qu'avec META_ADS_ENABLED="true".
// URL de retour à déclarer : <site>/api/ads/callback/meta
import { adsRedirectUri } from "./config";
import { AdsError, isoDay, num, type AdAccountChoice, type AdAccountRef, type AdCampaign, type AdDay, type AdReport, type AdTokens } from "./types";

// v25.0 (février 2026). META_ADS_GRAPH_VERSION permet de monter de version
// sans toucher au code quand Meta annonce la fin de celle-ci.
const VERSION = () => process.env.META_ADS_GRAPH_VERSION || "v25.0";
const GRAPH = () => `https://graph.facebook.com/${VERSION()}`;

export function metaAdsAuthUrl(state: string): string {
  const url = new URL(`https://www.facebook.com/${VERSION()}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID || "");
  url.searchParams.set("redirect_uri", adsRedirectUri("meta"));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "ads_read");
  return url.toString();
}

async function graphGet<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!path.startsWith("http")) url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; type?: string } };
  if (!res.ok || json.error) {
    const e = json.error;
    if (e?.code === 190 || e?.type === "OAuthException") throw new AdsError("Connexion Meta Ads expirée : reconnectez le compte.", 401);
    if (e?.code === 17 || e?.code === 80004) throw new AdsError("Meta limite temporairement les requêtes : nouvel essai plus tard.", 429);
    throw new AdsError(e?.message || `Meta a répondu ${res.status}.`, res.status || 400);
  }
  return json;
}

export async function exchangeMetaAdsCode(code: string): Promise<AdTokens> {
  const short = await graphGet<{ access_token: string }>(
    "/oauth/access_token",
    { client_id: process.env.META_APP_ID || "", client_secret: process.env.META_APP_SECRET || "", redirect_uri: adsRedirectUri("meta"), code },
    ""
  );
  // Jeton longue durée (~60 jours) : Nebula prévient avant qu'il expire.
  const long = await graphGet<{ access_token: string; expires_in?: number }>(
    "/oauth/access_token",
    { grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID || "", client_secret: process.env.META_APP_SECRET || "", fb_exchange_token: short.access_token },
    ""
  );
  return { accessToken: long.access_token, refreshToken: null, expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86_400) * 1000) };
}

interface Paged<T> {
  data?: T[];
  paging?: { next?: string };
}

async function allPages<T>(first: Paged<T>, token: string, maxPages = 10): Promise<T[]> {
  const out = [...(first.data ?? [])];
  let next = first.paging?.next;
  for (let i = 1; next && i < maxPages; i++) {
    const page = await graphGet<Paged<T>>(next, {}, token);
    out.push(...(page.data ?? []));
    next = page.paging?.next;
  }
  return out;
}

export async function listMetaAdAccounts(tokens: AdTokens): Promise<AdAccountChoice[]> {
  const first = await graphGet<Paged<{ account_id: string; name?: string; currency?: string; account_status?: number }>>(
    "/me/adaccounts",
    { fields: "account_id,name,currency,account_status", limit: "100" },
    tokens.accessToken
  );
  const rows = await allPages(first, tokens.accessToken, 5);
  // account_status : 1 = actif, 2 = désactivé, 101 = fermé… on garde tout
  // sauf les comptes fermés, un compte en pause a quand même un historique.
  return rows
    .filter((r) => r.account_status !== 101)
    .map((r) => ({ externalId: r.account_id, name: r.name || `Compte ${r.account_id}`, currency: r.currency || "EUR" }));
}

interface InsightRow {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: { action_type: string; value: string }[];
}

// Résultats comptés comme « conversions » : achats, prospects, inscriptions.
// omni_purchase regroupe déjà les achats site + appli + boutique : il est
// pris en priorité pour ne pas compter deux fois le même achat.
function conversionsOf(actions: InsightRow["actions"]): number {
  if (!actions?.length) return 0;
  const get = (t: string) => {
    const a = actions.find((x) => x.action_type === t);
    return a ? num(a.value) : null;
  };
  const purchases = get("omni_purchase") ?? get("purchase") ?? get("offsite_conversion.fb_pixel_purchase") ?? 0;
  const leads = get("lead") ?? get("onsite_conversion.lead_grouped") ?? 0;
  const signups = get("complete_registration") ?? get("offsite_conversion.fb_pixel_complete_registration") ?? 0;
  return purchases + leads + signups;
}

function toDay(r: InsightRow): AdDay {
  return {
    date: r.date_start ?? "",
    spend: num(r.spend),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    conversions: conversionsOf(r.actions),
    reach: r.reach ? num(r.reach) : null
  };
}

export async function fetchMetaAdsReport(account: AdAccountRef, accessToken: string, start: Date, end: Date, withCampaigns = true): Promise<AdReport> {
  const act = `/act_${account.externalId}`;
  const timeRange = JSON.stringify({ since: isoDay(start), until: isoDay(end) });
  const dailyFirst = await graphGet<Paged<InsightRow>>(
    `${act}/insights`,
    { level: "account", time_increment: "1", time_range: timeRange, fields: "spend,impressions,clicks,reach,actions", limit: "100" },
    accessToken
  );
  const daily = await allPages(dailyFirst, accessToken);
  if (!withCampaigns) return { days: daily.map(toDay), campaigns: [] };
  const campFirst = await graphGet<Paged<InsightRow>>(
    `${act}/insights`,
    { level: "campaign", time_range: timeRange, fields: "campaign_id,campaign_name,spend,impressions,clicks,actions", limit: "50", sort: "spend_descending" },
    accessToken
  );
  const statuses = new Map<string, string>();
  try {
    const st = await graphGet<Paged<{ id: string; effective_status?: string }>>(`${act}/campaigns`, { fields: "id,effective_status", limit: "200" }, accessToken);
    for (const c of st.data ?? []) if (c.effective_status) statuses.set(c.id, c.effective_status);
  } catch {
    // Statut facultatif.
  }
  const STATUS: Record<string, string> = { ACTIVE: "Active", PAUSED: "En pause", CAMPAIGN_PAUSED: "En pause", ARCHIVED: "Archivée", IN_PROCESS: "En cours de validation", WITH_ISSUES: "À corriger" };

  const days = daily.map(toDay);
  const campaigns: AdCampaign[] = (campFirst.data ?? []).map((r) => {
    const s = r.campaign_id ? statuses.get(r.campaign_id) : undefined;
    return {
      id: r.campaign_id ?? "",
      name: r.campaign_name ?? "Campagne",
      status: s ? STATUS[s] ?? s : null,
      spend: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      conversions: conversionsOf(r.actions)
    };
  });
  return { days, campaigns };
}
