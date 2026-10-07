// Format de la publication, réseau par réseau (07/10/2026, demande de Lucas :
// « comment YouTube ou les autres savent si c'est un Short ou une vidéo ? on
// devrait pouvoir choisir Reel, Short, publication… »).
//
// Avant : Instagram publiait TOUTE vidéo en Reel et toute image en
// publication ; Facebook publiait toute vidéo en vidéo classique (jamais en
// Reel) et seulement la PREMIÈRE image d'un carrousel ; aucune Story ; et
// l'aperçu de Publier pouvait montrer un format différent de celui publié.
//
// Ce que chaque réseau permet (docs officielles, relues le 07/10/2026) :
//  - Instagram (POST /{ig}/media) : publication (1 image, ou carrousel de 2
//    à 10 images), Reel (media_type=REELS, 3 s à 15 min, 9:16 conseillé,
//    share_to_feed pour l'afficher aussi dans le fil du profil, cover_url),
//    Story (media_type=STORIES : 1 image, ou 1 vidéo de 3 à 60 s ; pas de
//    légende, pas de collaborateurs, pas de commentaire). Toute vidéo
//    publiée par l'API est un Reel ou une Story : il n'y a plus de
//    « vidéo du fil ».
//  - Facebook (Page) : publication (/feed, /photos, /videos : texte, photos,
//    vidéo classique), Reel (/video_reels : vidéo verticale 9:16, 3 à 90 s),
//    Story (/photo_stories : 1 photo ; /video_stories : 1 vidéo verticale de
//    3 à 60 s).
//  - YouTube : AUCUN réglage « Short » dans l'API. YouTube classe lui-même
//    en Short une vidéo verticale ou carrée de 3 minutes au plus ; sinon
//    c'est une vidéo classique. Nebula l'annonce au lieu d'offrir un faux
//    choix.
//  - TikTok, Pinterest, Threads, LinkedIn, Bluesky : un seul format.
//
// Module sans accès à la base : Publier, la création de la publication
// (vérification) et les clients réseau s'en servent.
import type { Network } from "@/lib/types";

export const POST_FORMATS = ["POST", "REEL", "STORY"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];

/** Réseaux où l'on choisit le format. */
export const FORMAT_NETWORKS = new Set<Network>(["INSTAGRAM", "FACEBOOK"]);

export const FORMAT_LABEL: Record<PostFormat, string> = { POST: "Publication", REEL: "Reel", STORY: "Story" };

/** Ce que l'on sait du média (lu dans le navigateur, ou en base). */
export interface MediaFacts {
  type: "VIDEO" | "IMAGE" | null;
  /** Nombre de médias (carrousel). */
  count: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}

export interface FormatOption {
  format: PostFormat;
  label: string;
  /** Une phrase : ce que ça donne sur le réseau. */
  hint: string;
  /** Raison pour laquelle ce format n'est pas possible avec ce média. */
  unavailable?: string;
}

const isVertical = (m: MediaFacts) => Boolean(m.width && m.height && m.height > m.width);
const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
/** « 45 s », « 60 s », « 1 min 15 s », « 15 min ». */
const seconds = (s: number) => (s > 60 ? `${Math.floor(s / 60)} min${Math.round(s % 60) ? ` ${Math.round(s % 60)} s` : ""}` : `${Math.round(s)} s`);

/** Limites de durée (secondes) par réseau et format. */
export const FORMAT_DURATION: Partial<Record<Network, Partial<Record<PostFormat, { min: number; max: number }>>>> = {
  INSTAGRAM: { REEL: { min: 3, max: 15 * 60 }, STORY: { min: 3, max: 60 } },
  FACEBOOK: { REEL: { min: 3, max: 90 }, STORY: { min: 3, max: 60 } }
};

function durationProblem(network: Network, format: PostFormat, m: MediaFacts): string | null {
  const limits = FORMAT_DURATION[network]?.[format];
  if (!limits || m.type !== "VIDEO" || !known(m.durationSeconds)) return null;
  if (m.durationSeconds < limits.min) return `vidéo trop courte (${seconds(m.durationSeconds)}, ${limits.min} s au moins).`;
  if (m.durationSeconds > limits.max + 0.5) return `vidéo trop longue (${seconds(m.durationSeconds)}, ${seconds(limits.max)} au plus).`;
  return null;
}

/** Les formats proposés pour ce réseau et ce média, avec ceux qui ne sont pas possibles. */
export function formatOptions(network: Network, m: MediaFacts): FormatOption[] {
  if (network === "INSTAGRAM") {
    return [
      {
        format: "POST",
        label: FORMAT_LABEL.POST,
        hint: m.count > 1 ? "Carrousel dans le fil et sur votre profil." : "Image dans le fil et sur votre profil.",
        unavailable: m.type === "VIDEO" ? "Instagram publie toute vidéo envoyée par une application en Reel (elle peut aussi apparaître sur votre profil)." : undefined
      },
      {
        format: "REEL",
        label: FORMAT_LABEL.REEL,
        hint: "Vidéo dans l'onglet Reels (et sur votre profil si vous le gardez coché).",
        unavailable: m.type !== "VIDEO" ? "Un Reel est une vidéo." : (durationProblem("INSTAGRAM", "REEL", m) ?? undefined)
      },
      {
        format: "STORY",
        label: FORMAT_LABEL.STORY,
        hint: "Visible 24 h en haut de l'app. La légende et le premier commentaire ne s'y affichent pas.",
        unavailable: m.count > 1 ? "Une story ne contient qu'une image ou une vidéo." : (durationProblem("INSTAGRAM", "STORY", m) ?? undefined)
      }
    ];
  }
  if (network === "FACEBOOK") {
    const reelProblem =
      m.type !== "VIDEO"
        ? "Un Reel est une vidéo."
        : m.width && m.height && !isVertical(m)
          ? "Facebook n'accepte en Reel qu'une vidéo verticale (9:16)."
          : durationProblem("FACEBOOK", "REEL", m);
    const storyProblem =
      m.count > 1
        ? "Une story ne contient qu'une photo ou une vidéo."
        : m.type === "VIDEO" && m.width && m.height && !isVertical(m)
          ? "Facebook n'accepte en story qu'une vidéo verticale (9:16)."
          : durationProblem("FACEBOOK", "STORY", m);
    return [
      {
        format: "POST",
        label: FORMAT_LABEL.POST,
        hint: m.type === "VIDEO" ? "Vidéo classique dans le fil de la Page." : m.count > 1 ? "Publication avec plusieurs photos dans le fil de la Page." : "Publication dans le fil de la Page."
      },
      { format: "REEL", label: FORMAT_LABEL.REEL, hint: "Vidéo courte dans les Reels de Facebook.", unavailable: reelProblem ?? undefined },
      { format: "STORY", label: FORMAT_LABEL.STORY, hint: "Visible 24 h. Le texte et le premier commentaire ne s'y affichent pas.", unavailable: storyProblem ?? undefined }
    ];
  }
  return [];
}

/**
 * Format proposé par défaut dans Publier : Instagram, Reel pour une vidéo
 * et publication sinon ; Facebook, Reel pour une vidéo verticale qui en a
 * la durée, publication sinon.
 */
export function defaultFormat(network: Network, m: MediaFacts): PostFormat | null {
  if (!FORMAT_NETWORKS.has(network)) return null;
  const options = formatOptions(network, m);
  const ok = (f: PostFormat) => options.some((o) => o.format === f && !o.unavailable);
  if (network === "INSTAGRAM") return m.type === "VIDEO" && ok("REEL") ? "REEL" : "POST";
  return m.type === "VIDEO" && isVertical(m) && ok("REEL") ? "REEL" : "POST";
}

/**
 * Format retenu : celui choisi s'il est possible avec ce média, sinon le
 * format par défaut. Sans choix (ancienne publication, API, import CSV) :
 * comme avant (Instagram : Reel pour une vidéo ; Facebook : publication).
 */
export function effectiveFormat(network: Network, chosen: string | null | undefined, m: MediaFacts): PostFormat | null {
  if (!FORMAT_NETWORKS.has(network)) return null;
  if (chosen && (POST_FORMATS as readonly string[]).includes(chosen)) return chosen as PostFormat;
  return network === "INSTAGRAM" && m.type === "VIDEO" ? "REEL" : "POST";
}

/** Problème du format choisi avec ce média (phrase complète), ou null. */
export function formatProblem(network: Network, format: string | null | undefined, m: MediaFacts): string | null {
  if (!format || !FORMAT_NETWORKS.has(network)) return null;
  const option = formatOptions(network, m).find((o) => o.format === format);
  if (!option) return `Format inconnu pour ${network === "INSTAGRAM" ? "Instagram" : "Facebook"}.`;
  if (!option.unavailable) return null;
  const label = network === "INSTAGRAM" ? "Instagram" : "Facebook";
  const reason = option.unavailable.charAt(0).toUpperCase() + option.unavailable.slice(1);
  return `${label} (${option.label}) : ${reason.endsWith(".") ? reason : `${reason}.`}`;
}

// --- YouTube : Short ou vidéo, décidé par YouTube ------------------------------

/** Durée maximale d'un Short (YouTube, depuis le 15/10/2024). */
export const YOUTUBE_SHORT_MAX_SECONDS = 180;

/**
 * Ce que YouTube fera de la vidéo : « SHORT » (verticale ou carrée, 3 min
 * au plus), « VIDEO », ou null si on ne connaît pas encore la taille.
 */
export function youtubeKind(m: MediaFacts): "SHORT" | "VIDEO" | null {
  if (m.type !== "VIDEO" || !m.width || !m.height) return null;
  const shape = m.height >= m.width;
  if (!shape) return "VIDEO";
  if (known(m.durationSeconds) && m.durationSeconds > YOUTUBE_SHORT_MAX_SECONDS + 0.5) return "VIDEO";
  return "SHORT";
}

/** Phrase affichée sous YouTube dans Publier. */
export function youtubeKindText(m: MediaFacts): string {
  const kind = youtubeKind(m);
  if (kind === "SHORT") return "YouTube la publiera en Short : vidéo verticale ou carrée de 3 minutes au plus. C'est YouTube qui décide, aucune application ne peut le forcer.";
  if (kind === "VIDEO") {
    const why = m.width && m.height && m.height < m.width ? "elle est horizontale" : "elle dure plus de 3 minutes";
    return `YouTube la publiera en vidéo classique (${why}). Pour un Short : vidéo verticale ou carrée de 3 minutes au plus.`;
  }
  return "YouTube décide lui-même : Short pour une vidéo verticale ou carrée de 3 minutes au plus, vidéo classique sinon.";
}
