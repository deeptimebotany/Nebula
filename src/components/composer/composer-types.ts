// Types partagés entre la page Publier (src/app/(dashboard)/composer/page.tsx)
// et ses sous-composants (src/components/composer/*), extraits au Lot 4.
import type { Network } from "@/lib/types";

export interface UploadedAsset {
  id: string;
  url: string;
  filename: string;
  type: "VIDEO" | "IMAGE";
  previewUrl: string;
  thumbnailUrl?: string;
}

export interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
}

export interface NetworkOverride {
  open: boolean;
  title: string;
  caption: string;
}

export type ScheduleMode = "now" | "date";

// "Préréglages YouTube" du composer (bloc dépliable sous "4. Réseaux
// cibles", visible quand YouTube est sélectionné) — voir
// src/lib/social/base.ts → YoutubeOptions (même forme côté serveur) et
// src/lib/social/youtube.ts qui les applique à l'upload. `tags` et
// `playlistId` restent des chaînes ici (saisie libre dans un champ texte) ;
// `tags` est éclaté en tableau juste avant l'envoi (voir composer/page.tsx).
export interface YoutubeComposerOptions {
  privacyStatus: "public" | "unlisted" | "private";
  madeForKids: boolean;
  categoryId: string; // "" = non précisée
  tags: string; // séparés par des virgules
  notifySubscribers: boolean;
  playlistId: string; // "" = aucune
}

export const DEFAULT_YOUTUBE_OPTIONS: YoutubeComposerOptions = {
  privacyStatus: "public",
  madeForKids: false,
  categoryId: "",
  tags: "",
  notifySubscribers: true,
  playlistId: ""
};

// Sous-ensemble courant des catégories YouTube (identifiants stables de
// videoCategories.list, region US/FR) — assez pour couvrir l'essentiel des
// usages sans avoir à appeler l'API pour lister les catégories à chaque
// ouverture du composer.
export const YOUTUBE_CATEGORIES: { id: string; label: string }[] = [
  { id: "22", label: "Personnes et blogs" },
  { id: "24", label: "Divertissement" },
  { id: "23", label: "Humour" },
  { id: "20", label: "Jeux vidéo" },
  { id: "10", label: "Musique" },
  { id: "26", label: "Style de vie" },
  { id: "27", label: "Éducation" },
  { id: "28", label: "Science et technologie" },
  { id: "25", label: "Actualités et politique" },
  { id: "17", label: "Sport" },
  { id: "19", label: "Voyage et événements" },
  { id: "15", label: "Animaux" },
  { id: "2", label: "Automobile" }
];
