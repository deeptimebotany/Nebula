// Disponibilité des régies publicitaires (lot 5). Chacune n'apparaît que si
// ses clés sont renseignées — voir .env.example, section « Lot 5 ».
import type { AdPlatform } from "./types";

export function isAdPlatformConfigured(p: AdPlatform): boolean {
  switch (p) {
    case "GOOGLE_ADS":
      return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && googleAdsClientId() && googleAdsClientSecret());
    case "META_ADS":
      // Même application Meta qu'Instagram/Facebook, mais la permission
      // ads_read doit être validée à part : activation explicite.
      return process.env.META_ADS_ENABLED === "true" && Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
    case "TIKTOK_ADS":
      return Boolean(process.env.TIKTOK_ADS_APP_ID && process.env.TIKTOK_ADS_APP_SECRET);
  }
}

export const googleAdsClientId = () => process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
export const googleAdsClientSecret = () => process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";

export function adsRedirectUri(slug: "google" | "meta" | "tiktok"): string {
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/ads/callback/${slug}`;
}

/** Comptes publicitaires reliables par marque, selon le palier. */
export function maxAdAccounts(plan: string): number {
  return plan === "AGENCY" ? 50 : plan === "PRO" ? 3 : 0;
}
