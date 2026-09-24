// Point d'entrée des régies publicitaires (lot 5) : une seule table de
// correspondance plateforme → client, utilisée par les routes et la synchro.
import { exchangeGoogleAdsCode, fetchGoogleAdsReport, googleAdsAuthUrl, listGoogleAdsAccounts, refreshGoogleAdsToken } from "./google";
import { exchangeMetaAdsCode, fetchMetaAdsReport, listMetaAdAccounts, metaAdsAuthUrl } from "./meta";
import { exchangeTiktokAdsCode, fetchTiktokAdsReport, listTiktokAdAccounts, tiktokAdsAuthUrl } from "./tiktok";
import type { AdAccountChoice, AdAccountRef, AdPlatform, AdReport, AdTokens } from "./types";

export interface AdsClient {
  authUrl(state: string): string;
  /** Code d'autorisation → jetons + comptes publicitaires accessibles. */
  connect(code: string): Promise<{ tokens: AdTokens; accounts: AdAccountChoice[] }>;
  /** Jeton d'accès valide pour ce compte (renouvelé si besoin). */
  freshToken(account: AdAccountRef): Promise<{ accessToken: string; expiresAt?: Date | null } | null>;
  report(account: AdAccountRef, accessToken: string, start: Date, end: Date, withCampaigns?: boolean): Promise<AdReport>;
}

const google: AdsClient = {
  authUrl: googleAdsAuthUrl,
  async connect(code) {
    const tokens = await exchangeGoogleAdsCode(code);
    return { tokens, accounts: await listGoogleAdsAccounts(tokens) };
  },
  async freshToken(account) {
    // Jeton Google : 1 h. On le renouvelle 5 min avant l'échéance.
    if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() > 5 * 60_000) return null;
    if (!account.refreshToken) return null;
    const t = await refreshGoogleAdsToken(account.refreshToken);
    return { accessToken: t.accessToken, expiresAt: t.expiresAt };
  },
  report: fetchGoogleAdsReport
};

const meta: AdsClient = {
  authUrl: metaAdsAuthUrl,
  async connect(code) {
    const tokens = await exchangeMetaAdsCode(code);
    return { tokens, accounts: await listMetaAdAccounts(tokens) };
  },
  async freshToken() {
    return null; // Jeton longue durée : reconnexion manuelle à l'expiration.
  },
  report: fetchMetaAdsReport
};

const tiktok: AdsClient = {
  authUrl: tiktokAdsAuthUrl,
  async connect(code) {
    const tokens = await exchangeTiktokAdsCode(code);
    return { tokens, accounts: await listTiktokAdAccounts(tokens) };
  },
  async freshToken() {
    return null; // Jeton sans expiration.
  },
  report: fetchTiktokAdsReport
};

export function getAdsClient(platform: AdPlatform): AdsClient {
  return platform === "GOOGLE_ADS" ? google : platform === "META_ADS" ? meta : tiktok;
}
