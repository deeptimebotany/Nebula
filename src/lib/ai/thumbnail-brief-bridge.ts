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
  /** Proposition retravaillée (1, 2 ou 3) : la miniature repart de son image. */
  option?: number | null;
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
    return { hook: typeof parsed.hook === "string" ? parsed.hook : "", imagePrompt: parsed.imagePrompt, option: typeof parsed.option === "number" ? parsed.option : null };
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

// --- Choix d'une des 3 miniatures proposées dans le chat ------------------
// « Générer des miniatures » (composer) extrait des images de la vidéo, en
// fait choisir 3 à l'IA et les présente dans le chat avec le « pourquoi ».
// Le bouton « Choisir celle-ci » du chat renvoie l'image retenue au composer
// par cet événement (le composer vérifie qu'elle appartient bien à la vidéo
// en cours avant de l'appliquer).
export interface FramePickCard {
  url: string;
  reason: string;
  sharpness: number;
  framing: number;
  clickPotential: number;
  // Miniatures « en un clic » (07/10/2026) : miniature créée par l'IA à
  // partir d'un instant de la vidéo qu'elle a regardée, avec son levier,
  // son accroche et le « pourquoi » du taux de clic.
  /** Levier principal (« Curiosité », « Résultat »…). */
  angle?: string;
  /** Texte écrit sur la miniature (vide : aucun). */
  hook?: string;
  /** Instant de la vidéo d'où vient l'image, en secondes. */
  second?: number;
  /** Ce qui se passe à cet instant. */
  moment?: string;
  /** Pourquoi elle fera cliquer (2 ou 3 points). */
  why?: string[];
  /** Format de l'image (« 9:16 » pour une vidéo verticale). */
  aspect?: "16:9" | "9:16";
}

export const THUMBNAIL_PICK_EVENT = "nebula:thumbnail-pick";

export function sendThumbnailPick(url: string): void {
  window.dispatchEvent(new CustomEvent<string>(THUMBNAIL_PICK_EVENT, { detail: url }));
}
