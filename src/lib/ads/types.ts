// Types communs du suivi publicitaire (lot 5).
export type AdPlatform = "GOOGLE_ADS" | "META_ADS" | "TIKTOK_ADS";
export const AD_PLATFORMS: AdPlatform[] = ["GOOGLE_ADS", "META_ADS", "TIKTOK_ADS"];

export const AD_PLATFORM_META: Record<AdPlatform, { label: string; slug: "google" | "meta" | "tiktok" }> = {
  GOOGLE_ADS: { label: "Google Ads", slug: "google" },
  META_ADS: { label: "Meta Ads", slug: "meta" },
  TIKTOK_ADS: { label: "TikTok Ads", slug: "tiktok" }
};

export function platformFromSlug(slug: string): AdPlatform | null {
  return (Object.keys(AD_PLATFORM_META) as AdPlatform[]).find((p) => AD_PLATFORM_META[p].slug === slug) ?? null;
}

export interface AdTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}

/** Compte proposé au choix après l'autorisation. */
export interface AdAccountChoice {
  externalId: string;
  name: string;
  currency: string;
  loginCustomerId?: string | null;
}

export interface AdDay {
  date: string; // AAAA-MM-JJ
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach?: number | null;
}

export interface AdCampaign {
  id: string;
  name: string;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface AdReport {
  days: AdDay[];
  campaigns: AdCampaign[];
}

/** Compte relié, tel que les clients de régie le reçoivent pour la synchro. */
export interface AdAccountRef {
  id: string;
  externalId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  loginCustomerId: string | null;
}

export class AdsError extends Error {
  constructor(
    message: string,
    public status = 400,
    /** Catégorie de l'erreur d'origine (voir social/errors.ts), si connue (lot 8). */
    public category?: string
  ) {
    super(message);
  }
}

export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
