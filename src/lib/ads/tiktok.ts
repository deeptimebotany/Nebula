// TikTok Ads — API Marketing (TikTok for Business) officielle, gratuite.
//
// Prérequis (côté Lucas) : un compte développeur sur
// business-api.tiktok.com, une application « Marketing API » avec la
// permission de lecture des rapports (Reporting) et des infos annonceur,
// validée par TikTok ; URL de retour : <site>/api/ads/callback/tiktok.
// Ce n'est PAS la même application que la connexion TikTok (publication) :
// ses identifiants vont dans TIKTOK_ADS_APP_ID / TIKTOK_ADS_APP_SECRET.
import type { ZodType, ZodTypeDef } from "zod";
import { adsRedirectUri } from "./config";
import { adsJson, toAdsError } from "./http";
import { isoDay, num, type AdAccountChoice, type AdAccountRef, type AdReport, type AdTokens } from "./types";
import { SocialApiError, checkShape } from "@/lib/social/base";
import { endpointLabel, idSchema, opt, soft, textSchema, z } from "@/lib/social/contract";
import { API_VERSIONS } from "@/lib/social/versions";

const API = `https://business-api.tiktok.com/open_api/${API_VERSIONS.TIKTOK_ADS.version}`;

// --- Contrats des réponses (lot 8, voir social/contract.ts) ------------------
// Doc : https://business-api.tiktok.com/portal/docs (oauth2/access_token,
//       advertiser/info, report/integrated/get). Réponses types :
//       tests/contracts/fixtures/tiktok-ads. Toutes les réponses ont la forme
// { code, message, request_id, data } ; code ≠ 0 = erreur, même avec un
// statut HTTP 200. Les identifiants d'annonceur (19 chiffres) sont lus en
// texte, jamais arrondis (avant le lot 8 : mauvais annonceur interrogé).
const metricsSchema = soft(z.record(z.union([z.string(), z.number()])));
// Rapport par jour : chaque ligne DOIT porter son jour ; par campagne : son identifiant.
const dailyRowSchema = z.object({ dimensions: z.object({ stat_time_day: z.string().min(10) }), metrics: metricsSchema });
const campaignRowSchema = z.object({ dimensions: z.object({ campaign_id: idSchema }), metrics: metricsSchema });
type ReportRow = { dimensions: { stat_time_day?: string; campaign_id?: string }; metrics?: Record<string, string | number> };
const reportSchema = <T extends z.ZodTypeAny>(row: T) => z.object({ list: z.array(row), page_info: soft(z.object({ total_page: soft(z.number()) })) });

export function tiktokAdsAuthUrl(state: string): string {
  const url = new URL("https://business-api.tiktok.com/portal/auth");
  url.searchParams.set("app_id", process.env.TIKTOK_ADS_APP_ID || "");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", adsRedirectUri("tiktok"));
  return url.toString();
}

/**
 * Appel à l'API Marketing : enveloppe { code, message, data } vérifiée, puis
 * `data` par son contrat. code ≠ 0 → erreur classée (voir TIKTOK_ADS_CODES
 * dans social/errors.ts : 40100 = limite de requêtes, 40104/40105 = jeton).
 */
async function call<T>(url: string, init: { method?: "GET" | "POST"; token?: string; body?: unknown }, data: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const method = init.method ?? "GET";
  const envelope = await adsJson("TIKTOK_ADS", url, {
    method,
    headers: { ...(init.token ? { "Access-Token": init.token } : {}), ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    readOnly: method === "GET",
    schema: z.object({ code: z.number(), message: textSchema, data: z.unknown() })
  });
  try {
    if (envelope.code !== 0) throw new SocialApiError("TIKTOK_ADS", envelope.message || `TikTok a répondu ${envelope.code}.`, 200, envelope, String(envelope.code));
    return checkShape("TIKTOK_ADS", z.object({ data }), envelope, endpointLabel(method, url), 200).data as T;
  } catch (err) {
    throw toAdsError("TIKTOK_ADS", err);
  }
}

function get<T>(path: string, params: Record<string, string | number | string[]>, token: string, data: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
  return call(url.toString(), { token }, data);
}

export async function exchangeTiktokAdsCode(code: string): Promise<AdTokens & { advertiserIds: string[] }> {
  const data = await call(
    `${API}/oauth2/access_token/`,
    { method: "POST", body: { app_id: process.env.TIKTOK_ADS_APP_ID, secret: process.env.TIKTOK_ADS_APP_SECRET, auth_code: code } },
    z.object({ access_token: z.string().min(1), advertiser_ids: opt(z.array(idSchema)), scope: soft(z.array(z.unknown())) })
  );
  // Jeton sans date d'expiration : il reste valable tant que l'annonceur ne
  // retire pas l'autorisation.
  return { accessToken: data.access_token, refreshToken: null, expiresAt: null, advertiserIds: data.advertiser_ids ?? [] };
}

export async function listTiktokAdAccounts(tokens: AdTokens & { advertiserIds?: string[] }): Promise<AdAccountChoice[]> {
  let ids = tokens.advertiserIds ?? [];
  if (ids.length === 0) {
    const list = await get(
      "/oauth2/advertiser/get/",
      { app_id: process.env.TIKTOK_ADS_APP_ID || "", secret: process.env.TIKTOK_ADS_APP_SECRET || "" },
      tokens.accessToken,
      z.object({ list: opt(z.array(z.object({ advertiser_id: idSchema, advertiser_name: textSchema }))) })
    );
    ids = (list.list ?? []).map((a) => a.advertiser_id);
  }
  if (ids.length === 0) return [];
  const out: AdAccountChoice[] = [];
  for (let i = 0; i < ids.length && i < 200; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const info = await get(
        "/advertiser/info/",
        { advertiser_ids: chunk, fields: ["advertiser_id", "name", "currency"] },
        tokens.accessToken,
        z.object({ list: opt(z.array(z.object({ advertiser_id: idSchema, name: textSchema, currency: textSchema }))) })
      );
      for (const a of info.list ?? []) out.push({ externalId: a.advertiser_id, name: a.name || `Annonceur ${a.advertiser_id}`, currency: a.currency || "EUR" });
    } catch {
      for (const id of chunk) out.push({ externalId: id, name: `Annonceur ${id}`, currency: "EUR" });
    }
  }
  return out;
}

async function report(account: AdAccountRef, token: string, level: "AUCTION_ADVERTISER" | "AUCTION_CAMPAIGN", start: Date, end: Date): Promise<ReportRow[]> {
  const out: ReportRow[] = [];
  for (let page = 1; page <= 5; page++) {
    const data = await get(
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
      token,
      (level === "AUCTION_ADVERTISER" ? reportSchema(dailyRowSchema) : reportSchema(campaignRowSchema)) as z.ZodType<{ list: ReportRow[]; page_info?: { total_page?: number } }, z.ZodTypeDef, unknown>
    );
    out.push(...data.list);
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
      date: String(r.dimensions.stat_time_day ?? "").slice(0, 10),
      spend: num(r.metrics?.spend),
      impressions: num(r.metrics?.impressions),
      clicks: num(r.metrics?.clicks),
      conversions: num(r.metrics?.conversion)
    })),
    campaigns: campaigns
      .map((r) => ({
        id: r.dimensions.campaign_id ?? "",
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
