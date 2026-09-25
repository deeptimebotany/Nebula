// Meta Ads (Facebook + Instagram) — API Marketing officielle, gratuite.
//
// Prérequis (côté Lucas) : la même application Meta que pour Instagram et
// Facebook (META_APP_ID / META_APP_SECRET), avec le cas d'usage « Créer et
// gérer des publicités avec l'API Marketing » et la permission ads_read
// validée par Meta (App Review, accès avancé). Tant qu'elle ne l'est pas,
// seuls les comptes pub des administrateurs de l'app fonctionnent : c'est
// pour ça que Meta Ads ne s'affiche qu'avec META_ADS_ENABLED="true".
// URL de retour à déclarer : <site>/api/ads/callback/meta
import { createHmac } from "crypto";
import type { ZodType, ZodTypeDef } from "zod";
import { adsRedirectUri } from "./config";
import { adsJson } from "./http";
import { isoDay, num, type AdAccountChoice, type AdAccountRef, type AdCampaign, type AdDay, type AdReport, type AdTokens } from "./types";
import { countSchema, graphList, idSchema, soft, textSchema, z } from "@/lib/social/contract";
import { metaGraphVersion } from "@/lib/social/versions";

// v25.0 (février 2026). META_ADS_GRAPH_VERSION permet de monter de version
// sans toucher au code quand Meta annonce la fin de celle-ci.
// Même version que la publication (voir social/versions.ts), sauf réglage dédié.
const VERSION = () => process.env.META_ADS_GRAPH_VERSION || metaGraphVersion();
const GRAPH = () => `https://graph.facebook.com/${VERSION()}`;

// --- Contrats des réponses (lot 8, voir social/contract.ts) ------------------
// Doc : https://developers.facebook.com/docs/marketing-api/insights et
//       https://developers.facebook.com/docs/marketing-api/reference/ad-account
// Réponses types : tests/contracts/fixtures/meta-ads.
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: soft(z.number()) });
const insightRowSchema = z.object({
  date_start: textSchema,
  campaign_id: textSchema,
  campaign_name: textSchema,
  spend: countSchema,
  impressions: countSchema,
  clicks: countSchema,
  reach: countSchema,
  actions: soft(z.array(z.object({ action_type: z.string(), value: countSchema })))
});
type InsightRow = z.output<typeof insightRowSchema>;
// Rapport par jour : chaque ligne DOIT porter sa date (sinon le jour serait perdu).
const dailyRowSchema = insightRowSchema.extend({ date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const adAccountSchema = z.object({ account_id: idSchema, name: textSchema, currency: textSchema, account_status: soft(z.number()) });

export function metaAdsAuthUrl(state: string): string {
  const url = new URL(`https://www.facebook.com/${VERSION()}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID || "");
  url.searchParams.set("redirect_uri", adsRedirectUri("meta"));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "ads_read");
  return url.toString();
}

/**
 * Lecture Graph API. Lot 8 : appsecret_proof ajouté comme pour la
 * publication (sans lui, l'option « Exiger la clé secrète de l'application »
 * de Meta bloquait toute la publicité), et classement des erreurs par code :
 * avant, toute « OAuthException » — y compris une limite de débit (code 4)
 * ou une autorisation manquante (code 10) — marquait le compte « à
 * reconnecter ».
 */
async function graphGet<T>(path: string, params: Record<string, string>, token: string, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (token) {
    if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", token);
    const secret = process.env.META_APP_SECRET;
    if (secret && !url.searchParams.has("appsecret_proof")) url.searchParams.set("appsecret_proof", createHmac("sha256", secret).update(token).digest("hex"));
  }
  return adsJson("META_ADS", url.toString(), { schema });
}

export async function exchangeMetaAdsCode(code: string): Promise<AdTokens> {
  const short = await graphGet(
    "/oauth/access_token",
    { client_id: process.env.META_APP_ID || "", client_secret: process.env.META_APP_SECRET || "", redirect_uri: adsRedirectUri("meta"), code },
    "",
    tokenSchema
  );
  // Jeton longue durée (~60 jours) : Nebula prévient avant qu'il expire.
  const long = await graphGet(
    "/oauth/access_token",
    { grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID || "", client_secret: process.env.META_APP_SECRET || "", fb_exchange_token: short.access_token },
    "",
    tokenSchema
  );
  return { accessToken: long.access_token, refreshToken: null, expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86_400) * 1000) };
}

/** Toutes les pages d'une liste Graph API (liste stricte : `data` obligatoire). */
async function allPages<T extends z.ZodTypeAny>(path: string, params: Record<string, string>, token: string, item: T, maxPages = 10): Promise<z.output<T>[]> {
  const schema = graphList(item);
  const first = await graphGet(path, params, token, schema);
  const out: z.output<T>[] = [...first.data];
  let next = first.paging?.next;
  for (let i = 1; next && i < maxPages; i++) {
    const page = await graphGet(next, {}, token, schema);
    out.push(...page.data);
    next = page.paging?.next;
  }
  return out;
}

export async function listMetaAdAccounts(tokens: AdTokens): Promise<AdAccountChoice[]> {
  const rows = await allPages("/me/adaccounts", { fields: "account_id,name,currency,account_status", limit: "100" }, tokens.accessToken, adAccountSchema, 5);
  // account_status : 1 = actif, 2 = désactivé, 101 = fermé… on garde tout
  // sauf les comptes fermés, un compte en pause a quand même un historique.
  return rows
    .filter((r) => r.account_status !== 101)
    .map((r) => ({ externalId: r.account_id, name: r.name || `Compte ${r.account_id}`, currency: r.currency || "EUR" }));
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

function toDay(r: InsightRow & { date_start: string }): AdDay {
  return {
    date: r.date_start,
    spend: num(r.spend),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    conversions: conversionsOf(r.actions),
    reach: r.reach !== undefined ? num(r.reach) : null
  };
}

export async function fetchMetaAdsReport(account: AdAccountRef, accessToken: string, start: Date, end: Date, withCampaigns = true): Promise<AdReport> {
  const act = `/act_${account.externalId}`;
  const timeRange = JSON.stringify({ since: isoDay(start), until: isoDay(end) });
  const daily = await allPages(
    `${act}/insights`,
    { level: "account", time_increment: "1", time_range: timeRange, fields: "spend,impressions,clicks,reach,actions", limit: "100" },
    accessToken,
    dailyRowSchema
  );
  if (!withCampaigns) return { days: daily.map(toDay), campaigns: [] };
  const campRows = await allPages(
    `${act}/insights`,
    { level: "campaign", time_range: timeRange, fields: "campaign_id,campaign_name,spend,impressions,clicks,actions", limit: "50", sort: "spend_descending" },
    accessToken,
    insightRowSchema,
    1
  );
  const statuses = new Map<string, string>();
  try {
    const st = await graphGet(`${act}/campaigns`, { fields: "id,effective_status", limit: "200" }, accessToken, graphList(z.object({ id: idSchema, effective_status: textSchema })));
    for (const c of st.data) if (c.effective_status) statuses.set(c.id, c.effective_status);
  } catch {
    // Statut facultatif.
  }
  const STATUS: Record<string, string> = { ACTIVE: "Active", PAUSED: "En pause", CAMPAIGN_PAUSED: "En pause", ARCHIVED: "Archivée", IN_PROCESS: "En cours de validation", WITH_ISSUES: "À corriger" };

  const days = daily.map(toDay);
  const campaigns: AdCampaign[] = campRows.map((r) => {
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
