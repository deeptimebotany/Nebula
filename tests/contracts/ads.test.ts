// Contrats des régies publicitaires — lot 8.
// Réponses types d'après la documentation officielle :
//  - Google Ads : https://developers.google.com/google-ads/api/rest/reference/rest
//    (googleAds:search, customers:listAccessibleCustomers)
//  - Meta : https://developers.facebook.com/docs/marketing-api/insights,
//    /marketing-api/reference/ad-account
//  - TikTok : https://business-api.tiktok.com/portal/docs (oauth2/access_token,
//    advertiser/info, report/integrated/get)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(async () => null) } } }));

import { getAdsClient } from "@/lib/ads";
import { refreshGoogleAdsToken } from "@/lib/ads/google";
import { AdsError, type AdAccountRef } from "@/lib/ads/types";
import { API_VERSIONS } from "@/lib/social/versions";
import { fixture, installNetwork, without } from "./harness";

const GA = `googleads.googleapis.com/${API_VERSIONS.GOOGLE_ADS.version}`;
const FB = `graph.facebook.com/${API_VERSIONS.META_GRAPH.version}`;
const TT = `business-api.tiktok.com/open_api/${API_VERSIONS.TIKTOK_ADS.version}`;

const account = (over: Partial<AdAccountRef> = {}): AdAccountRef => ({
  id: "ad-1",
  externalId: "1234567890",
  accessToken: "TOKEN",
  refreshToken: null,
  tokenExpiresAt: null,
  loginCustomerId: null,
  ...over
});
const START = new Date("2026-08-26T00:00:00Z");
const END = new Date("2026-09-24T00:00:00Z");

async function adsError(p: Promise<unknown>): Promise<AdsError> {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(AdsError);
  return err as AdsError;
}

beforeEach(() => {
  process.env.NEXTAUTH_URL = "https://nebulahub.space";
  process.env.GOOGLE_ADS_CLIENT_ID = "ga-id";
  process.env.GOOGLE_ADS_CLIENT_SECRET = "ga-secret";
  process.env.META_APP_ID = "meta-id";
  process.env.META_APP_SECRET = "meta-secret";
  process.env.TIKTOK_ADS_APP_ID = "tt-id";
  process.env.TIKTOK_ADS_APP_SECRET = "tt-secret";
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  delete process.env.GOOGLE_ADS_API_VERSION;
  delete process.env.META_ADS_GRAPH_VERSION;
});
afterEach(() => vi.unstubAllGlobals());

describe("Google Ads", () => {
  it("connexion : comptes directs et clients actifs d'un compte administrateur", async () => {
    const net = installNetwork([
      { method: "POST", url: "oauth2.googleapis.com/token", fixture: "google-ads/oauth-token" },
      { url: `${GA}/customers:listAccessibleCustomers`, fixture: "google-ads/accessible-customers" },
      { method: "POST", url: `${GA}/customers/1234567890/googleAds:search`, fixture: "google-ads/customer-direct" },
      { method: "POST", url: `${GA}/customers/9876543210/googleAds:search`, times: 1, fixture: "google-ads/customer-manager" },
      { method: "POST", url: `${GA}/customers/9876543210/googleAds:search`, times: 1, fixture: "google-ads/customer-clients" }
    ]);
    const { tokens, accounts } = await getAdsClient("GOOGLE_ADS").connect("CODE");
    expect(tokens).toMatchObject({ accessToken: "ya29.ads-exemple", refreshToken: "1//0ads-exemple" });
    expect(accounts).toEqual([
      { externalId: "1234567890", name: "Café Nebula", currency: "EUR", loginCustomerId: null },
      { externalId: "1112223334", name: "Boulangerie cliente", currency: "EUR", loginCustomerId: "9876543210" }
    ]);
    const clientsQuery = net.to(/9876543210\/googleAds:search$/)[1];
    expect(clientsQuery.headers["login-customer-id"]).toBe("9876543210");
    expect(clientsQuery.headers["developer-token"]).toBeUndefined();
    expect(net.unmatched).toEqual([]);
  });

  it("rapport : micros → euros, compteurs absents (zéro chez Google) → 0, statuts traduits", async () => {
    installNetwork([
      { method: "POST", url: `${GA}/customers/1234567890/googleAds:search`, reply: (req) => ({ raw: JSON.stringify(fixture(/FROM campaign/.test(req.body) ? "google-ads/report-campaigns" : "google-ads/report-daily")) }) }
    ]);
    const report = await getAdsClient("GOOGLE_ADS").report(account(), "TOKEN", START, END);
    expect(report.days).toEqual([
      { date: "2026-09-23", spend: 4.56, impressions: 1500, clicks: 12, conversions: 1.5 },
      { date: "2026-09-24", spend: 0.01, impressions: 20, clicks: 0, conversions: 0 }
    ]);
    expect(report.campaigns.map((c) => [c.id, c.status, c.spend])).toEqual([
      ["111", "Active", 4.57],
      ["222", "En pause", 0]
    ]);
  });

  it("aucune diffusion : rapport vide sans erreur", async () => {
    installNetwork([{ method: "POST", url: `${GA}/customers/1234567890/googleAds:search`, fixture: "google-ads/report-empty" }]);
    expect((await getAdsClient("GOOGLE_ADS").report(account(), "TOKEN", START, END, false)).days).toEqual([]);
  });

  it("dérive : ligne sans date → réponse inattendue (jamais un jour perdu en silence)", async () => {
    installNetwork([{ method: "POST", url: `${GA}/customers/1234567890/googleAds:search`, body: without(fixture("google-ads/report-daily"), "results.0.segments") }]);
    const err = await adsError(getAdsClient("GOOGLE_ADS").report(account(), "TOKEN", START, END, false));
    expect(err).toMatchObject({ status: 502, category: "UNEXPECTED_RESPONSE" });
  });

  it("projet en accès « Test » : message clair ; jeton refusé → à reconnecter ; quota → nouvel essai", async () => {
    installNetwork([{ method: "POST", url: `${GA}/customers/1234567890/googleAds:search`, status: 403, fixture: "google-ads/error-not-approved" }]);
    expect((await adsError(getAdsClient("GOOGLE_ADS").report(account(), "TOKEN", START, END, false))).message).toMatch(/accès « Test »/);
    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: `${GA}/customers/1234567890/googleAds:search`, status: 401, fixture: "google-ads/error-unauthenticated" }]);
    expect((await adsError(getAdsClient("GOOGLE_ADS").report(account(), "TOKEN", START, END, false))).status).toBe(401);
    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: `${GA}/customers/1234567890/googleAds:search`, status: 429, fixture: "google-ads/error-quota" }]);
    expect((await adsError(getAdsClient("GOOGLE_ADS").report(account(), "TOKEN", START, END, false))).status).toBe(429);
  });

  it("renouvellement refusé (invalid_grant) : compte à reconnecter", async () => {
    installNetwork([{ method: "POST", url: "oauth2.googleapis.com/token", status: 400, fixture: "google-ads/oauth-invalid-grant" }]);
    expect((await adsError(refreshGoogleAdsToken("1//0old"))).status).toBe(401);
  });
});

describe("Meta Ads", () => {
  it("connexion : jeton longue durée, comptes fermés exclus", async () => {
    installNetwork([
      { url: `${FB}/oauth/access_token`, fixture: "meta-ads/oauth-token" },
      { url: `${FB}/me/adaccounts`, fixture: "meta-ads/ad-accounts" }
    ]);
    const { tokens, accounts } = await getAdsClient("META_ADS").connect("CODE");
    expect(tokens.accessToken).toBe("EAAB-ads-exemple");
    expect(accounts).toEqual([{ externalId: "123456789012345", name: "Café Nebula – publicité", currency: "EUR" }]);
  });

  it("rapport : conversions sans double compte, portée, preuve de la clé secrète envoyée", async () => {
    const net = installNetwork([
      { url: `${FB}/act_123456789012345/insights`, reply: (req) => ({ raw: JSON.stringify(fixture(req.url.searchParams.get("level") === "campaign" ? "meta-ads/insights-campaigns" : "meta-ads/insights-daily")) }) },
      { url: `${FB}/act_123456789012345/campaigns`, fixture: "meta-ads/campaigns" }
    ]);
    const report = await getAdsClient("META_ADS").report(account({ externalId: "123456789012345" }), "TOKEN", START, END);
    expect(report.days[0]).toEqual({ date: "2026-09-23", spend: 12.34, impressions: 1500, clicks: 40, conversions: 3, reach: 1200 });
    expect(report.campaigns[0]).toMatchObject({ id: "120210000000000001", name: "Automne 2026", status: "Active", conversions: 3 });
    // Sans appsecret_proof, l'option « Exiger la clé secrète » de Meta bloquait tout.
    expect(net.sent[0].url.searchParams.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("erreurs classées par code : autorisation manquante ≠ connexion expirée (avant : tout « à reconnecter »)", async () => {
    const run = () => getAdsClient("META_ADS").report(account({ externalId: "123456789012345" }), "TOKEN", START, END, false);
    installNetwork([{ url: `${FB}/act_123456789012345/insights`, status: 403, fixture: "meta-ads/error-permission" }]);
    expect((await adsError(run())).status).toBe(403);
    vi.unstubAllGlobals();
    installNetwork([{ url: `${FB}/act_123456789012345/insights`, status: 400, fixture: "meta-ads/error-rate-limit" }]);
    expect((await adsError(run())).status).toBe(429);
    vi.unstubAllGlobals();
    installNetwork([{ url: `${FB}/act_123456789012345/insights`, status: 400, fixture: "meta-ads/error-expired" }]);
    expect((await adsError(run())).status).toBe(401);
  });

  it("dérive : « data » absent → réponse inattendue", async () => {
    installNetwork([{ url: `${FB}/act_123456789012345/insights`, body: { rows: [] } }]);
    expect(await adsError(getAdsClient("META_ADS").report(account({ externalId: "123456789012345" }), "TOKEN", START, END, false))).toMatchObject({
      status: 502,
      category: "UNEXPECTED_RESPONSE"
    });
  });
});

describe("TikTok Ads", () => {
  it("connexion : identifiant d'annonceur de 19 chiffres JAMAIS arrondi (même envoyé en nombre)", async () => {
    installNetwork([
      // Variante de tiktok-ads/oauth-token avec l'identifiant envoyé en nombre JSON.
      { method: "POST", url: `${TT}/oauth2/access_token/`, raw: '{"code":0,"message":"OK","data":{"access_token":"tt","advertiser_ids":[7012345678901234567]}}' },
      { url: `${TT}/advertiser/info/`, fixture: "tiktok-ads/advertiser-info" }
    ]);
    const { accounts } = await getAdsClient("TIKTOK_ADS").connect("CODE");
    expect(accounts).toEqual([{ externalId: "7012345678901234567", name: "Café Nebula", currency: "EUR" }]);
  });

  it("rapport : jours et campagnes triées par dépense", async () => {
    installNetwork([
      { url: `${TT}/report/integrated/get/`, reply: (req) => ({ raw: JSON.stringify(fixture(req.url.searchParams.get("data_level") === "AUCTION_CAMPAIGN" ? "tiktok-ads/report-campaigns" : "tiktok-ads/report-daily")) }) }
    ]);
    const report = await getAdsClient("TIKTOK_ADS").report(account({ externalId: "7012345678901234567" }), "TOKEN", START, END);
    expect(report.days).toEqual([
      { date: "2026-09-23", spend: 12.5, impressions: 1500, clicks: 30, conversions: 2 },
      { date: "2026-09-24", spend: 3, impressions: 400, clicks: 5, conversions: 0 }
    ]);
    expect(report.campaigns[0]).toMatchObject({ id: "1790000000000000001", name: "Automne 2026", spend: 15.5 });
  });

  it("code 40100 = limite de requêtes (nouvel essai), PAS un jeton invalide ; 40105 = à reconnecter", async () => {
    const run = () => getAdsClient("TIKTOK_ADS").report(account(), "TOKEN", START, END, false);
    installNetwork([{ url: `${TT}/report/integrated/get/`, fixture: "tiktok-ads/error-too-frequent" }]);
    expect((await adsError(run())).status).toBe(429);
    vi.unstubAllGlobals();
    installNetwork([{ url: `${TT}/report/integrated/get/`, fixture: "tiktok-ads/error-revoked" }]);
    expect((await adsError(run())).status).toBe(401);
  });

  it("dérive : jour absent d'une ligne → réponse inattendue", async () => {
    installNetwork([{ url: `${TT}/report/integrated/get/`, body: without(fixture("tiktok-ads/report-daily"), "data.list.0.dimensions.stat_time_day") }]);
    expect(await adsError(getAdsClient("TIKTOK_ADS").report(account(), "TOKEN", START, END, false))).toMatchObject({ status: 502, category: "UNEXPECTED_RESPONSE" });
  });
});
