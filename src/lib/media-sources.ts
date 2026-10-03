// Sources d'import de médias de Publier (lot 3, 25/09/2026) : noms et ordre
// d'affichage, partagés par le navigateur et le serveur. Quelles sources sont
// réellement ouvertes : src/lib/integrations/config.ts (clés renseignées).
export type MediaSourceId = "gdrive" | "dropbox" | "onedrive" | "unsplash" | "canva";

export const MEDIA_SOURCE_ORDER: readonly MediaSourceId[] = ["gdrive", "dropbox", "onedrive", "canva", "unsplash"];

export const MEDIA_SOURCE_LABELS: Record<MediaSourceId, string> = {
  gdrive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  unsplash: "Unsplash",
  canva: "Canva"
};

/**
 * Source d'un média enregistrée sur MediaAsset.importSource (03/10/2026) :
 * seulement les plateformes d'import ; « api » (API publique de Nebula) et
 * null (envoyé depuis l'appareil) ne s'affichent pas.
 */
export function mediaImportSource(value: string | null | undefined): MediaSourceId | null {
  return value && (MEDIA_SOURCE_ORDER as readonly string[]).includes(value) ? (value as MediaSourceId) : null;
}

/** « Image importée depuis Canva », « Vidéo importée depuis Dropbox »… */
export function importedFromText(source: MediaSourceId, type?: string | null): string {
  return `${type === "VIDEO" ? "Vidéo importée" : type === "IMAGE" ? "Image importée" : "Importé"} depuis ${MEDIA_SOURCE_LABELS[source]}`;
}

/** Ce qu'on y trouve (page d'accueil). */
export const MEDIA_SOURCE_KIND: Record<MediaSourceId, string> = {
  gdrive: "stockage cloud",
  dropbox: "stockage cloud",
  onedrive: "stockage cloud",
  unsplash: "banque d'images libres",
  canva: "vos designs"
};
