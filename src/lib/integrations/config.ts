// Sources d'import de médias de Publier (lot 3, 25/09/2026) : Google Drive,
// Dropbox, OneDrive, Unsplash et Canva. Toutes gratuites côté Nebula ;
// chacune n'apparaît que si ses clés sont renseignées (voir .env.example).
// Côté serveur uniquement : ce fichier lit process.env.

import { MEDIA_SOURCE_ORDER, type MediaSourceId } from "@/lib/media-sources";

export type { MediaSourceId };

export interface PublicMediaSources {
  /** Google Picker : clé d'API (restreinte au domaine), client OAuth, numéro de projet. */
  gdrive: { apiKey: string; clientId: string; appId: string } | null;
  /** Dropbox Chooser : clé d'application (publique par nature). */
  dropbox: { appKey: string } | null;
  onedrive: { connected: boolean } | null;
  unsplash: boolean;
  /** accountName : nom du compte Canva relié, montré dans la fenêtre d'import (06/10/2026). */
  canva: { connected: boolean; accountName?: string | null } | null;
}

export function gdriveConfig(): PublicMediaSources["gdrive"] {
  const apiKey = process.env.GOOGLE_PICKER_API_KEY;
  const clientId = process.env.GOOGLE_PICKER_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const appId = process.env.GOOGLE_PICKER_APP_ID;
  return apiKey && clientId && appId ? { apiKey, clientId, appId } : null;
}

export function dropboxConfig(): PublicMediaSources["dropbox"] {
  const appKey = process.env.DROPBOX_APP_KEY;
  return appKey ? { appKey } : null;
}

export const isOneDriveConfigured = () => Boolean(process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_CLIENT_SECRET);
export const isUnsplashConfigured = () => Boolean(process.env.UNSPLASH_ACCESS_KEY);
export const isCanvaConfigured = () => Boolean(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET);

/** Adresse de retour OAuth d'un outil d'import : <NEXTAUTH_URL>/api/integrations/<outil>/callback. */
export function integrationRedirectUri(provider: "canva" | "onedrive"): string {
  const explicit = process.env[`${provider.toUpperCase()}_REDIRECT_URI`];
  if (explicit) return explicit;
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/integrations/${provider}/callback`;
}

/** Nom d'application pour les liens de crédit Unsplash (utm_source exigé par leurs règles). */
export function unsplashAppName(): string {
  return process.env.UNSPLASH_APP_NAME || "nebula";
}

/**
 * Sources ouvertes (clés renseignées), dans l'ordre d'affichage. Lu au build
 * par la page d'accueil (pré-générée) : ajouter une clé sur Vercel puis
 * redéployer fait apparaître la source sur l'accueil, jamais avant.
 */
export function configuredMediaSources(): MediaSourceId[] {
  const on: Record<MediaSourceId, boolean> = {
    gdrive: Boolean(gdriveConfig()),
    dropbox: Boolean(dropboxConfig()),
    onedrive: isOneDriveConfigured(),
    unsplash: isUnsplashConfigured(),
    canva: isCanvaConfigured()
  };
  return MEDIA_SOURCE_ORDER.filter((id) => on[id]);
}
