// Passerelle entre le tiroir « Demander à Nebula » et la section Miniature
// de la page Publier (côté navigateur uniquement).
//
// Quand l'assistant a proposé un concept de miniature (avec ses « pourquoi »),
// le bouton « Générer cette miniature » du tiroir ne génère rien lui-même :
// il n'a ni la vidéo ni la frame. Il dépose le brief ici, et c'est le
// composer qui le récupère — immédiatement s'il est déjà à l'écran (événement
// window), ou à son prochain affichage (sessionStorage) si on vient d'une
// autre page. Le composer l'envoie ensuite à /api/media/[id]/thumbnails/ai
// avec la frame réelle de la vidéo.

export interface ThumbnailBrief {
  hook: string;
  imagePrompt: string;
}

export const THUMBNAIL_BRIEF_EVENT = "nebula:thumbnail-brief";
const STORAGE_KEY = "nebula:assistant:thumbnail-brief";

export function sendThumbnailBrief(brief: ThumbnailBrief): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(brief));
  } catch {
    // Stockage indisponible (navigation privée stricte) : l'événement suffit
    // si le composer est déjà monté.
  }
  window.dispatchEvent(new CustomEvent<ThumbnailBrief>(THUMBNAIL_BRIEF_EVENT, { detail: brief }));
}

export function readPendingThumbnailBrief(): ThumbnailBrief | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ThumbnailBrief>;
    if (typeof parsed.imagePrompt !== "string" || !parsed.imagePrompt) return null;
    return { hook: typeof parsed.hook === "string" ? parsed.hook : "", imagePrompt: parsed.imagePrompt };
  } catch {
    return null;
  }
}

export function clearPendingThumbnailBrief(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // rien à faire
  }
}
