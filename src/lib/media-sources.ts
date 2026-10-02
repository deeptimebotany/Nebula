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

/** Ce qu'on y trouve (page d'accueil). */
export const MEDIA_SOURCE_KIND: Record<MediaSourceId, string> = {
  gdrive: "stockage cloud",
  dropbox: "stockage cloud",
  onedrive: "stockage cloud",
  unsplash: "banque d'images libres",
  canva: "vos designs"
};
