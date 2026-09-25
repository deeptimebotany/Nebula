// Audit de présence — sources activées (lecture des variables d'environnement
// seulement : importable par la page du formulaire, pré-générée au build).
// YouTube et Instagram demandent une clé ; TikTok et les sites, non.
import type { AuditSourceKey } from "./types";

export function youtubeAuditEnabled(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export function instagramAuditEnabled(): boolean {
  return Boolean(process.env.IG_DISCOVERY_USER_ID && process.env.IG_DISCOVERY_TOKEN);
}

export function enabledAuditSources(): Record<AuditSourceKey, boolean> {
  return { youtube: youtubeAuditEnabled(), instagram: instagramAuditEnabled(), tiktok: true, website: true };
}
