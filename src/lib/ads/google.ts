// Google Ads (lot 5) — API officielle, gratuite, via requêtes GAQL.
//
// Accès (nouveau parcours depuis le 10/09/2026) : plus de compte
// administrateur ni de « jeton de développeur » — le Centre API de Google
// Ads ne délivre plus de jetons. L'accès est porté par le projet Google
// Cloud qui a émis le client OAuth (celui de la connexion Google, sinon
// GOOGLE_ADS_CLIENT_ID) : console.cloud.google.com/google/ads-apis/overview
// → activer l'API (niveau Test), puis « Apply for access » → Explorer
// (comptes réels, 2 880 opérations/jour, largement assez pour lire des
// statistiques), puis Basic après la validation de la marque du projet.
// URL de retour <site>/api/ads/callback/google ; scope adwords (lecture et
// gestion des campagnes — Nebula ne fait que lire).
import { adsRedirectUri, googleAdsClientId, googleAdsClientSecret } from "./config";
import { AdsError, isoDay, num, type AdAccountChoice, type AdAccountRef, type AdReport, type AdTokens } from "./types";

// Les versions de l'API Google Ads sont retirées environ un an après leur
// sortie : GOOGLE_ADS_API_VERSION permet de passer à la suivante sans
// attendre une mise à jour du code.
const VERSION = () => process.env.GOOGLE_ADS_API_VERSION || "v25";
const API = () => `https://googleads.googleapis.com/${VERSION()}`;

export function googleAdsAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleAdsClientId());
  url.searchParams.set("redirect_uri", adsRedirectUri("google"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(body: Record<string, string>): Promise<AdTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: googleAdsClientId(), client_secret: googleAdsClientSecret(), ...body }),
    cache: "no-store"
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new AdsError(json.error_description || "Google a refusé la connexion.", 401);
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000) };
}

export const exchangeGoogleAdsCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: adsRedirectUri("google") });
export const refreshGoogleAdsToken = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

function headers(token: string, loginCustomerId?: string | null): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    // Facultatif et ignoré par Google depuis septembre 2026 (et refusé dans
    // une future version de l'API) : envoyé seulement s'il est encore
    // renseigné, pour les projets qui en avaient un.
    ...(process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? { "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN } : {}),
    "Content-Type": "application/json",
    ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {})
  };
}

async function search<T>(token: string, customerId: string, query: string, loginCustomerId?: string | null): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await fetch(`${API()}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: headers(token, loginCustomerId),
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
      cache: "no-store"
    });
    const json = (await res.json().catch(() => ({}))) as { results?: T[]; nextPageToken?: string; error?: GoogleApiError };
    if (!res.ok) throw googleAdsError(res.status, json.error);
    out.push(...(json.results ?? []));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return out;
}

interface GoogleApiError {
  message?: string;
  status?: string;
  details?: unknown[];
}

/**
 * Traduit les refus de l'API en message clair. Les codes précis (ex.
 * CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION) sont dans error.details : on
 * cherche dans toute la réponse.
 */
function googleAdsError(status: number, error: GoogleApiError | undefined): AdsError {
  const raw = JSON.stringify(error ?? {});
  if (status === 401) return new AdsError("Connexion Google Ads expirée : reconnectez le compte.", 401);
  if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|DEVELOPER_TOKEN_NOT_APPROVED|not approved/i.test(raw)) {
    return new AdsError(
      "Le projet Google Cloud de Nebula n'a encore que l'accès « Test » à l'API Google Ads : seuls les comptes de test répondent. Demandez l'accès Explorer (console Google Cloud → Google Ads API → Apply for access).",
      403
    );
  }
  if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(raw)) {
    return new AdsError("L'API Google Ads n'est pas activée dans le projet Google Cloud de Nebula.", 403);
  }
  return new AdsError(error?.message || `Google Ads a répondu ${status}.`, status);
}

interface CustomerRow {
  customer?: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean; testAccount?: boolean };
}
interface ClientRow {
  customerClient?: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean; level?: string | number; status?: string };
}

/** Comptes accessibles : comptes directs + clients des comptes administrateurs. */
export async function listGoogleAdsAccounts(tokens: AdTokens): Promise<AdAccountChoice[]> {
  const res = await fetch(`${API()}/customers:listAccessibleCustomers`, { headers: headers(tokens.accessToken), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { resourceNames?: string[]; error?: GoogleApiError };
  if (!res.ok) throw googleAdsError(res.status, json.error ?? { message: "Impossible de lister vos comptes Google Ads." });
  const ids = (json.resourceNames ?? []).map((r) => r.split("/")[1]).filter(Boolean).slice(0, 20);
  const out = new Map<string, AdAccountChoice>();
  for (const id of ids) {
    try {
      const [row] = await search<CustomerRow>(tokens.accessToken, id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1");
      const c = row?.customer;
      if (!c) continue;
      if (!c.manager) {
        out.set(id, { externalId: id, name: c.descriptiveName || `Compte ${id}`, currency: c.currencyCode || "EUR", loginCustomerId: null });
        continue;
      }
      const clients = await search<ClientRow>(
        tokens.accessToken,
        id,
        "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.level, customer_client.status FROM customer_client WHERE customer_client.level <= 1",
        id
      );
      for (const cl of clients) {
        const cc = cl.customerClient;
        if (!cc?.id || cc.manager || (cc.status && cc.status !== "ENABLED")) continue;
        if (!out.has(cc.id)) out.set(cc.id, { externalId: cc.id, name: cc.descriptiveName || `Compte ${cc.id}`, currency: cc.currencyCode || "EUR", loginCustomerId: id });
      }
    } catch {
      // Compte inaccessible (suspendu, droits insuffisants) : ignoré.
    }
  }
  return Array.from(out.values());
}

interface ReportRow {
  segments?: { date?: string };
  campaign?: { id?: string; name?: string; status?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number | string };
}

export async function fetchGoogleAdsReport(account: AdAccountRef, accessToken: string, start: Date, end: Date, withCampaigns = true): Promise<AdReport> {
  const range = `segments.date BETWEEN '${isoDay(start)}' AND '${isoDay(end)}'`;
  const daily = await search<ReportRow>(
    accessToken,
    account.externalId,
    `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM customer WHERE ${range}`,
    account.loginCustomerId
  );
  const campaigns = !withCampaigns ? [] : await search<ReportRow>(
    accessToken,
    account.externalId,
    `SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE ${range} AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 50`,
    account.loginCustomerId
  );
  const STATUS: Record<string, string> = { ENABLED: "Active", PAUSED: "En pause" };
  return {
    days: daily.map((r) => ({
      date: r.segments?.date ?? "",
      spend: num(r.metrics?.costMicros) / 1_000_000,
      impressions: num(r.metrics?.impressions),
      clicks: num(r.metrics?.clicks),
      conversions: num(r.metrics?.conversions)
    })),
    campaigns: campaigns.map((r) => ({
      id: r.campaign?.id ?? "",
      name: r.campaign?.name ?? "Campagne",
      status: r.campaign?.status ? STATUS[r.campaign.status] ?? r.campaign.status : null,
      spend: num(r.metrics?.costMicros) / 1_000_000,
      impressions: num(r.metrics?.impressions),
      clicks: num(r.metrics?.clicks),
      conversions: num(r.metrics?.conversions)
    }))
  };
}
