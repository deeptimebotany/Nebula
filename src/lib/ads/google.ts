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
import { adsJson } from "./http";
import { AdsError, isoDay, num, type AdAccountChoice, type AdAccountRef, type AdReport, type AdTokens } from "./types";
import type { SocialApiError } from "@/lib/social/base";
import { countSchema, idSchema, opt, soft, textSchema, z } from "@/lib/social/contract";
import { googleAdsApiVersion } from "@/lib/social/versions";

// Version centralisée dans social/versions.ts (lot 8) ; GOOGLE_ADS_API_VERSION
// permet de passer à la suivante sans attendre une mise à jour du code.
const API = () => `https://googleads.googleapis.com/${googleAdsApiVersion()}`;

// --- Contrats des réponses (lot 8, voir social/contract.ts) ------------------
// Doc : https://developers.google.com/google-ads/api/rest/reference/rest (googleAds:search,
//       customers:listAccessibleCustomers) et https://developers.google.com/identity/protocols/oauth2/web-server
// Réponses types : tests/contracts/fixtures/google-ads. En JSON, Google omet
// les valeurs nulles (0, liste vide) : un compteur absent vaut 0, une liste
// absente est vide.
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: opt(z.string().min(1)), expires_in: soft(z.number()) });
const metricsSchema = soft(z.object({ costMicros: countSchema, impressions: countSchema, clicks: countSchema, conversions: countSchema }));
const dailyRowSchema = z.object({ segments: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), metrics: metricsSchema });
const campaignRowSchema = z.object({ campaign: z.object({ id: idSchema, name: textSchema, status: textSchema }), metrics: metricsSchema });
const customerRowSchema = z.object({
  customer: soft(z.object({ id: textSchema, descriptiveName: textSchema, currencyCode: textSchema, manager: soft(z.boolean()), testAccount: soft(z.boolean()) }))
});
const clientRowSchema = z.object({
  customerClient: soft(
    z.object({ id: textSchema, descriptiveName: textSchema, currencyCode: textSchema, manager: soft(z.boolean()), level: soft(z.union([z.string(), z.number()])), status: textSchema })
  )
});

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
  const json = await adsJson(
    "GOOGLE_ADS",
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: googleAdsClientId(), client_secret: googleAdsClientSecret(), ...body }),
      schema: tokenSchema
    },
    // Refus de Google (autorisation retirée, code déjà utilisé…) : connexion à refaire.
    (err: SocialApiError) => {
      const raw = err.raw as { error?: unknown; error_description?: unknown } | undefined;
      if (typeof raw?.error !== "string") return null;
      return new AdsError(typeof raw.error_description === "string" && raw.error_description ? raw.error_description : "Google a refusé la connexion.", 401, "AUTH_EXPIRED");
    }
  );
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

/** Requête GAQL paginée ; chaque ligne est vérifiée par `row`. */
async function search<T>(token: string, customerId: string, query: string, row: z.ZodType<T, z.ZodTypeDef, unknown>, loginCustomerId?: string | null): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  const schema = z.object({ results: opt(z.array(row)), nextPageToken: textSchema });
  for (let page = 0; page < 10; page++) {
    // Lecture (POST sans effet) : relancée comme une lecture.
    const json = await adsJson(
      "GOOGLE_ADS",
      `${API()}/customers/${customerId}/googleAds:search`,
      { method: "POST", headers: headers(token, loginCustomerId), body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }), readOnly: true, schema },
      googleAdsError
    );
    out.push(...(json.results ?? []));
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return out;
}

/**
 * Refus propres à Google Ads, en message clair. Les codes précis (ex.
 * CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION) sont dans error.details : on
 * cherche dans toute la réponse. Les autres erreurs sont classées par la
 * porte commune (connexion expirée, limite, panne…).
 */
function googleAdsError(err: SocialApiError): AdsError | null {
  const raw = JSON.stringify(err.raw ?? {});
  if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|DEVELOPER_TOKEN_NOT_APPROVED|not approved/i.test(raw)) {
    return new AdsError(
      "Le projet Google Cloud de Nebula n'a encore que l'accès « Test » à l'API Google Ads : seuls les comptes de test répondent. Demandez l'accès Explorer (console Google Cloud → Google Ads API → Apply for access).",
      403,
      "PERMISSION_MISSING"
    );
  }
  if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(raw)) {
    return new AdsError("L'API Google Ads n'est pas activée dans le projet Google Cloud de Nebula.", 403, "PERMISSION_MISSING");
  }
  return null;
}

/** Comptes accessibles : comptes directs + clients des comptes administrateurs. */
export async function listGoogleAdsAccounts(tokens: AdTokens): Promise<AdAccountChoice[]> {
  const json = await adsJson(
    "GOOGLE_ADS",
    `${API()}/customers:listAccessibleCustomers`,
    { headers: headers(tokens.accessToken), schema: z.object({ resourceNames: opt(z.array(z.string())) }) },
    googleAdsError
  );
  const ids = (json.resourceNames ?? []).map((r) => r.split("/")[1]).filter(Boolean).slice(0, 20);
  const out = new Map<string, AdAccountChoice>();
  for (const id of ids) {
    try {
      const [row] = await search(tokens.accessToken, id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1", customerRowSchema);
      const c = row?.customer;
      if (!c) continue;
      if (!c.manager) {
        out.set(id, { externalId: id, name: c.descriptiveName || `Compte ${id}`, currency: c.currencyCode || "EUR", loginCustomerId: null });
        continue;
      }
      const clients = await search(
        tokens.accessToken,
        id,
        "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.level, customer_client.status FROM customer_client WHERE customer_client.level <= 1",
        clientRowSchema,
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

export async function fetchGoogleAdsReport(account: AdAccountRef, accessToken: string, start: Date, end: Date, withCampaigns = true): Promise<AdReport> {
  const range = `segments.date BETWEEN '${isoDay(start)}' AND '${isoDay(end)}'`;
  const daily = await search(
    accessToken,
    account.externalId,
    `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM customer WHERE ${range}`,
    dailyRowSchema,
    account.loginCustomerId
  );
  const campaigns = !withCampaigns
    ? []
    : await search(
        accessToken,
        account.externalId,
        `SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE ${range} AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 50`,
        campaignRowSchema,
        account.loginCustomerId
      );
  const STATUS: Record<string, string> = { ENABLED: "Active", PAUSED: "En pause" };
  return {
    days: daily.map((r) => ({
      date: r.segments.date,
      spend: num(r.metrics?.costMicros) / 1_000_000,
      impressions: num(r.metrics?.impressions),
      clicks: num(r.metrics?.clicks),
      conversions: num(r.metrics?.conversions)
    })),
    campaigns: campaigns.map((r) => ({
      id: r.campaign.id,
      name: r.campaign.name ?? "Campagne",
      status: r.campaign.status ? STATUS[r.campaign.status] ?? r.campaign.status : null,
      spend: num(r.metrics?.costMicros) / 1_000_000,
      impressions: num(r.metrics?.impressions),
      clicks: num(r.metrics?.clicks),
      conversions: num(r.metrics?.conversions)
    }))
  };
}
