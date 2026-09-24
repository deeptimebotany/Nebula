// TikTok Ads — API Marketing (TikTok for Business) officielle, gratuite.
//
// Prérequis (côté Lucas) : un compte développeur sur
// business-api.tiktok.com, une application « Marketing API » avec la
// permission de lecture des rapports (Reporting) et des infos annonceur,
// validée par TikTok ; URL de retour : <site>/api/ads/callback/tiktok.
// Ce n'est PAS la même application que la connexion TikTok (publication) :
// ses identifiants vont dans TIKTOK_ADS_APP_ID / TIKTOK_ADS_APP_SECRET.
import { adsRedirectUri } from "./config";
import { AdsError, isoDay, num, type AdAccountChoice, type AdAccountRef, type AdReport, type AdTokens } from "./types";

const API = "https://business-api.tiktok.com/open_api/v1.3";

export function tiktokAdsAuthUrl(state: string): string {
  const url = new URL("https://business-api.tiktok.com/portal/auth");
  url.searchParams.set("app_id", process.env.TIKTOK_ADS_APP_ID || "");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", adsRedirectUri("tiktok"));
  return url.toString();
}

interface Envelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

function check<T>(json: Envelope<T>, status: number): T {
  if (json.code === 0 && json.data !== undefined) return json.data;
  // 40100/40104/40105 : jeton invalide ou révoqué.
  if (json.code && [40100, 40101, 40102, 40104, 40105].includes(json.code)) throw new AdsError("Connexion TikTok Ads expirée : reconnectez le compte.", 401);
  if (json.code === 40016 || json.code === 51021) throw new AdsError("TikTok limite temporairement les requêtes : nouvel essai plus tard.", 429);
  throw new AdsError(json.message || `TikTok a répondu ${status}.`, status >= 400 ? status : 400);
}

async function get<T>(path: string, params: Record<string, string | number | string[]>, token: string): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
  const res = await fetch(url, { headers: { "Access-Token": token }, cache: "no-store" });
  return check((await res.json().catch(() => ({}))) as Envelope<T>, res.status);
}

export async function exchangeTiktokAdsCode(code: string): Promise<AdTokens & { advertiserIds: string[] }> {
  const res = await fetch(`${API}/oauth2/access_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: process.env.TIKTOK_ADS_APP_ID, secret: process.env.TIKTOK_ADS_APP_SECRET, auth_code: code }),
    cache: "no-store"
  });
  const data = check((await res.json().catch(() => ({}))) as Envelope<{ access_token?: string; advertiser_ids?: (string | number)[] }>, res.status);
  if (!data.access_token) throw new AdsError("TikTok n'a pas renvoyé de jeton.", 401);
  // Jeton sans date d'expiration : il reste valable tant que l'annonceur ne
  // retire pas l'autorisation.
  return { accessToken: data.access_token, refreshToken: null, expiresAt: null, advertiserIds: (data.advertiser_ids ?? []).map(String) };
}

export async function listTiktokAdAccounts(tokens: AdTokens & { advertiserIds?: string[] }): Promise<AdAccountChoice[]> {
  let ids = tokens.advertiserIds ?? [];
  if (ids.length === 0) {
    const list = await get<{ list?: { advertiser_id: string | number }[] }>(
      "/oauth2/advertiser/get/",
      { app_id: process.env.TIKTOK_ADS_APP_ID || "", secret: process.env.TIKTOK_ADS_APP_SECRET || "" },
      tokens.accessToken
    );
    ids = (list.list ?? []).map((a) => String(a.advertiser_id));
  }
  if (ids.length === 0) return [];
  const out: AdAccountChoice[] = [];
  for (let i = 0; i < ids.length && i < 200; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const info = await get<{ list?: { advertiser_id: string | number; name?: string; currency?: string }[] }>(
        "/advertiser/info/",
        { advertiser_ids: chunk, fields: ["advertiser_id", "name", "currency"] },
        tokens.accessToken
      );
      for (const a of info.list ?? []) out.push({ externalId: String(a.advertiser_id), name: a.name || `Annonceur ${a.advertiser_id}`, currency: a.currency || "EUR" });
    } catch {
      for (const id of chunk) out.push({ externalId: id, name: `Annonceur ${id}`, currency: "EUR" });
    }
  }
  return out;
}

interface ReportRow {
  dimensions?: { stat_time_day?: string; campaign_id?: string | number };
  metrics?: Record<string, string | number | undefined>;
}

async function report(account: AdAccountRef, token: string, level: "AUCTION_ADVERTISER" | "AUCTION_CAMPAIGN", start: Date, end: Date): Promise<ReportRow[]> {
  const out: ReportRow[] = [];
  for (let page = 1; page <= 5; page++) {
    const data = await get<{ list?: ReportRow[]; page_info?: { total_page?: number } }>(
      "/report/integrated/get/",
      {
        advertiser_id: account.externalId,
        report_type: "BASIC",
        data_level: level,
        dimensions: level === "AUCTION_ADVERTISER" ? ["stat_time_day"] : ["campaign_id"],
        metrics: level === "AUCTION_ADVERTISER" ? ["spend", "impressions", "clicks", "conversion"] : ["campaign_name", "spend", "impressions", "clicks", "conversion"],
        start_date: isoDay(start),
        end_date: isoDay(end),
        page,
        page_size: level === "AUCTION_ADVERTISER" ? 100 : 50
      },
      token
    );
    out.push(...(data.list ?? []));
    if (level === "AUCTION_CAMPAIGN" || !data.page_info?.total_page || page >= data.page_info.total_page) break;
  }
  return out;
}

export async function fetchTiktokAdsReport(account: AdAccountRef, accessToken: string, start: Date, end: Date, withCampaigns = true): Promise<AdReport> {
  const [daily, campaigns] = await Promise.all([
    report(account, accessToken, "AUCTION_ADVERTISER", start, end),
    withCampaigns ? report(account, accessToken, "AUCTION_CAMPAIGN", start, end) : Promise.resolve([] as ReportRow[])
  ]);
  return {
    days: daily.map((r) => ({
      date: String(r.dimensions?.stat_time_day ?? "").slice(0, 10),
      spend: num(r.metrics?.spend),
      impressions: num(r.metrics?.impressions),
      clicks: num(r.metrics?.clicks),
      conversions: num(r.metrics?.conversion)
    })),
    campaigns: campaigns
      .map((r) => ({
        id: String(r.dimensions?.campaign_id ?? ""),
        name: String(r.metrics?.campaign_name ?? "Campagne"),
        status: null,
        spend: num(r.metrics?.spend),
        impressions: num(r.metrics?.impressions),
        clicks: num(r.metrics?.clicks),
        conversions: num(r.metrics?.conversion)
      }))
      .sort((a, b) => b.spend - a.spend)
  };
}
