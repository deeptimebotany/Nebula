"use client";

import { useAvailableNetworks } from "@/lib/use-available-networks";
import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { composerDraftFrom, type StudioOutput } from "@/lib/studio/types";
import { useBrand } from "@/components/brand-context";
import { useAiStatus } from "@/components/use-ai-status";
import { useAiAssistant } from "@/components/dashboard/ai-assistant-context";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import {
  THUMBNAIL_BRIEF_EVENT,
  THUMBNAIL_PICK_EVENT,
  type FramePickCard,
  clearPendingThumbnailBrief,
  readPendingThumbnailBrief,
  type ThumbnailBrief
} from "@/lib/ai/thumbnail-brief-bridge";
import { useToast } from "@/components/dashboard/toast";
import { useMilestoneCelebration } from "@/components/milestone-celebration";
import { useFocusMode } from "@/components/bootstrap-provider";
import type { PreviewAccount } from "@/components/composer/composer-preview";
// Aperçu, panneaux et voile d'envoi chargés à la demande (lot 5).
import { CampaignLinkBuilder, ComposerPreview, LoadingMiniGame, LocationPicker, PublishOverlay, RepurposePanel, VideoEditor } from "@/components/composer/lazy";
import { PublishActions, WhenSection, formatSlotLabel, nextBestSlot } from "@/components/composer/publish-card";
import { firstAvailableSlot } from "@/components/ui/date-time-picker";
import { HEADER_ACTIONS_SLOT_ID } from "@/components/dashboard/app-header";
import { Input, Select } from "@/components/ui/input";
import { ComposerTips } from "@/components/composer/composer-tips";
import type { UploadedAsset, ConnectionRow, NetworkOverride, ScheduleMode, YoutubeComposerOptions } from "@/components/composer/composer-types";
import { DEFAULT_YOUTUBE_OPTIONS, YOUTUBE_CATEGORIES } from "@/components/composer/composer-types";
import { InfoTip } from "@/components/ui/info-tip";
import type { PickedLocation } from "@/components/composer/location-picker";
import { PinterestOptions, DEFAULT_PINTEREST_OPTIONS, type PinterestComposerOptions } from "@/components/composer/pinterest-options";
import { InstagramOptions, DEFAULT_INSTAGRAM_OPTIONS, type InstagramComposerOptions } from "@/components/composer/instagram-options";
import { useConfirm } from "@/components/dashboard/confirm";
import { IcPencil } from "@/components/video-editor/editor-icons";
import { TiktokConsent, TiktokOptions, type TiktokSectionStatus } from "@/components/composer/tiktok-options";
import { DEFAULT_TIKTOK_OPTIONS, type TiktokPostOptions } from "@/lib/social/tiktok-direct-post";
import { Toggle } from "@/components/ui/toggle";
import { DEFAULT_TIMEZONE, localInputToUtc } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { NetworkLogo, NetworkPill, NetworkTile } from "@/components/ui/network-badge";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { IconMessage, IconEmoji, IconHash, IconBell, IconLink, IconUsers, IconClose, IconCloudUpload, IconPhone, IconPlusSmall } from "@/components/dashboard/icons";
import { FeedbackRequestDialog, type FeedbackPrefill } from "@/components/community/feedback/feedback-request-dialog";
import { NebulaIcon } from "@/components/dashboard/nebula-brandmark";
import type { RepurposedContent } from "@/lib/ai/gemini";
import { uploadMediaFile, type UploadedAssetResult } from "@/lib/upload-client";
import { MediaImportBar } from "@/components/composer/media-import/media-import-bar";
import { ImportSourceBadge } from "@/components/media-import/import-source-badge";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { playLaunchWhoosh } from "@/lib/cosmic-audio";
import { NetworkPauseNotice } from "@/components/composer/network-pause-notice";
import { refreshUsage, useConnections } from "@/lib/data/hooks";
import { getPref, setPref } from "@/lib/ui-prefs-client";
import { loadComposerDraft, saveComposerDraft, saveComposerDraftNow } from "@/lib/composer-draft-client";
import { captureVideoFrames, captureVideoFramesAt, readVideoInfo } from "@/lib/video/capture-frames";
import { formatDuration } from "@/lib/video/format-time";
import { firstCommentLength, firstCommentSupport, type FirstCommentSupport } from "@/lib/social/first-comment-support";
import { FORMAT_NETWORKS, POST_FORMATS, defaultFormat, formatProblem, youtubeKind, type MediaFacts, type PostFormat } from "@/lib/social/post-format";
import { FormatPicker } from "@/components/composer/format-picker";
import { useUiSounds } from "@/components/use-ui-sounds";
import { AiIcon } from "@/components/ai/ai-icon";
import { YOUTUBE_PRIVATE_LOCK_NOTE, YOUTUBE_UPLOADS_LOCKED_PRIVATE } from "@/lib/social/youtube-audit";

// Réseau affiché dans l'aperçu, mémorisé dans ce navigateur.
const PREVIEW_NETWORK_KEY = "nebula:composer-preview-network";
// Aperçu rangé (V2, 07/10/2026) : « 1 » quand on a masqué la colonne de droite.
const PREVIEW_HIDDEN_KEY = "nebula:composer-preview-hidden";

// Large sélection d'émojis organisée par catégorie pour l'insertion rapide
// dans le titre / la description (voir insertIntoField ci-dessous). Curatée
// à la main plutôt que le catalogue Unicode complet (~3700 émojis) qui
// serait ingérable dans un petit sélecteur — ici de quoi couvrir la quasi-
// totalité des usages réseaux sociaux (~270 émojis) sans devenir un annuaire.
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Populaires",
    emojis: ["😀", "😂", "🔥", "❤️", "👍", "🎉", "✨", "😍", "🙌", "💯", "😎", "🤩", "👏", "😅", "🥳", "🚀", "⭐", "💡", "📸", "🎬", "😉", "🤔", "👀", "💪"]
  },
  {
    label: "Émotions",
    emojis: [
      "😊", "😁", "😆", "😇", "🙂", "🙃", "😋", "😜", "🤪", "😝", "🤗", "🤭", "🥰", "😘", "😗", "😚", "😙", "🥲", "😌",
      "😐", "😑", "😶", "🙄", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭",
      "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤤", "😴", "🤒", "🤕", "🤢", "🤮",
      "🥱", "😷", "🤠", "🥸", "🤡", "👻", "💀", "☠️"
    ]
  },
  {
    label: "Gestes",
    emojis: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🙏", "✍️", "💅", "🤳", "💪"]
  },
  {
    label: "Cœurs",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️"]
  },
  {
    label: "Célébration",
    emojis: ["🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🎗️", "🎯", "🎆", "🎇", "🧨", "✨", "🌟", "⭐", "💫", "🎵", "🎶", "🎤", "🎸", "🥂", "🍾", "🍰", "🎂"]
  },
  {
    label: "Nature",
    emojis: ["☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "❄️", "☃️", "⛄", "🌈", "🔥", "💧", "🌊", "🌙", "⭐", "🌸", "🌺", "🌻", "🌼", "🌷", "🌹", "🍀", "🌴", "🌵", "🍃", "🍂", "🌿"]
  },
  {
    label: "Nourriture",
    emojis: ["🍕", "🍔", "🍟", "🌭", "🌮", "🌯", "🥗", "🍣", "🍱", "🍜", "🍦", "🍩", "🍪", "🍫", "🍬", "🍭", "☕", "🍵", "🧋", "🥤", "🍹", "🍷", "🍺", "🥂"]
  },
  {
    label: "Activités",
    emojis: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥊", "🏋️", "🧘", "🏃", "🚴", "🏄", "🎮", "🎧", "📱", "💻", "📷", "🎥", "🖥️", "⌚"]
  },
  {
    label: "Symboles",
    emojis: ["✅", "❌", "⚡", "💯", "🔔", "🔒", "🔓", "🔑", "🆕", "🆓", "🔝", "🔥", "💥", "💢", "‼️", "⁉️", "❓", "❗", "💬", "🔗", "📌", "📍", "🏷️", "🗓️"]
  }
];

// Sélecteur d'émojis rendu via un portail (voir usage plus bas) : positionné
// en `fixed` par rapport au bouton qui l'ouvre, il échappe ainsi au contexte
// d'empilement de sa carte parente — sans ça, sur cette page où chaque carte
// (glassmorphism + backdrop-blur) crée son propre contexte d'empilement, le
// panneau se retrouvait visuellement sous la carte suivante malgré un
// z-index élevé, purement à cause de l'ordre DOM des cartes.
function EmojiPicker({
  anchor,
  panelRef,
  onPick
}: {
  anchor: { top: number; right: number };
  panelRef: React.Ref<HTMLDivElement>;
  onPick: (emoji: string) => void;
}) {
  const [category, setCategory] = useState(0);
  return (
    <div
      ref={panelRef}
      style={{ position: "fixed", top: anchor.top, right: anchor.right }}
      className="glass-panel-solid z-[999] w-72 rounded-xl p-2 shadow-2xl"
    >
      <div className="mb-1.5 flex flex-wrap gap-1 border-b border-white/10 pb-1.5">
        {EMOJI_CATEGORIES.map((c, i) => (
          <button
            key={c.label}
            onClick={() => setCategory(i)}
            className={clsx(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition",
              category === i ? "bg-aurora-500/30 text-white" : "text-slate-500 hover:text-white"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">
        {EMOJI_CATEGORIES[category].emojis.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="rounded-md p-1 text-base transition hover:scale-125 hover:bg-white/10"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}


// Extraction des images d'une vidéo dans le navigateur : voir src/lib/video/capture-frames.ts.

/**
 * Largeur et hauteur réelles d'un média, lues dans le navigateur (vidéo :
 * métadonnées seulement, rotation du téléphone comprise). null si illisible.
 */
function measureMedia(asset: { type: "VIDEO" | "IMAGE"; previewUrl: string }): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 15_000);
    const done = (w: number, h: number) => {
      window.clearTimeout(timer);
      resolve(w > 0 && h > 0 ? { width: Math.round(w), height: Math.round(h) } : null);
    };
    const fail = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    if (asset.type === "VIDEO") {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () => {
        done(v.videoWidth, v.videoHeight);
        v.removeAttribute("src");
        v.load();
      };
      v.onerror = fail;
      v.src = asset.previewUrl;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = fail;
      img.src = asset.previewUrl;
    }
  });
}

async function uploadThumbnailBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", new File([blob], "frame.jpg", { type: blob.type || "image/jpeg" }));
  const res = await fetch("/api/media/thumbnails/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Échec de l'envoi de l'image.");
  return data.url as string;
}

/** Réponse de /api/media/[id]/thumbnails/analyze (voir src/lib/ai/thumbnail-analysis.ts). */
interface ThumbnailAnalysisResponse {
  summary: string;
  audience: string;
  promise: string;
  concepts: { second: number; moment: string; angle: string; hook: string; imagePrompt: string; why: string[] }[];
  durationSeconds: number | null;
  truncated: boolean;
  /** Miniatures encore possibles ce mois-ci (3 au plus). */
  imagesAllowed: number;
}

/** Message du chat après l'analyse : ce que l'IA a compris de la vidéo. */
function thumbnailAnalysisMessage(a: ThumbnailAnalysisResponse, creating: number): string {
  const watched = a.durationSeconds ? ` (${formatDuration(a.durationSeconds)}, image et son${a.truncated ? " ; la première heure seulement" : ""})` : " (image et son)";
  const facts = [
    `- **Ce qu'elle raconte :** ${a.summary}`,
    a.audience ? `- **Pour qui :** ${a.audience}` : "",
    a.promise ? `- **Sa promesse :** ${a.promise}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  const next = creating > 1 ? `Je pars de ses ${creating} moments les plus forts pour créer vos miniatures.` : creating === 1 ? "Je pars de son moment le plus fort pour créer votre miniature." : "";
  return [`J'ai regardé votre vidéo en entier${watched}.`, facts, next].filter(Boolean).join("\n\n");
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Lecture de l'image impossible."));
    reader.readAsDataURL(blob);
  });
}

// Convertit les "Préréglages YouTube" du formulaire (tous des chaînes, pour
// se lier simplement à des <select>/<input>) vers la forme JSON envoyée à
// l'API (voir src/lib/social/base.ts → YoutubeOptions). Un champ laissé à sa
// valeur par défaut / vide est OMIS plutôt qu'envoyé explicitement, pour que
// src/lib/social/youtube.ts applique son propre défaut (notamment
// privacyStatus et notifySubscribers, dont "false"/"non coché" est une vraie
// valeur à distinguer de "non précisé").
function buildYoutubeMetadata(opts: YoutubeComposerOptions) {
  const tags = opts.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    privacyStatus: opts.privacyStatus,
    madeForKids: opts.madeForKids,
    notifySubscribers: opts.notifySubscribers,
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(tags.length ? { tags } : {}),
    ...(opts.playlistId.trim() ? { playlistId: opts.playlistId.trim() } : {})
  };
}

// Réseaux qui acceptent un lieu (voir LocationPicker et publish.ts).
const LOCATION_NETWORKS = new Set<Network>(["INSTAGRAM", "FACEBOOK", "YOUTUBE"]);

// Bulles d'aide de l'option « Contenu généré par l'IA », par réseau : ce que
// chaque réseau en fait réellement (voir PublishInput.aiGenerated).
const AI_CONTENT_HELP: Record<Network, string> = {
  YOUTUBE:
    "À activer si la vidéo montre des images, des voix ou des scènes réalistes créées ou modifiées par l'IA (une personne qui semble réelle, un lieu ou un événement inventé…). YouTube affiche alors la mention « Contenu modifié ou synthétique ». Pas besoin de l'activer si l'IA a seulement aidé à écrire le titre ou la description.",
  TIKTOK:
    "À activer si la vidéo contient des images, des voix ou des scènes réalistes créées par l'IA. TikTok ajoute l'étiquette « Contenu généré par l'IA » sous la vidéo, comme l'exigent ses règles. Pas besoin de l'activer si l'IA a seulement aidé à écrire la légende.",
  INSTAGRAM:
    "À activer si l'image ou la vidéo a été créée ou fortement retouchée par l'IA. Instagram ne permet pas encore de poser son étiquette « Info IA » depuis une application : Nebula ajoute donc la mention « ✨ Contenu créé avec l'aide de l'IA » à la fin de la légende.",
  FACEBOOK:
    "À activer si l'image ou la vidéo a été créée ou fortement retouchée par l'IA. Facebook ne permet pas encore de poser son étiquette « Info IA » depuis une application : Nebula ajoute donc la mention « ✨ Contenu créé avec l'aide de l'IA » à la fin de la légende.",
  BLUESKY:
    "Bluesky n'a pas d'étiquette officielle « contenu IA » : l'option est enregistrée pour votre suivi, mais rien n'est ajouté au post. Si vous voulez le signaler, écrivez-le dans le texte (300 caractères maximum sur Bluesky).",
  THREADS:
    "À activer si l'image ou la vidéo a été créée ou fortement retouchée par l'IA. L'API Threads ne permet pas encore de poser l'étiquette « Info IA » : Nebula ajoute donc la mention « ✨ Contenu créé avec l'aide de l'IA » à la fin du texte.",
  PINTEREST:
    "À activer si l'image ou la vidéo a été créée ou fortement retouchée par l'IA. Pinterest détecte et étiquette lui-même une partie de ces contenus ; Nebula ajoute en plus la mention « ✨ Contenu créé avec l'aide de l'IA » à la fin de la description.",
  LINKEDIN:
    "À activer si l'image ou la vidéo a été créée ou fortement retouchée par l'IA. LinkedIn n'a pas de champ pour le signaler via son API : Nebula ajoute donc la mention « ✨ Contenu créé avec l'aide de l'IA » à la fin du texte."
};

const NOTIFY_SUBSCRIBERS_HELP =
  "Activé : les abonnés qui ont activé la cloche reçoivent une notification, et la vidéo apparaît dans leur fil « Abonnements ». Désactivez-le pour une vidéo mineure, un nouvel envoi ou une série de mises en ligne, pour ne pas lasser vos abonnés.";

// useSearchParams() impose un <Suspense> autour du composant qui l'appelle,
// sinon Next.js refuse de pré-générer la page au build (même erreur que
// celle rencontrée sur /register — voir ce fichier pour le détail).
export default function ComposerPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComposerPageInner />
    </Suspense>
  );
}

function ComposerPageInner() {
  const offeredNetworks = useAvailableNetworks();
  const { activeBrand } = useBrand();
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { celebrateMilestone } = useMilestoneCelebration();
  // Avis de la communauté (02/10/2026) : titre ou miniatures soumis aux autres créateurs.
  const [feedbackPrefill, setFeedbackPrefill] = useState<FeedbackPrefill | null>(null);
  const searchParams = useSearchParams();
  const duplicateId = searchParams.get("duplicate");
  // Brouillon venu d'un outil gratuit (« Programmer cette publication avec
  // Nebula », brief growth lot G4.a) : /composer?draft=<id>.
  const publicDraftId = searchParams.get("draft");
  // Résultat du Studio IA (produit n°9, « Utiliser dans Publier ») :
  // /composer?studio=<génération>&i=<numéro de l'idée>.
  const studioId = searchParams.get("studio");
  const studioIndex = Math.max(0, Number(searchParams.get("i") ?? "0") || 0);
  const prefilledDate = searchParams.get("date"); // depuis un clic sur une case du calendrier (YYYY-MM-DD)
  const prefilledTime = searchParams.get("time"); // optionnel, depuis la vue heures du calendrier (HH:mm)
  // Depuis le "+" d'un compte précis sur la page Comptes (voir accounts/page.tsx)
  // — pré-sélectionne CE compte (et lui seul) au chargement, voir l'effet
  // juste après le chargement des connexions ci-dessous.
  const targetConnectionId = searchParams.get("connectionId");
  const aiStatus = useAiStatus(activeBrand?.id);

  // Comptes connectés : cache partagé avec l'en-tête et les autres pages (lot 6).
  const cachedConnections = useConnections<ConnectionRow>(activeBrand?.id).connections;
  const connections = useMemo(() => cachedConnections ?? [], [cachedConnections]);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  // Dimensions des médias (Réussites, lot B : étoile « Vertical natif ») :
  // lues une fois dans le navigateur, enregistrées si elles manquent encore.
  const measuredMedia = useRef(new Set<string>());
  useEffect(() => {
    for (const a of assets) {
      if (!a.previewUrl || measuredMedia.current.has(a.id)) continue;
      measuredMedia.current.add(a.id);
      void measureMedia(a).then((dims) => {
        if (!dims) return;
        fetch(`/api/media/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dims) }).catch(() => undefined);
      });
    }
  }, [assets]);
  // Easter egg "Son Décollage" (voir /api/settings/publish-sound) : préférence
  // lue une fois au montage — jamais recalculée pendant l'édition, un simple
  // agrément sonore n'a pas besoin d'être temps réel.
  const [publishSoundEnabled, setPublishSoundEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/settings/publish-sound")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.enabled) setPublishSoundEnabled(true);
      })
      .catch(() => undefined);
  }, []);
  const [uploading, setUploading] = useState(false);
  // Fichier glissé au-dessus de la zone de dépôt : le cadre s'éclaire.
  const [dropActive, setDropActive] = useState(false);
  // Avancement de l'envoi direct (Vercel Blob), null si inconnu (envoi
  // classique ou import depuis une URL).
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  // Mini-jeu d'attente (voir loading-mini-game.tsx) : jamais en Mode focus.
  const { focusMode } = useFocusMode();
  // Fuseau de programmation de la marque (voir src/lib/timezone.ts).
  const timezone = activeBrand?.timezone ?? DEFAULT_TIMEZONE;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  // Bulle "Premier commentaire" (voir carte dédiée plus bas) : commentaire
  // optionnel posté automatiquement juste après la publication.
  const [firstComment, setFirstComment] = useState("");
  const [firstCommentOpen, setFirstCommentOpen] = useState(false);
  // Générateur de liens de campagne (UTM), bouton « lien » de la carte
  // « 3. Description ».
  const [campaignLinkOpen, setCampaignLinkOpen] = useState(false);
  // Panneau téléchargé à la première ouverture, puis gardé (il retient les
  // champs saisis) — lot 5.
  const campaignLinkUsed = useStickyTrue(campaignLinkOpen);
  // Lieu de la publication (Instagram, Facebook photo, YouTube), carte
  // « 4. Réseaux cibles ».
  const [location, setLocation] = useState<PickedLocation | null>(null);

  // Compteur de popularité des hashtags (voir carte "3. Description") :
  // combien de fois CETTE marque a déjà utilisé chaque hashtag tapé, tiré
  // de son vrai historique de publications (pas une popularité globale).
  const [hashtagCounts, setHashtagCounts] = useState<Record<string, number>>({});
  const [selectedNetworks, setSelectedNetworks] = useState<Network[]>([]);
  const [overrides, setOverrides] = useState<Partial<Record<Network, NetworkOverride>>>({});
  // "Préréglages YouTube" (voir panneau dans "4. Réseaux cibles" ci-dessous) —
  // un seul jeu de réglages par publication (pas par réseau comme `overrides`
  // ci-dessus) puisqu'un seul compte YouTube peut être ciblé à la fois.
  const [youtubeOptions, setYoutubeOptions] = useState<YoutubeComposerOptions>(DEFAULT_YOUTUBE_OPTIONS);
  const [youtubeOptionsOpen, setYoutubeOptionsOpen] = useState(false);
  // Pinterest : tableau et lien de l'épingle (voir pinterest-options.tsx).
  const [pinterestOptions, setPinterestOptions] = useState<PinterestComposerOptions>(DEFAULT_PINTEREST_OPTIONS);
  // Collaborateurs Instagram (01/10/2026, voir instagram-options.tsx).
  const [instagramOptions, setInstagramOptions] = useState<InstagramComposerOptions>(DEFAULT_INSTAGRAM_OPTIONS);
  // TikTok (règles Direct Post, 30/09/2026) : choix de la section TikTok,
  // jamais gardés d'une publication à l'autre (la confidentialité se choisit
  // à chaque fois), et ce qui bloque l'envoi (voir tiktok-options.tsx).
  const [tiktokOptions, setTiktokOptions] = useState<TiktokPostOptions>(DEFAULT_TIKTOK_OPTIONS);
  // Format choisi par réseau (07/10/2026) : Publication, Reel ou Story
  // (Instagram, Facebook). Sans choix : format proposé selon le média.
  const [formats, setFormats] = useState<Partial<Record<Network, PostFormat>>>({});
  const [igShareToFeed, setIgShareToFeed] = useState(true);
  // Taille et durée du premier média, lues dans le navigateur (format proposé,
  // Short ou vidéo YouTube, limites des Reels et Stories).
  const [mediaSize, setMediaSize] = useState<{ assetId: string; width: number; height: number; duration: number | null } | null>(null);
  const [tiktokStatus, setTiktokStatus] = useState<TiktokSectionStatus>({ reason: null, creator: null });
  // Option « Contenu généré par l'IA » : un interrupteur général (carte
  // « 1. Média », en haut de page, pour y penser avant de descendre aux
  // réseaux) qui s'applique à tous les réseaux, plus une exception possible
  // par réseau. Valeur effective d'un réseau = son exception ?? le général.
  const [aiContentAll, setAiContentAll] = useState(false);
  const [aiContentOverrides, setAiContentOverrides] = useState<Partial<Record<Network, boolean>>>({});
  const aiContentFor = (n: Network) => aiContentOverrides[n] ?? aiContentAll;
  function setAiContentEverywhere(next: boolean) {
    setAiContentAll(next);
    setAiContentOverrides({});
  }
  const [mode, setMode] = useState<ScheduleMode>(prefilledDate ? "date" : "now");
  const [scheduleDate, setScheduleDate] = useState(() =>
    prefilledDate ? `${prefilledDate}T${prefilledTime ?? "12:00"}` : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  // Champs en cours de génération IA (titre/description, global ou par
  // réseau) — voir onGenerateOne. Clé = "title"/"description" ou
  // "title:INSTAGRAM" etc. pour les champs spécifiques à un réseau. Permet
  // de désactiver précisément le bon bouton "IA" pendant l'appel, pour
  // éviter qu'on le reclique en boucle en pensant qu'il ne s'est rien passé
  // (l'appel prend quelques secondes, sans indicateur visuel jusqu'ici).
  const [generatingFields, setGeneratingFields] = useState<Set<string>>(new Set());

  function fieldKey(field: "title" | "description", network?: Network) {
    return network ? `${field}:${network}` : field;
  }
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbOptions, setThumbOptions] = useState<string[]>([]);
  // « Pourquoi » de chaque proposition (bulle au survol dans la grille).
  const [thumbReasons, setThumbReasons] = useState<Record<string, string>>({});
  // Miniature choisie depuis le chat IA (« Choisir celle-ci »).
  const [chatPickUrl, setChatPickUrl] = useState<string | null>(null);
  const [aiThumbLoading, setAiThumbLoading] = useState(false);
  const [thumbUploading, setThumbUploading] = useState(false);
  const lastCapturedFrame = useRef<Blob | null>(null);
  // Miniatures « en un clic » (07/10/2026) : étape en cours (texte du
  // bouton), image de la vidéo d'où vient chaque miniature créée (reprise
  // par « Générer cette miniature » du chat après un choix) et format.
  const [thumbStep, setThumbStep] = useState<"analyse" | "creation" | null>(null);
  const conceptFrames = useRef(new Map<string, Blob>());
  /** Miniatures dans l'ordre des cartes du chat (« Option 1, 2, 3 »). */
  const proposalUrls = useRef<string[]>([]);
  const [thumbAspect, setThumbAspect] = useState<"16:9" | "9:16" | null>(null);
  const thumbFileInputRef = useRef<HTMLInputElement>(null);

  // --- Assistant « Demander à Nebula » × section Miniature -----------------
  // 1) Quand la section Miniature est à l'écran, l'assistant bascule en
  //    contexte « miniatures » (accueil + suggestions dédiées, réponses
  //    structurées « comment + pourquoi »).
  // 2) Le bouton « Générer cette miniature » du tiroir dépose un brief
  //    (accroche + description d'image) : on le récupère ici et on le passe
  //    à la génération IA, qui a besoin de la frame réelle de la vidéo.
  const assistant = useAiAssistant();
  const upgrade = useUpgradeModal();
  // Sons de l'interface (lot U5) : réglage du compte, Mode focus.
  const { enabled: uiSoundsEnabled, play: playUiSound } = useUiSounds();
  const thumbSectionRef = useRef<HTMLDivElement>(null);
  const [assistantBrief, setAssistantBrief] = useState<ThumbnailBrief | null>(null);
  const briefAutoRunRef = useRef(false);
  // Cache la frame/image envoyée à Gemini pour la génération de titre/
  // description (voir getMediaFrameForAi) — invalidé dès que le média
  // change pour ne jamais analyser un fichier obsolète.
  const mediaFrameRef = useRef<{ base64: string; mimeType: string } | null>(null);
  // Résumé de la vidéo entière, image et son (09/10/2026, voir
  // getVideoBriefForAi) : une seule analyse par vidéo, partagée par le titre
  // et la description ; oublié dès que la vidéo change.
  const videoBriefRef = useRef<{ assetId: string; promise: Promise<string | null | typeof AI_BLOCKED> } | null>(null);
  const [analyzingMedia, setAnalyzingMedia] = useState(false);
  useEffect(() => {
    mediaFrameRef.current = null;
    const video = assets.find((a) => a.type === "VIDEO");
    if (videoBriefRef.current && videoBriefRef.current.assetId !== video?.id) videoBriefRef.current = null;
  }, [assets]);

  // Aperçu : format auto-détecté (court 9:16 vs 16:9) à partir des vraies
  // dimensions du fichier importé, et simulateur d'interface TikTok (voir
  // rendu de la carte "Aperçu" plus bas).
  const [previewAspectClass, setPreviewAspectClass] = useState("aspect-square");

  // Simulateur de Feed Instagram : les vraies vignettes des derniers posts
  // déjà ciblés sur Instagram pour cette marque (voir /api/posts/instagram-grid).
  const [showInstagramGrid, setShowInstagramGrid] = useState(false);
  const [instagramGridTiles, setInstagramGridTiles] = useState<{ imageUrl: string }[]>([]);
  const [gridLoading, setGridLoading] = useState(false);

  // Recyclage de contenu automatisé (Auto-Repurpose).
  const [repurposeOpen, setRepurposeOpen] = useState(false);
  const [repurposeLoading, setRepurposeLoading] = useState(false);
  const repurposeUsed = useStickyTrue(repurposeOpen || repurposeLoading);
  const [repurposeResult, setRepurposeResult] = useState<RepurposedContent | null>(null);

  // Bulle émojis + insertion au curseur pour Titre/Description. Un seul
  // panneau partagé (rendu via portail, voir EmojiPicker) positionné selon
  // les coordonnées réelles du bouton cliqué (emojiAnchor).
  const [emojiPickerFor, setEmojiPickerFor] = useState<"title" | "caption" | null>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<{ top: number; right: number } | null>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const captionInputRef = useRef<HTMLTextAreaElement>(null);

  function toggleEmojiPicker(which: "title" | "caption", e: React.MouseEvent<HTMLButtonElement>) {
    if (emojiPickerFor === which) {
      setEmojiPickerFor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setEmojiAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setEmojiPickerFor(which);
  }

  useEffect(() => {
    if (!emojiPickerFor) return;
    function onClickOutside(e: MouseEvent) {
      if (emojiPopoverRef.current && !emojiPopoverRef.current.contains(e.target as Node)) {
        setEmojiPickerFor(null);
      }
    }
    // Ferme aussi au scroll/redimensionnement — le panneau est en position
    // fixe, un scroll de la page le décalerait sinon de son bouton d'origine.
    function onScrollOrResize() {
      setEmojiPickerFor(null);
    }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [emojiPickerFor]);

  const captionHashtags = useMemo(() => {
    const matches = caption.match(/#(\w[\w-]*)/g) ?? [];
    return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
  }, [caption]);

  // Debounce (400ms) avant d'interroger /api/posts/hashtags pour éviter une
  // requête à chaque frappe pendant la rédaction.
  useEffect(() => {
    if (!activeBrand || captionHashtags.length === 0) {
      setHashtagCounts({});
      return;
    }
    const timeout = setTimeout(() => {
      fetch(`/api/posts/hashtags?brandId=${activeBrand.id}&tags=${captionHashtags.join(",")}`)
        .then((r) => r.json())
        .then((d) => setHashtagCounts(d.counts ?? {}))
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timeout);
  }, [activeBrand, captionHashtags]);

  function insertIntoField(kind: "title" | "caption", text: string) {
    if (kind === "title") {
      const el = titleInputRef.current;
      const start = el?.selectionStart ?? title.length;
      const end = el?.selectionEnd ?? title.length;
      const next = title.slice(0, start) + text + title.slice(end);
      setTitle(next);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + text.length, start + text.length);
      });
    } else {
      const el = captionInputRef.current;
      const start = el?.selectionStart ?? caption.length;
      const end = el?.selectionEnd ?? caption.length;
      const next = caption.slice(0, start) + text + caption.slice(end);
      setCaption(next);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(start + text.length, start + text.length);
      });
    }
  }

  // Quel compte utiliser pour chaque réseau sélectionné —
  // utile dès qu'un réseau a plusieurs comptes connectés (palier Pro+).
  const [selectedConnectionByNetwork, setSelectedConnectionByNetwork] = useState<Partial<Record<Network, string>>>({});

  // Premier commentaire (07/10/2026) : possible sur ce réseau avec le compte
  // choisi ? (autorisations lues par /api/connections ; YouTube : aussi
  // selon la confidentialité et « conçue pour les enfants » de la vidéo).
  function firstCommentSupportFor(network: Network): FirstCommentSupport {
    const connection = connections.find((c) => c.id === selectedConnectionByNetwork[network]) || connections.find((c) => c.network === network);
    if (network === "YOUTUBE" && (youtubeOptions.madeForKids || youtubeOptions.privacyStatus === "private")) {
      return firstCommentSupport("YOUTUBE", { scopes: "youtube.force-ssl" }, { youtube: youtubeOptions });
    }
    if (FORMAT_NETWORKS.has(network) && formatFor(network) === "STORY") return firstCommentSupport(network, null, { format: "STORY" });
    return connection?.firstComment ?? firstCommentSupport(network, null);
  }

  // Réseau affiché dans l'aperçu à droite (voir carte "Aperçu" ci-dessous) —
  // se recale automatiquement sur le premier réseau sélectionné tant que la
  // personne n'a pas cliqué sur un autre onglet réseau dans l'aperçu.
  const [previewNetwork, setPreviewNetworkState] = useState<Network | null>(null);
  // Réseau affiché dans l'aperçu, mémorisé dans ce navigateur (24/09/2026) :
  // on le retrouve en revenant sur Publier.
  useEffect(() => {
    try {
      const saved = getPref(PREVIEW_NETWORK_KEY);
      if (saved && (NETWORKS as readonly string[]).includes(saved)) setPreviewNetworkState(saved as Network);
    } catch {
      // stockage indisponible : premier réseau sélectionné
    }
  }, []);
  const setPreviewNetwork = useCallback((n: Network) => {
    setPreviewNetworkState(n);
    try {
      setPref(PREVIEW_NETWORK_KEY, n);
    } catch {
      // sans gravité
    }
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const draftRestored = useRef(false);
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl");

  useEffect(() => {
    setShortcutLabel(navigator.platform?.toLowerCase().includes("mac") ? "⌘" : "Ctrl");
  }, []);

  // Pré-remplissage depuis le "+" d'un compte sur la page Comptes : une fois
  // les connexions chargées, ne garde que ce réseau sélectionné et ce compte
  // précis choisi pour lui (au cas où plusieurs comptes du même réseau sont
  // connectés) — sans écraser un brouillon déjà en cours de restauration.
  useEffect(() => {
    if (!targetConnectionId || connections.length === 0 || duplicateId) return;
    const target = connections.find((c) => c.id === targetConnectionId);
    if (!target) return;
    setSelectedNetworks([target.network]);
    setSelectedConnectionByNetwork({ [target.network]: target.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetConnectionId, connections, duplicateId]);

  // Pré-remplissage depuis un post existant (bouton "Dupliquer")
  useEffect(() => {
    if (!duplicateId) return;
    fetch(`/api/posts/${duplicateId}`)
      .then((r) => r.json())
      .then((d) => {
        const post = d.post;
        if (!post) return;
        setTitle(post.title ?? "");
        setCaption(post.caption ?? "");
        if (post.firstComment) {
          setFirstComment(post.firstComment);
          setFirstCommentOpen(true);
        }
        setAssets(
          post.media.map((m: { mediaAsset: { id: string; url: string; filename: string; type: "VIDEO" | "IMAGE"; thumbnailUrl?: string; importSource?: string | null } }) => ({
            id: m.mediaAsset.id,
            url: m.mediaAsset.url,
            filename: m.mediaAsset.filename,
            type: m.mediaAsset.type,
            previewUrl: m.mediaAsset.url,
            thumbnailUrl: m.mediaAsset.thumbnailUrl,
            importSource: m.mediaAsset.importSource ?? null
          }))
        );
        setSelectedNetworks(post.targets.map((t: { network: Network }) => t.network));
        // Format choisi sur la publication d'origine (07/10/2026).
        const restored: Partial<Record<Network, PostFormat>> = {};
        for (const t of post.targets as { network: Network; metadata?: { format?: unknown; instagram?: { shareToFeed?: unknown } } | null }[]) {
          const f = t.metadata?.format;
          if (typeof f === "string" && (POST_FORMATS as readonly string[]).includes(f)) restored[t.network] = f as PostFormat;
          if (t.network === "INSTAGRAM" && typeof t.metadata?.instagram?.shareToFeed === "boolean") setIgShareToFeed(t.metadata.instagram.shareToFeed);
        }
        setFormats(restored);
      });
  }, [duplicateId]);

  // Brouillon automatique : on restaure le dernier brouillon non envoyé de
  // cette marque au chargement (sauf si on duplique un post existant), et on
  // sauvegarde en continu pour ne jamais perdre un titre/texte en cas de
  // fermeture accidentelle de l'onglet.
  // Brouillon public (outil gratuit) : titre / description / miniature
  // pré-remplis, puis brouillon supprimé côté serveur. Prend le pas sur le
  // brouillon local. L'image générée est réinjectée comme média via le
  // mécanisme d'envoi habituel (onFilesChosen), donc stockée normalement.
  const publicDraftConsumed = useRef(false);
  useEffect(() => {
    if (!publicDraftId || !activeBrand || publicDraftConsumed.current) return;
    publicDraftConsumed.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/public/drafts/${publicDraftId}`, { cache: "no-store" });
        if (!res.ok) {
          toast.error("Ce brouillon n'est plus disponible (il expire après 7 jours).");
          return;
        }
        const d = (await res.json()) as { kind: string; network: string | null; content: { title?: string; caption?: string; imageBase64?: string; imageMimeType?: string } };
        if (d.content.title) setTitle(d.content.title);
        if (d.content.caption) setCaption(d.content.caption);
        if (d.network && (NETWORKS as readonly string[]).includes(d.network)) setSelectedNetworks([d.network as Network]);
        if (d.content.imageBase64 && d.content.imageMimeType) {
          const bytes = Uint8Array.from(atob(d.content.imageBase64), (c) => c.charCodeAt(0));
          const ext = d.content.imageMimeType.includes("png") ? "png" : "jpg";
          const file = new File([bytes], `miniature-nebula.${ext}`, { type: d.content.imageMimeType });
          const dt = new DataTransfer();
          dt.items.add(file);
          await onFilesChosen(dt.files);
        }
        await fetch(`/api/public/drafts/${publicDraftId}`, { method: "DELETE" }).catch(() => undefined);
        toast.success("Votre création est pré-remplie : choisissez vos réseaux et programmez.");
      } catch {
        toast.error("Impossible de récupérer le brouillon.");
      }
    })();
    // onFilesChosen est stable tant que la marque ne change pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicDraftId, activeBrand]);

  const studioConsumed = useRef(false);
  useEffect(() => {
    if (!studioId || !activeBrand || studioConsumed.current) return;
    studioConsumed.current = true;
    (async () => {
      const res = await fetch(`/api/studio/generations/${encodeURIComponent(studioId)}?brandId=${encodeURIComponent(activeBrand.id)}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) {
        toast.error("Ce résultat du Studio IA n'est plus disponible.");
        return;
      }
      const { generation } = (await res.json()) as { generation: { output: StudioOutput } };
      const draft = composerDraftFrom(generation.output, studioIndex);
      if (!draft) return;
      setTitle(draft.title);
      setCaption(draft.caption);
      if (draft.network) setSelectedNetworks([draft.network]);
      toast.success("Repris du Studio IA : ajoutez votre vidéo, relisez et programmez.");
    })();
    // Une seule reprise par visite, dès que la marque est connue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, activeBrand]);

  // Brouillon enregistré dans le compte (29/09/2026, voir
  // lib/composer-draft-client.ts) : il suit d'un appareil à l'autre.
  // `draftReady` : pas d'enregistrement avant la fin de la lecture (sinon le
  // formulaire vide effacerait le brouillon à restaurer).
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    if (!activeBrand || duplicateId || publicDraftId || studioId || draftRestored.current) return;
    draftRestored.current = true;
    const brandId = activeBrand.id;
    void loadComposerDraft(brandId).then((draft) => {
      if (draft && (draft.title || draft.caption)) {
        setTitle(draft.title ?? "");
        setCaption(draft.caption ?? "");
        if (draft.firstComment) {
          setFirstComment(draft.firstComment);
          setFirstCommentOpen(true);
        }
        setSelectedNetworks((draft.selectedNetworks ?? []) as Network[]);
        toast.info("Brouillon restauré depuis votre dernière visite.");
      }
      setDraftReady(true);
    });
    // publicDraftId : lu une fois à l'arrivée (voir l'effet dédié plus bas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand, duplicateId, toast]);

  useEffect(() => {
    if (!activeBrand || duplicateId) return;
    // Arrivée avec un contenu imposé (duplication, outil, Studio) : pas de
    // lecture du brouillon, l'enregistrement peut commencer tout de suite.
    if (!draftReady && !(publicDraftId || studioId)) return;
    saveComposerDraft(activeBrand.id, { title, caption, firstComment, selectedNetworks });
  }, [activeBrand, duplicateId, publicDraftId, studioId, draftReady, title, caption, firstComment, selectedNetworks]);

  const availableNetworks = Array.from(new Set(connections.map((c) => c.network)));
  const videoAsset = assets.find((a) => a.type === "VIDEO");

  // Taille et durée du premier média (07/10/2026, choix du format).
  useEffect(() => {
    const first = assets[0];
    if (!first?.previewUrl) {
      setMediaSize(null);
      return;
    }
    if (mediaSize?.assetId === first.id) return;
    let cancelled = false;
    if (first.type === "VIDEO") {
      void readVideoInfo(first.previewUrl).then((info) => {
        if (!cancelled && info && info.width > 0) setMediaSize({ assetId: first.id, width: info.width, height: info.height, duration: info.duration > 0 ? info.duration : null });
      });
    } else {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setMediaSize({ assetId: first.id, width: img.naturalWidth, height: img.naturalHeight, duration: null });
      };
      img.src = first.previewUrl;
    }
    return () => {
      cancelled = true;
    };
    // mediaSize : seulement pour ne pas relire le même média.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);
  const mediaFacts = useMemo<MediaFacts>(() => {
    const size = mediaSize && mediaSize.assetId === assets[0]?.id ? mediaSize : null;
    return { type: assets[0]?.type ?? null, count: assets.length, width: size?.width ?? null, height: size?.height ?? null, durationSeconds: size?.duration ?? null };
  }, [assets, mediaSize]);
  /** Format retenu pour ce réseau : celui choisi, sinon celui proposé selon le média. */
  const formatFor = useCallback(
    (network: Network): PostFormat | null => (FORMAT_NETWORKS.has(network) ? (formats[network] ?? defaultFormat(network, mediaFacts)) : null),
    [formats, mediaFacts]
  );
  // Format impossible avec ce média (vidéo trop longue pour une story…).
  const formatBlocked = assets.length > 0 ? (selectedNetworks.map((n) => formatProblem(n, formatFor(n), mediaFacts)).find(Boolean) ?? null) : null;

  // Section Miniature à l'écran ⇒ l'assistant passe en contexte « miniatures ».
  // Remis à zéro dès que la section sort de l'écran, disparaît (vidéo
  // retirée) ou que la page est quittée.
  const { setContextOverride } = assistant;
  useEffect(() => {
    const el = thumbSectionRef.current;
    if (!el || !videoAsset || typeof IntersectionObserver === "undefined") {
      setContextOverride(null);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setContextOverride(entry.isIntersecting ? "thumbnails" : null),
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      setContextOverride(null);
    };
  }, [videoAsset, setContextOverride]);

  // Brief déposé par le tiroir : lu au montage (on arrive d'une autre page)
  // ou reçu en direct (on était déjà sur Publier — dans ce cas la génération
  // démarre toute seule si une vidéo est là, c'est ce que le clic promettait).
  useEffect(() => {
    const pending = readPendingThumbnailBrief();
    if (pending) setAssistantBrief(pending);
    function onBrief(e: Event) {
      const brief = (e as CustomEvent<ThumbnailBrief>).detail;
      if (!brief?.imagePrompt) return;
      briefAutoRunRef.current = true;
      setAssistantBrief(brief);
    }
    window.addEventListener(THUMBNAIL_BRIEF_EVENT, onBrief);
    return () => window.removeEventListener(THUMBNAIL_BRIEF_EVENT, onBrief);
  }, []);

  // « Choisir celle-ci » dans le chat → on applique, seulement si l'image
  // fait bien partie des propositions de la vidéo en cours.
  useEffect(() => {
    function onPick(e: Event) {
      const url = (e as CustomEvent<string>).detail;
      if (typeof url === "string") setChatPickUrl(url);
    }
    window.addEventListener(THUMBNAIL_PICK_EVENT, onPick);
    return () => window.removeEventListener(THUMBNAIL_PICK_EVENT, onPick);
  }, []);

  useEffect(() => {
    if (!chatPickUrl) return;
    setChatPickUrl(null);
    if (!videoAsset || !thumbOptions.includes(chatPickUrl)) {
      toast.error("Cette proposition ne correspond plus à la vidéo en cours : relancez la génération des miniatures.");
      return;
    }
    void pickThumbnail(chatPickUrl);
    toast.success("Miniature appliquée.");
    // pickThumbnail est recréée à chaque rendu : on ne réagit qu'au choix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatPickUrl]);

  useEffect(() => {
    if (!briefAutoRunRef.current || !assistantBrief) return;
    briefAutoRunRef.current = false;
    if (videoAsset) {
      thumbSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      void onGenerateThumbnailWithAi(assistantBrief);
    } else {
      toast.info("Brief de l'assistant reçu : ajoutez votre vidéo, puis « Générer » sur le brief, dans la section Miniature.");
    }
    // onGenerateThumbnailWithAi est une fonction du composant, recréée à
    // chaque rendu : on ne réagit qu'à l'arrivée du brief.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantBrief, videoAsset]);

  // Média importé depuis Google Drive, Dropbox, OneDrive, Unsplash ou Canva
  // (lot 3, voir media-import-bar.tsx) : même effet qu'un envoi classique —
  // il remplace le média en cours. Pour Unsplash, le crédit du photographe
  // peut être ajouté à la fin de la légende.
  const onMediaImported = useCallback(
    (asset: UploadedAssetResult, extra?: { credit?: { name: string } | null; creditInCaption?: boolean; source?: string }) => {
      setUploadError(null);
      // La source reste affichée sous le média (« Image importée depuis Canva »).
      setAssets([{ id: asset.id, url: asset.url, filename: asset.filename, type: asset.type, previewUrl: asset.url, importSource: extra?.source ?? null }]);
      setThumbOptions([]);
      setPreviewAspectClass("aspect-square");
      if (extra?.credit && extra.creditInCaption) {
        const line = `📷 Photo : ${extra.credit.name} sur Unsplash`;
        setCaption((prev) => (prev.includes(line) ? prev : `${prev.trimEnd()}${prev.trim() ? "\n\n" : ""}${line}`));
      }
      toast.success(`« ${asset.filename} » ajouté à la publication.`);
    },
    [toast]
  );

  const onFilesChosen = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length || !activeBrand) return;
      setUploading(true);
      setUploadPercent(null);
      setUploadError(null);

      // Un seul média à la fois : un nouveau fichier remplace le précédent.
      const fileList = Array.from(files).slice(0, 1);
      const results = await Promise.allSettled(
        fileList.map(async (f) => {
          const previewUrl = URL.createObjectURL(f);
          const asset = await uploadMediaFile(f, activeBrand.id, setUploadPercent);
          return { asset, previewUrl };
        })
      );

      setUploading(false);
      setUploadPercent(null);

      const newAssets: UploadedAsset[] = [];
      const errors: string[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          newAssets.push({
            id: r.value.asset.id,
            url: r.value.asset.url,
            filename: r.value.asset.filename,
            type: r.value.asset.type,
            previewUrl: r.value.previewUrl
          });
        } else {
          const message = r.reason instanceof Error ? r.reason.message : "Échec de l'envoi du fichier.";
          errors.push(message);
          toast.error(message);
        }
      }
      if (errors.length) {
        // En plus du toast (qui disparaît tout seul), un message persistant
        // et copiable sous la zone d'import : plus facile à lire/partager
        // pour diagnostiquer un souci de configuration (ex: capture d'écran).
        setUploadError(errors.join(" · "));
      }
      if (newAssets.length) {
        // Remplace le média existant plutôt que de l'ajouter (limite à 1
        // fichier — voir le commentaire plus haut).
        setAssets(newAssets);
        setThumbOptions([]);
        setPreviewAspectClass("aspect-square");
      }
    },
    [activeBrand, toast]
  );

  // Éditeur vidéo (30/09/2026) : la vidéo modifiée remplace l'actuelle.
  const [editingVideo, setEditingVideo] = useState<UploadedAsset | null>(null);
  const saveEditedVideo = useCallback(
    async (file: File) => {
      if (!activeBrand) throw new Error("Choisissez une marque avant d'enregistrer la vidéo.");
      const asset = await uploadMediaFile(file, activeBrand.id, setUploadPercent);
      setUploadPercent(null);
      // Vidéo importée (Canva, Drive…) puis modifiée : elle garde son origine
      // (03/10/2026), recopiée côté serveur depuis la vidéo d'avant.
      const original = editingVideo?.importSource ? editingVideo : null;
      if (original) {
        await fetch(`/api/media/${asset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ importSourceFrom: original.id })
        }).catch(() => undefined);
      }
      setAssets([
        { id: asset.id, url: asset.url, filename: asset.filename, type: asset.type, previewUrl: URL.createObjectURL(file), importSource: original?.importSource ?? null }
      ]);
      setThumbOptions([]);
      setPreviewAspectClass("aspect-square");
      toast.success("Vidéo modifiée : c'est elle qui sera publiée.");
    },
    [activeBrand, toast, editingVideo]
  );

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setPreviewAspectClass("aspect-square");
  }

  // Confirmation avant de retirer un média (01/10/2026) : une vidéo montée
  // dans l'éditeur, par exemple, serait perdue d'un clic.
  async function confirmRemoveAsset(a: UploadedAsset) {
    const ok = await confirmDialog({
      title: a.type === "VIDEO" ? "Supprimer cette vidéo de la publication ?" : "Supprimer cette image de la publication ?",
      message: "Le fichier sera retiré de la publication en cours. Vos modifications faites dans l'éditeur vidéo seront perdues.",
      confirmLabel: "Supprimer",
      danger: true
    });
    if (ok) removeAsset(a.id);
  }

  function toggleNetwork(n: Network) {
    setSelectedNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
    setSelectedConnectionByNetwork((prev) => {
      if (prev[n]) return prev;
      const first = connections.find((c) => c.network === n);
      return first ? { ...prev, [n]: first.id } : prev;
    });
  }

  function setNetworkConnection(n: Network, connectionId: string) {
    setSelectedConnectionByNetwork((prev) => ({ ...prev, [n]: connectionId }));
  }

  function toggleOverride(n: Network) {
    setOverrides((prev) => ({
      ...prev,
      [n]: prev[n]?.open ? { ...prev[n]!, open: false } : { open: true, title: prev[n]?.title ?? "", caption: prev[n]?.caption ?? "" }
    }));
  }

  function setOverrideField(n: Network, field: "title" | "caption", value: string) {
    setOverrides((prev) => ({ ...prev, [n]: { open: true, title: "", caption: "", ...prev[n], [field]: value } }));
  }

  // Récupère une vraie image du média importé (une frame de la vidéo, ou
  // l'image elle-même) pour que Gemini génère titre/description en
  // ANALYSANT réellement ce qui est publié, plutôt qu'un texte générique
  // "de marque" sans rapport avec le contenu. Mise en cache le temps que le
  // média ne change pas, pour ne pas ré-extraire/ré-encoder à chaque champ
  // généré (titre, description, puis chaque réseau personnalisé).
  async function getMediaFrameForAi(): Promise<{ base64: string; mimeType: string } | null> {
    if (mediaFrameRef.current) return mediaFrameRef.current;
    try {
      if (videoAsset) {
        const [frameBlob] = await captureVideoFrames(videoAsset.previewUrl, 1);
        if (!frameBlob) return null;
        const base64 = await blobToBase64(frameBlob);
        mediaFrameRef.current = { base64, mimeType: "image/jpeg" };
      } else if (assets[0]) {
        const res = await fetch(assets[0].previewUrl);
        const blob = await res.blob();
        const base64 = await blobToBase64(blob);
        mediaFrameRef.current = { base64, mimeType: blob.type || "image/jpeg" };
      }
    } catch {
      // L'extraction a échoué (format non lisible par le navigateur, etc.) —
      // on continue sans image plutôt que de bloquer la génération.
      return null;
    }
    return mediaFrameRef.current;
  }

  // « Rédiger avec l'IA » regarde d'abord la vidéo en entier, image et son
  // (09/10/2026, demande de Lucas) : /api/media/[id]/copy-analysis renvoie ce
  // qu'elle montre et ce qui y est dit ; la rédaction part de ce résumé.
  // Analyse impossible : on écrit à partir d'une image de la vidéo, en le
  // disant. Quota ou palier : la fenêtre de mise à niveau, et rien n'est écrit.
  function getVideoBriefForAi(): Promise<string | null | typeof AI_BLOCKED> {
    if (!videoAsset) return Promise.resolve(null);
    if (videoBriefRef.current?.assetId === videoAsset.id) return videoBriefRef.current.promise;
    const asset = videoAsset;
    const promise = (async () => {
      setAnalyzingMedia(true);
      try {
        const info = await readVideoInfo(asset.previewUrl).catch(() => null);
        const res = await fetch(`/api/media/${asset.id}/copy-analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(info && info.duration > 0 ? { durationSeconds: Math.round(info.duration * 10) / 10 } : {})
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (res && res.ok && typeof data.brief === "string" && data.brief) return data.brief as string;
        // Un échec n'est pas gardé : le prochain clic relance l'analyse.
        videoBriefRef.current = null;
        if (res && upgrade.openFromResponse(res.status, data)) return AI_BLOCKED;
        toast.info(`${typeof data.error === "string" ? data.error : "La vidéo n'a pas pu être analysée en entier."} Le texte est écrit à partir d'une image de la vidéo.`);
        return null;
      } finally {
        setAnalyzingMedia(false);
      }
    })();
    videoBriefRef.current = { assetId: asset.id, promise };
    return promise;
  }

  async function generateField(field: "title" | "description", network?: Network) {
    if (!activeBrand) return "";
    // Sans média, rien à analyser : l'IA n'écrit plus un texte générique sur la marque.
    if (assets.length === 0) {
      toast.info(AI_NEEDS_MEDIA);
      return "";
    }
    const brief = await getVideoBriefForAi();
    if (brief === AI_BLOCKED) return "";
    const frame = await getMediaFrameForAi();
    const res = await fetch("/api/ai/generate-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: activeBrand.id,
        field,
        network,
        existingTitle: title,
        existingCaption: caption,
        mediaHint: videoAsset ? "vidéo" : assets.length ? "image" : undefined,
        frameBase64: frame?.base64,
        frameMimeType: frame?.mimeType,
        mediaBrief: brief ?? undefined
      })
    });
    const data = await res.json();
    if (!res.ok) {
      if (upgrade.openFromResponse(res.status, data)) return "";
      toast.error(data.error ?? "Erreur IA.");
      return "";
    }
    return data.text as string;
  }

  async function onGenerateOne(field: "title" | "description", network?: Network) {
    const key = fieldKey(field, network);
    setGeneratingFields((prev) => new Set(prev).add(key));
    try {
      const text = await generateField(field, network);
      if (!text) return;
      if (!network) {
        if (field === "title") setTitle(text);
        else setCaption(text);
      } else {
        setOverrideField(network, field === "title" ? "title" : "caption", text);
      }
    } finally {
      setGeneratingFields((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function onGenerateAll() {
    if (assets.length === 0) {
      toast.info(AI_NEEDS_MEDIA);
      return;
    }
    setGeneratingAll(true);
    // L'IA écrit le titre et la description (étapes 2 et 3) ; les textes
    // adaptés par réseau (étape 4) restent écrits à la main (01/10/2026).
    await Promise.all([onGenerateOne("title"), onGenerateOne("description")]);
    setGeneratingAll(false);
  }

  // Bouton de la section Miniature. Avec l'IA (07/10/2026) : miniatures
  // « en un clic » (onCreateThumbnailsFromVideo). Sans IA : 3 images de la
  // vidéo prises à intervalles réguliers.
  async function onGenerateThumbnails(options: { viaChat?: boolean } = {}) {
    if (!videoAsset) return;
    const useAi = Boolean(aiStatus?.enabled && activeBrand);
    if (options.viaChat && useAi && assistant.enabled) return onCreateThumbnailsFromVideo();
    return onPickFrames({ viaChat: options.viaChat });
  }

  // Miniatures « en un clic » (07/10/2026, demande de Lucas) : plus aucune
  // question sur le sujet ou le public de la vidéo.
  //  1. Gemini regarde la vidéo importée (image et son, /thumbnails/analyze),
  //     dit ce qu'il en a compris dans le chat et propose 3 concepts, chacun
  //     ancré sur un instant précis de la vidéo ;
  //  2. le navigateur extrait l'image de chaque instant ;
  //  3. chaque miniature est créée à partir de cette image (/thumbnails/ai :
  //     une miniature décomptée par image réussie, 3 par clic au plus) ;
  //  4. les miniatures arrivent dans le chat, avec leur accroche, l'instant
  //     d'où elles viennent et le « pourquoi » du taux de clic.
  // Vidéo impossible à analyser : repli sur les 3 meilleures images extraites.
  async function onCreateThumbnailsFromVideo() {
    if (!videoAsset || !activeBrand) return;
    const asset = videoAsset;
    setThumbLoading(true);
    setThumbStep("analyse");
    assistant.inject([{ role: "user", text: `Crée 3 miniatures pour ma vidéo${title.trim() ? ` « ${title.trim()} »` : ""}.` }], { contextKey: "thumbnails" });
    assistant.setExternalThinking(true, "Je regarde votre vidéo, image et son…");
    // Raison du repli sur l'ancienne méthode (vidéo impossible à analyser),
    // lancé APRÈS avoir rendu la main (bouton, indicateur du chat).
    let fallbackReason: string | null = null;
    // Étapes 1 à 4 ; un « return » y termine la tentative sans sauter le repli.
    const attempt = async () => {
      const info = await readVideoInfo(asset.previewUrl);
      const res = await fetch(`/api/media/${asset.id}/thumbnails/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          caption,
          networks: selectedNetworks,
          ...(info && info.duration > 0 ? { durationSeconds: Math.round(info.duration * 10) / 10 } : {}),
          ...(info && info.width > 0 && info.height > 0 ? { width: info.width, height: info.height } : {})
        })
      });
      const data = (await res.json().catch(() => ({}))) as Partial<ThumbnailAnalysisResponse> & { error?: unknown };
      const errorText = typeof data.error === "string" ? data.error : null;
      if (!res.ok) {
        // Palier, adresse à confirmer, quota : la bonne fenêtre (rien n'est décompté).
        if (upgrade.openFromResponse(res.status, data)) {
          assistant.inject([{ role: "model", text: errorText ?? "Les miniatures IA ne sont pas disponibles pour le moment.", error: true }]);
        } else if (res.status === 429 || res.status === 401) {
          assistant.inject([{ role: "model", text: errorText ?? "Réessayez dans quelques minutes.", error: true }]);
        } else {
          fallbackReason = errorText ?? "Je n'ai pas pu regarder votre vidéo cette fois-ci.";
        }
        return;
      }
      const analysis = data as ThumbnailAnalysisResponse;
      const concepts = analysis.concepts.slice(0, Math.max(0, analysis.imagesAllowed));
      assistant.inject([{ role: "model", text: thumbnailAnalysisMessage(analysis, concepts.length) }]);
      if (concepts.length === 0) {
        assistant.inject([{ role: "model", text: "Vous avez utilisé toutes vos miniatures IA de ce mois-ci : je ne peux pas en créer de nouvelles pour l'instant.", error: true }]);
        return;
      }

      setThumbStep("creation");
      assistant.setExternalThinking(true, concepts.length > 1 ? `Je crée les ${concepts.length} miniatures à partir de ces moments…` : "Je crée la miniature à partir de ce moment…");
      const captured = await captureVideoFramesAt(asset.previewUrl, concepts.map((c) => c.second), { maxWidth: 1920 });
      const aspect: "16:9" | "9:16" = captured.height > captured.width ? "9:16" : "16:9";
      const results = await Promise.allSettled(
        concepts.map(async (concept, k) => {
          const frame = captured.frames[k];
          if (!frame) throw new Error("Image introuvable à cet instant de la vidéo.");
          const r = await fetch(`/api/media/${asset.id}/thumbnails/ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              frameBase64: await blobToBase64(frame),
              frameMimeType: "image/jpeg",
              title,
              aspect,
              brief: { hook: concept.hook, imagePrompt: concept.imagePrompt }
            })
          });
          const d = (await r.json().catch(() => ({}))) as { url?: string; error?: unknown };
          if (!r.ok || !d.url) {
            throw Object.assign(new Error(typeof d.error === "string" ? d.error : "La miniature n'a pas pu être créée."), { status: r.status, data: d });
          }
          return { url: d.url, frame, concept, index: k };
        })
      );
      const made = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = results.flatMap((r, k) => (r.status === "rejected" ? [{ index: k, error: r.reason as Error & { status?: number; data?: unknown } }] : []));
      // Quota atteint pendant la création : la fenêtre adaptée, une seule fois.
      const refused = failed.find((f) => f.error.status === 402 || f.error.status === 403 || f.error.status === 429);
      if (refused?.error.status) upgrade.openFromResponse(refused.error.status, refused.error.data);
      if (made.length === 0) throw new Error(failed[0]?.error.message ?? "Aucune miniature n'a pu être créée.");

      const urls = made.map((m) => m.url);
      conceptFrames.current = new Map(made.map((m) => [m.url, m.frame]));
      proposalUrls.current = urls;
      lastCapturedFrame.current = made[0].frame;
      setThumbAspect(aspect);
      setThumbOptions(urls);
      setThumbReasons(Object.fromEntries(made.map((m) => [m.url, m.concept.why.join(" ")])));
      const cards: FramePickCard[] = made.map((m) => ({
        url: m.url,
        reason: m.concept.why.join(" "),
        sharpness: 0,
        framing: 0,
        clickPotential: 0,
        angle: m.concept.angle,
        hook: m.concept.hook,
        second: m.concept.second,
        moment: m.concept.moment,
        why: m.concept.why,
        aspect
      }));
      const notes = [
        ...failed.map((f) => `La proposition ${f.index + 1} n'a pas pu être créée : ${f.error.message}`),
        analysis.concepts.length > concepts.length
          ? `Il ne vous restait que ${concepts.length} miniature${concepts.length > 1 ? "s" : ""} IA ce mois-ci : j'ai gardé ${concepts.length > 1 ? "les plus fortes" : "la plus forte"}.`
          : ""
      ].filter(Boolean);
      assistant.inject([
        {
          role: "model",
          text: [
            made.length > 1
              ? `Voici ${made.length} miniatures créées à partir de vrais moments de votre vidéo, de la plus forte à la moins forte. Choisissez-en une, ou demandez-moi d'en retravailler une (par exemple « rends la 2 plus contrastée »).`
              : "Voici votre miniature, créée à partir d'un vrai moment de votre vidéo. Choisissez-la, ou demandez-moi de la retravailler.",
            ...notes
          ].join("\n\n"),
          framePicks: cards
        }
      ]);
    };
    try {
      await attempt();
    } catch (err) {
      const message = (err as Error).message || "La création des miniatures a échoué.";
      toast.error(message);
      assistant.inject([{ role: "model", text: message, error: true }]);
    } finally {
      setThumbLoading(false);
      setThumbStep(null);
      assistant.setExternalThinking(false);
    }
    if (fallbackReason) await onPickFrames({ viaChat: true, fallbackReason });
  }

  // Ancienne méthode, gardée pour le repli et sans IA : extrait 12 images de
  // la vidéo, en fait choisir exactement 3 à l'IA (netteté, cadrage,
  // potentiel de clic) et, avec le chat, les présente avec le pourquoi de
  // chaque choix et un bouton « Choisir celle-ci ». Sans IA : 3 images
  // prises à intervalles réguliers, sans chat. `viaChat: false` : appel
  // interne (ex. avant la génération d'un brief), sans ouvrir le chat.
  // `fallbackReason` : la vidéo n'a pas pu être analysée (message déjà
  // demandé dans le chat).
  async function onPickFrames(options: { viaChat?: boolean; fallbackReason?: string } = {}) {
    if (!videoAsset) return;
    const CANDIDATE_COUNT = 12;
    const TARGET_COUNT = 3;
    const useAi = Boolean(aiStatus?.enabled && activeBrand);
    const useChat = Boolean(options.viaChat && useAi && assistant.enabled);
    setThumbLoading(true);
    if (useChat) {
      assistant.inject(
        options.fallbackReason
          ? [{ role: "model", text: `${options.fallbackReason} À la place, je choisis les 3 meilleures images de la vidéo.`, error: true }]
          : [{ role: "user", text: `Propose-moi les 3 meilleures miniatures pour ma vidéo${title.trim() ? ` « ${title.trim()} »` : ""}.` }],
        { contextKey: "thumbnails" }
      );
      assistant.setExternalThinking(true, "Je choisis les meilleures images de la vidéo…");
    }
    try {
      const blobs = await captureVideoFrames(videoAsset.previewUrl, CANDIDATE_COUNT);
      if (!blobs.length) throw new Error("Aucune image n'a pu être extraite de cette vidéo.");

      let picks: { blob: Blob; reason: string; sharpness: number; framing: number; clickPotential: number }[] = [];
      if (useAi && activeBrand) {
        try {
          const encoded = await Promise.all(blobs.map(blobToBase64));
          const res = await fetch("/api/ai/pick-best-frames", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brandId: activeBrand.id,
              count: TARGET_COUNT,
              frames: encoded.map((base64, index) => ({ index, base64, mimeType: "image/jpeg" }))
            })
          });
          const data = await res.json();
          if (res.ok && Array.isArray(data.picks)) {
            picks = (data.picks as { index: number; reason: string; sharpness: number; framing: number; clickPotential: number }[])
              .filter((p) => blobs[p.index])
              .map((p) => ({ blob: blobs[p.index], reason: p.reason, sharpness: p.sharpness, framing: p.framing, clickPotential: p.clickPotential }));
          }
        } catch {
          // L'IA a échoué ou n'a pas répondu à temps — on retombe simplement
          // sur l'échantillonnage régulier ci-dessous plutôt que d'échouer.
        }
      }
      const aiAnalysed = picks.length > 0;
      if (!aiAnalysed) {
        // Trois images réparties dans la vidéo (début, milieu, fin).
        const step = blobs.length / TARGET_COUNT;
        picks = Array.from({ length: Math.min(TARGET_COUNT, blobs.length) }, (_, k) => ({
          blob: blobs[Math.min(blobs.length - 1, Math.floor(step * k + step / 2))],
          reason: "",
          sharpness: 0,
          framing: 0,
          clickPotential: 0
        }));
      }
      picks = picks.slice(0, TARGET_COUNT);

      lastCapturedFrame.current = picks[0].blob;
      const urls = await Promise.all(picks.map((p) => uploadThumbnailBlob(p.blob)));
      conceptFrames.current = new Map(urls.map((u, k) => [u, picks[k].blob]));
      proposalUrls.current = urls;
      setThumbAspect(null);
      setThumbOptions(urls);
      setThumbReasons(Object.fromEntries(urls.map((u, k) => [u, picks[k].reason]).filter(([, r]) => r)));

      if (useChat) {
        const cards: FramePickCard[] = urls.map((url, k) => ({
          url,
          reason: picks[k].reason,
          sharpness: picks[k].sharpness,
          framing: picks[k].framing,
          clickPotential: picks[k].clickPotential
        }));
        assistant.inject([
          {
            role: "model",
            text: aiAnalysed
              ? `J'ai analysé ${blobs.length} images prises tout au long de votre vidéo et gardé les 3 qui feraient les meilleures miniatures, de la plus forte à la moins forte. Mes critères : la **netteté** (pas de flou de mouvement), le **cadrage** (sujet bien visible, lisible même en petit) et le **potentiel de clic** (expression, geste, contraste qui arrêtent le défilement). Choisissez celle qui vous plaît, ou demandez-moi d'en améliorer une.`
              : "Je n'ai pas pu analyser les images cette fois-ci. Voici 3 images prises au début, au milieu et à la fin de votre vidéo : choisissez celle qui donne le plus envie de cliquer, ou réessayez dans un instant.",
            framePicks: cards
          }
        ]);
      }
    } catch (err) {
      const message = (err as Error).message ?? "Échec de l'extraction de miniatures.";
      toast.error(message);
      if (useChat) assistant.inject([{ role: "model", text: message, error: true }]);
    } finally {
      setThumbLoading(false);
      if (useChat) assistant.setExternalThinking(false);
    }
  }

  async function onGenerateThumbnailWithAi(briefOverride?: ThumbnailBrief | null) {
    if (!videoAsset) return;
    if (!lastCapturedFrame.current) {
      await onGenerateThumbnails({ viaChat: false });
    }
    if (!lastCapturedFrame.current) return;
    const brief = briefOverride === undefined ? assistantBrief : briefOverride;
    // Proposition retravaillée (« rends la 2 plus contrastée ») : on repart
    // de l'image de la vidéo d'où vient cette proposition.
    const optionUrl = brief?.option ? proposalUrls.current[brief.option - 1] : undefined;
    const frame = (optionUrl && conceptFrames.current.get(optionUrl)) || lastCapturedFrame.current;
    setAiThumbLoading(true);
    try {
      const base64 = await blobToBase64(frame);
      // Format de la vidéo (07/10/2026) : une vidéo verticale garde une miniature 9:16.
      const info = thumbAspect ? null : await readVideoInfo(videoAsset.previewUrl);
      const aspect = thumbAspect ?? (info && info.height > info.width ? "9:16" : "16:9");
      const res = await fetch(`/api/media/${videoAsset.id}/thumbnails/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameBase64: base64, frameMimeType: "image/jpeg", title, brief, aspect })
      });
      const data = await res.json();
      if (!res.ok && upgrade.openFromResponse(res.status, data)) return;
      if (!res.ok) throw new Error(data.error ?? "Échec de la génération IA.");
      setThumbOptions((prev) => [data.url, ...prev]);
      await pickThumbnail(data.url);
      // Le brief a servi : on ne le rejouera pas au prochain chargement de
      // la page (mais il reste affiché, pour regénérer si on veut).
      clearPendingThumbnailBrief();
      toast.success(brief ? "Miniature générée selon le brief de l'assistant." : "Miniature générée par l'IA ajoutée.");
    } catch (err) {
      toast.error((err as Error).message ?? "Échec de la génération IA.");
    } finally {
      setAiThumbLoading(false);
    }
  }

  async function onThumbFileChosen(file: File | null) {
    if (!file || !videoAsset) return;
    setThumbUploading(true);
    try {
      const url = await uploadThumbnailBlob(file);
      setThumbOptions((prev) => [url, ...prev]);
      await pickThumbnail(url);
      toast.success("Miniature ajoutée depuis votre ordinateur.");
    } catch (err) {
      toast.error((err as Error).message ?? "Échec de l'envoi de la miniature.");
    } finally {
      setThumbUploading(false);
      if (thumbFileInputRef.current) thumbFileInputRef.current.value = "";
    }
  }

  async function onToggleInstagramGrid() {
    const next = !showInstagramGrid;
    setShowInstagramGrid(next);
    if (next && activeBrand && instagramGridTiles.length === 0) {
      setGridLoading(true);
      try {
        const res = await fetch(`/api/posts/instagram-grid?brandId=${activeBrand.id}`);
        const data = await res.json();
        setInstagramGridTiles(data.tiles ?? []);
      } finally {
        setGridLoading(false);
      }
    }
  }

  async function onRepurpose() {
    if (!activeBrand) return;
    setRepurposeOpen(true);
    setRepurposeLoading(true);
    setRepurposeResult(null);
    const res = await fetch("/api/ai/repurpose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, sourceTitle: title, sourceCaption: caption })
    });
    const data = await res.json();
    setRepurposeLoading(false);
    if (!res.ok) {
      if (upgrade.openFromResponse(res.status, data)) {
        setRepurposeOpen(false);
        return;
      }
      toast.error(data.error ?? "Erreur lors du recyclage de contenu.");
      setRepurposeOpen(false);
      return;
    }
    setRepurposeResult(data);
  }

  function applyRepurposed(network: Network, text: string) {
    if (!selectedNetworks.includes(network)) toggleNetwork(network);
    setOverrides((prev) => ({ ...prev, [network]: { open: true, title: prev[network]?.title ?? "", caption: text } }));
    toast.success(`Texte appliqué pour ${NETWORK_META[network].label}.`);
  }

  async function pickThumbnail(url: string) {
    if (!videoAsset) return;
    // « Générer cette miniature » (chat) repart ensuite de l'image de la vidéo
    // d'où vient la miniature choisie.
    const frame = conceptFrames.current.get(url);
    if (frame) lastCapturedFrame.current = frame;
    await fetch(`/api/media/${videoAsset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbnailUrl: url })
    });
    setAssets((prev) => prev.map((a) => (a.id === videoAsset.id ? { ...a, thumbnailUrl: url } : a)));
  }

  // TikTok sélectionné : confidentialité choisie, contenu commercial complet,
  // durée acceptée… sinon le bouton reste désactivé (raison affichée).
  const tiktokBlocked = selectedNetworks.includes("TIKTOK") && assets.length > 0 ? tiktokStatus.reason : null;
  // TikTok, puis format impossible (07/10/2026) : la raison s'affiche dans la barre.
  const publishBlocked = tiktokBlocked ?? formatBlocked;
  const canSubmit = assets.length > 0 && selectedNetworks.length > 0 && !!activeBrand && !publishBlocked;

  // Easter egg : 20 clics sur "Publier" alors qu'il est visuellement
  // désactivé (voir le bouton plus bas — désactivé par CSS/aria-disabled,
  // PAS par l'attribut natif "disabled", pour que le clic reste détectable).
  const disabledClicks = useRef(0);
  const disabledClicksResetTimer = useRef<number | null>(null);

  // Mode d'envoi retenu au clic (V2 : « Programmer » ou « Publier
  // maintenant », sans passer par un choix préalable).
  const [submittingMode, setSubmittingMode] = useState<ScheduleMode>("now");
  const onSubmit = useCallback(async (override?: { mode: ScheduleMode; scheduleDate?: string }) => {
    const submitMode = override?.mode ?? mode;
    const submitDate = override?.scheduleDate ?? scheduleDate;
    if (!canSubmit) {
      // TikTok : dire ce qui manque (confidentialité, contenu commercial…).
      if (publishBlocked) toast.error(publishBlocked);
      disabledClicks.current += 1;
      if (disabledClicksResetTimer.current) window.clearTimeout(disabledClicksResetTimer.current);
      if (disabledClicks.current >= 20) {
        disabledClicks.current = 0;
        reportEasterEggFound("composer-disabled-clicks");
      } else {
        disabledClicksResetTimer.current = window.setTimeout(() => {
          disabledClicks.current = 0;
        }, 15000);
      }
      return;
    }
    if (!activeBrand) return;
    setSubmittingMode(submitMode);
    setSubmitting(true);

    const targets = selectedNetworks
      .map((network) => {
        const connection =
          connections.find((c) => c.id === selectedConnectionByNetwork[network]) ||
          connections.find((c) => c.network === network);
        if (!connection) return null;
        const ov = overrides[network];
        return {
          connectionId: connection.id,
          network,
          titleOverride: ov?.open && ov.title ? ov.title : undefined,
          captionOverride: ov?.open && ov.caption ? ov.caption : undefined,
          // "Préréglages YouTube" (voir panneau plus bas) : uniquement pour la
          // cible YouTube, converti de la forme "formulaire" (chaînes) vers la
          // forme envoyée à l'API (tags en tableau, champs vides omis pour
          // laisser youtube.ts appliquer ses valeurs par défaut).
          // + option « Contenu généré par l'IA » (tous réseaux, voir
          // publish.ts → aiGenerated).
          // + lieu (Instagram, Facebook, YouTube — voir LocationPicker).
          // + Pinterest : tableau et lien de l'épingle.
          metadata:
            network === "YOUTUBE" ||
            network === "PINTEREST" ||
            network === "TIKTOK" ||
            FORMAT_NETWORKS.has(network) ||
            (network === "INSTAGRAM" && instagramOptions.collaborators.length > 0) ||
            (aiContentOverrides[network] ?? aiContentAll) ||
            (location && LOCATION_NETWORKS.has(network))
              ? {
                  // Format choisi (Publication, Reel, Story — 07/10/2026).
                  ...(FORMAT_NETWORKS.has(network) ? { format: formatFor(network) } : {}),
                  ...(network === "INSTAGRAM" && (instagramOptions.collaborators.length > 0 || (formatFor("INSTAGRAM") === "REEL" && !igShareToFeed))
                    ? {
                        instagram: {
                          ...(instagramOptions.collaborators.length > 0 ? { collaborators: instagramOptions.collaborators } : {}),
                          ...(formatFor("INSTAGRAM") === "REEL" ? { shareToFeed: igShareToFeed } : {})
                        }
                      }
                    : {}),
                  ...(network === "TIKTOK" ? { tiktok: tiktokOptions } : {}),
                  ...(network === "YOUTUBE" ? buildYoutubeMetadata(youtubeOptions) : {}),
                  ...(network === "PINTEREST"
                    ? {
                        pinterest: {
                          ...(pinterestOptions.boardId ? { boardId: pinterestOptions.boardId } : {}),
                          ...(pinterestOptions.link.trim() ? { link: pinterestOptions.link.trim() } : {})
                        }
                      }
                    : {}),
                  ...((aiContentOverrides[network] ?? aiContentAll) ? { aiGenerated: true } : {}),
                  ...(location && LOCATION_NETWORKS.has(network)
                    ? { location: { id: location.id, name: location.name, latitude: location.latitude, longitude: location.longitude } }
                    : {})
                }
              : undefined
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    // L'heure saisie est celle du fuseau de la marque, pas de l'appareil.
    const scheduledAt = submitMode === "date" && submitDate ? localInputToUtc(submitDate, timezone)?.toISOString() : undefined;
    // Horaire dépassé pendant que la page était ouverte : on bloque ici
    // (le serveur refuse aussi, voir src/lib/schedule-guard.ts).
    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) {
      setSubmitting(false);
      toast.error("Cet horaire est déjà passé : choisissez une date et une heure à venir.");
      return;
    }

    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: activeBrand.id,
        title,
        caption,
        firstComment: firstComment.trim() || undefined,
        scheduledAt,
        mediaAssetIds: assets.map((a) => a.id),
        targets,
        publishNow: submitMode === "now"
      })
    });
    const data = await res.json();

    if (!res.ok) {
      setSubmitting(false);
      // Quota de publications ou marque en lecture seule → modale de mise à
      // niveau (lot G2.b) plutôt qu'un message d'erreur.
      if (upgrade.openFromResponse(res.status, data)) return;
      toast.error(typeof data.error === "string" ? data.error : "Erreur lors de la création du post.");
      return;
    }
    // Succès : on laisse volontairement `submitting` à true jusqu'à ce que
    // router.push (plus bas) démonte cette page — sinon le voile d'envoi
    // (PublishOverlay) disparaîtrait et le formulaire redeviendrait cliquable
    // pendant la demi-seconde de chargement de la fiche de la publication.

    // Compteur « publications ce mois » à jour partout (cache partagé, lot 6).
    void refreshUsage();

    if (activeBrand) void saveComposerDraftNow(activeBrand.id, null);
    if (typeof data.milestone === "number") celebrateMilestone(data.milestone);
    // Easter egg "Son Décollage" : uniquement pour une publication IMMÉDIATE
    // qui a réellement réussi (status "PUBLISHED") — jamais pour un post
    // programmé (personne ne regarde l'écran quand il partira plus tard, même
    // rationnel que dans milestone-celebration.tsx) ni pour un échec partiel.
    if (submitMode === "now" && data.status === "PUBLISHED" && publishSoundEnabled && uiSoundsEnabled) {
      try {
        playLaunchWhoosh();
      } catch {
        // agrément sonore facultatif — jamais bloquant
      }
    } else if (data.firstPost) {
      // Première publication programmée ou publiée du compte : accord court (lot U5).
      playUiSound("first-post");
    }
    router.push(`/posts/${data.postId}`);
  }, [
    activeBrand,
    canSubmit,
    selectedNetworks,
    selectedConnectionByNetwork,
    connections,
    overrides,
    youtubeOptions,
    pinterestOptions,
    instagramOptions,
    tiktokOptions,
    // Format choisi (07/10/2026).
    formatFor,
    igShareToFeed,
    publishBlocked,
    aiContentAll,
    aiContentOverrides,
    location,
    mode,
    scheduleDate,
    timezone,
    title,
    caption,
    firstComment,
    assets,
    toast,
    celebrateMilestone,
    router,
    publishSoundEnabled,
    uiSoundsEnabled,
    playUiSound,
    upgrade
  ]);

  // Raccourci clavier Cmd/Ctrl+Entrée pour publier sans lâcher le clavier.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !submitting && canSubmit) {
        e.preventDefault();
        onSubmit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submitting, canSubmit, onSubmit]);

  // Aperçu en temps réel (carte "Aperçu", colonne de droite) : le réseau
  // choisi dans la barre de l'aperçu (les 4 réseaux y sont toujours
  // proposés, même non cochés), sinon le premier réseau sélectionné, sinon
  // Instagram. Utilise le texte personnalisé de ce réseau quand il est
  // ouvert, sinon le titre/légende commun.
  const effectivePreviewNetwork: Network = previewNetwork ?? selectedNetworks[0] ?? "TIKTOK";
  // Compte affiché dans l'aperçu : le compte connecté choisi pour ce réseau
  // (nom, @identifiant), avec la photo de la marque (sinon celle du compte).
  const previewAccountFor = (n: Network): PreviewAccount => {
    const conn = connections.find((c) => c.id === selectedConnectionByNetwork[n]) ?? connections.find((c) => c.network === n);
    const name = conn?.displayName || activeBrand?.name || "Votre marque";
    const handle =
      conn?.handle?.replace(/^@/, "") ||
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9._]+/g, "") ||
      "votremarque";
    return { name, handle, avatarUrl: activeBrand?.logoUrl ?? conn?.avatarUrl ?? null };
  };
  const previewOverride = effectivePreviewNetwork ? overrides[effectivePreviewNetwork] : undefined;
  // Aperçu mis à jour « en différé » (lot 5) : la frappe dans la légende
  // reste fluide, l'aperçu suit dès que le navigateur a le temps.
  const previewTitle = useDeferredValue(previewOverride?.open && previewOverride.title ? previewOverride.title : title);
  const previewCaption = useDeferredValue(previewOverride?.open && previewOverride.caption ? previewOverride.caption : caption);
  const previewAsset = assets[0];

  // --- Refonte V2 (07/10/2026) : présentation de la page ------------------
  // Boutons dans la barre du haut sur les écrans moyens (maquette E).
  const [headerActionsSlot, setHeaderActionsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderActionsSlot(document.getElementById(HEADER_ACTIONS_SLOT_ID));
  }, []);
  // Aperçu : collé à droite à partir de 1 360 px (sauf s'il est rangé),
  // flottant en dessous (bouton « Aperçu »).
  const [wideScreen, setWideScreen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1360px)");
    const apply = () => setWideScreen(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const [previewHidden, setPreviewHidden] = useState(false);
  useEffect(() => {
    try {
      setPreviewHidden(getPref(PREVIEW_HIDDEN_KEY) === "1");
    } catch {
      // stockage indisponible : aperçu affiché
    }
  }, []);
  const setPreviewHiddenPref = useCallback((hidden: boolean) => {
    setPreviewHidden(hidden);
    try {
      setPref(PREVIEW_HIDDEN_KEY, hidden ? "1" : "0");
    } catch {
      // sans gravité
    }
  }, []);
  const [floatingPreviewOpen, setFloatingPreviewOpen] = useState(false);

  // Brouillon : « Brouillon enregistré il y a 2 min » à côté du titre.
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!activeBrand || duplicateId) return;
    if (!draftReady && !(publicDraftId || studioId)) return;
    setDraftSavedAt(title.trim() || caption.trim() ? Date.now() : null);
  }, [activeBrand, duplicateId, publicDraftId, studioId, draftReady, title, caption]);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const draftStatus = draftSavedAt
    ? (() => {
        const minutes = Math.floor(Math.max(0, clock - draftSavedAt) / 60_000);
        return minutes < 1 ? "Brouillon enregistré" : `Brouillon enregistré il y a ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`}`;
      })()
    : null;

  // Meilleur créneau à venir (statistiques réelles, /api/analytics/insights).
  const [insightHours, setInsightHours] = useState<{ bestHour: number | null; perNetwork: { network: Network; bestHour: number | null; hasEnoughData: boolean }[] } | null>(null);
  useEffect(() => {
    if (!activeBrand) return;
    let alive = true;
    fetch(`/api/analytics/insights?brandId=${activeBrand.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setInsightHours({ bestHour: typeof d.bestHour === "number" ? d.bestHour : null, perNetwork: Array.isArray(d.perNetwork) ? d.perNetwork : [] });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [activeBrand]);
  const bestHour = useMemo(() => {
    if (!insightHours) return null;
    const forSelected = insightHours.perNetwork.find((n) => selectedNetworks.includes(n.network) && n.hasEnoughData && n.bestHour !== null);
    return forSelected?.bestHour ?? insightHours.bestHour;
  }, [insightHours, selectedNetworks]);
  const bestSlot = useMemo(() => (bestHour === null ? null : nextBestSlot(bestHour, timezone, new Date(clock))), [bestHour, timezone, clock]);

  // « Programmer » (09/10/2026, demande de Lucas) : ouvre le calendrier
  // (PublishActions), présélectionné sur la date déjà choisie (clic sur une
  // case du calendrier) ou sur le meilleur créneau ; son bouton
  // « Programmer » envoie à la date retenue. « Publier maintenant » : tout
  // de suite.
  const scheduledChosen = mode === "date" && Boolean(scheduleDate);
  const canSubmitBasics = assets.length > 0 && selectedNetworks.length > 0;
  const submitMissing = !assets.length ? "Ajoutez un média pour continuer." : selectedNetworks.length === 0 ? "Choisissez au moins un réseau." : publishBlocked;
  function onScheduleClick(date: string) {
    setScheduleDate(date);
    setMode("date");
    void onSubmit({ mode: "date", scheduleDate: date });
  }
  // Il manque quelque chose : même message (et même easter egg) qu'à l'envoi.
  function onScheduleBlocked() {
    void onSubmit({ mode: "date" });
  }
  const scheduleActionProps = {
    scheduleValue: scheduledChosen ? scheduleDate : null,
    timezone,
    bestSlot,
    onScheduleBlocked
  };
  function onPublishNowClick() {
    void onSubmit({ mode: "now" });
  }

  // Barre d'outils du texte : # et émoji vont dans le dernier champ utilisé.
  const lastField = useRef<"title" | "caption">("caption");
  // Titre et description qui grandissent avec le texte.
  useEffect(() => {
    const el = captionInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 84)}px`;
  }, [caption]);
  useEffect(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  // Menu « Rédiger avec l'IA ».
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const aiMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aiMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node)) setAiMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAiMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [aiMenuOpen]);
  function runAi(fn: () => unknown) {
    setAiMenuOpen(false);
    void fn();
  }

  // Options « + » sous les réseaux : fermées tant qu'on n'en a pas besoin.
  // TikTok et Pinterest s'ouvrent quand on choisit le réseau (réglages
  // obligatoires : confidentialité TikTok, tableau Pinterest).
  const [openAddons, setOpenAddons] = useState<string[]>([]);
  const addonOpen = (key: string) => openAddons.includes(key);
  function toggleAddon(key: string) {
    if (key === "first-comment") return setFirstCommentOpen((v) => !v);
    if (key === "youtube") return setYoutubeOptionsOpen((v) => !v);
    setOpenAddons((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
  const previousNetworks = useRef<Network[]>([]);
  useEffect(() => {
    const added = selectedNetworks.filter((n) => !previousNetworks.current.includes(n));
    previousNetworks.current = selectedNetworks;
    const auto = added.flatMap((n) => (n === "TIKTOK" ? ["tiktok"] : n === "PINTEREST" ? ["pinterest"] : []));
    if (auto.length) setOpenAddons((prev) => Array.from(new Set([...prev, ...auto])));
  }, [selectedNetworks]);
  // Un lieu ou des collaborateurs déjà choisis (duplication) : panneau ouvert.
  useEffect(() => {
    if (location) setOpenAddons((prev) => (prev.includes("location") ? prev : [...prev, "location"]));
  }, [location]);
  const addons: { key: string; label: string; open: boolean; filled: boolean }[] = [
    { key: "first-comment", label: "Premier commentaire", open: firstCommentOpen, filled: firstComment.trim() !== "" },
    ...(selectedNetworks.some((n) => LOCATION_NETWORKS.has(n)) ? [{ key: "location", label: "Lieu", open: addonOpen("location"), filled: Boolean(location) }] : []),
    ...(selectedNetworks.includes("INSTAGRAM") ? [{ key: "collaborators", label: "Collaborateurs", open: addonOpen("collaborators"), filled: instagramOptions.collaborators.length > 0 }] : []),
    ...(selectedNetworks.includes("TIKTOK") ? [{ key: "tiktok", label: "Options TikTok", open: addonOpen("tiktok"), filled: Boolean(tiktokOptions.privacyLevel) }] : []),
    ...(selectedNetworks.includes("YOUTUBE") ? [{ key: "youtube", label: "Options YouTube", open: youtubeOptionsOpen, filled: false }] : []),
    ...(selectedNetworks.includes("PINTEREST") ? [{ key: "pinterest", label: "Options Pinterest", open: addonOpen("pinterest"), filled: Boolean(pinterestOptions.boardId) }] : []),
    ...(selectedNetworks.length > 0 ? [{ key: "per-network", label: "Texte par réseau", open: addonOpen("per-network"), filled: selectedNetworks.some((n) => overrides[n]?.open) }] : [])
  ];

  /** « 0:48 · vertical 9:16 » sous le nom du média. */
  function mediaMetaLine(a: UploadedAsset, index: number): string {
    const kind = a.type === "VIDEO" ? "Vidéo" : "Image";
    if (index !== 0 || !mediaSize || mediaSize.assetId !== a.id) return kind;
    const shape = mediaSize.height > mediaSize.width ? "vertical 9:16" : mediaSize.width > mediaSize.height ? "horizontal 16:9" : "carré 1:1";
    return [a.type === "VIDEO" && mediaSize.duration ? formatDuration(mediaSize.duration) : kind, shape].join(" · ");
  }

  const previewProps = {
    network: effectivePreviewNetwork,
    accountFor: previewAccountFor,
    instagramCollaborators: instagramOptions.collaborators,
    // Format choisi (07/10/2026).
    formatFor: assets.length > 0 ? formatFor : undefined,
    selectedNetworks,
    onPickNetwork: setPreviewNetwork,
    asset: previewAsset,
    title: previewTitle,
    caption: previewCaption,
    aspectClass: previewAspectClass,
    onAspectClass: setPreviewAspectClass,
    showInstagramGrid,
    onToggleInstagramGrid,
    instagramGridTiles,
    gridLoading,
    ratioLabel: mediaSize ? (mediaSize.height > mediaSize.width ? "9:16" : mediaSize.width > mediaSize.height ? "16:9" : "1:1") : null,
    kindLabel: effectivePreviewNetwork === "YOUTUBE" && assets.length > 0 ? ({ SHORT: "Short (choisi par YouTube)", VIDEO: "Vidéo (choisie par YouTube)" } as const)[youtubeKind(mediaFacts) ?? "SHORT"] : null
  };
  const noConnections = connections.length === 0;
  const tightestLimit =
    selectedNetworks.length > 0
      ? Math.min(...selectedNetworks.map((n) => NETWORK_META[n].maxCaption))
      : null;

  return (
    // Refonte V2 (07/10/2026, maquettes de Lucas) : un document fluide sur
    // le fond de la page — MÉDIA, TEXTE, PUBLIER SUR, QUAND — séparés par des
    // traits fins, sans cartes ni numéros. L'aperçu reste à droite, collé en
    // haut pendant qu'on rédige (masquable) ; sur les écrans plus petits, il
    // flotte (bouton « Aperçu ») et les boutons montent dans la barre du haut.
    <div className="nb-composer">
      <PageHeader title="Publier" status={draftStatus} />

      {/* Boutons dans la barre du haut (écrans moyens, maquette E) */}
      {headerActionsSlot &&
        createPortal(
          <div className="hidden sm:block min-[1360px]:hidden">
            <PublishActions
              compact
              scheduled={scheduledChosen}
              canSubmit={canSubmit}
              submitting={submitting}
              blockedReason={publishBlocked}
              onSchedule={onScheduleClick}
              onPublishNow={onPublishNowClick}
              {...scheduleActionProps}
            />
          </div>,
          headerActionsSlot
        )}

      {repurposeUsed && (
        <RepurposePanel open={repurposeOpen} loading={repurposeLoading} result={repurposeResult} onClose={() => setRepurposeOpen(false)} onApply={applyRepurposed} />
      )}

      {activeBrand && aiStatus && !aiStatus.enabled && (
        <p className="mb-6 text-[13px] text-slate-500">
          {aiStatus.keyConfigured
            ? "L'assistant IA fait partie des paliers Pro/Agence."
            : "L'assistant IA n'est pas configuré sur cette instance (clé Gemini absente)."}{" "}
          {aiStatus.keyConfigured && (
            <Link href="/billing" className="text-aurora-300 underline">
              Voir les paliers
            </Link>
          )}
        </p>
      )}

      {noConnections && (
        <Link href="/accounts" className="mb-6 block rounded-xl border border-amber-500/30 bg-amber-500/[0.05] px-4 py-3 text-sm text-amber-200 transition hover:border-amber-400/50">
          Aucun réseau connecté. <span className="underline">Connectez un compte</span> pour pouvoir publier — vous pouvez tout de même préparer votre publication ci-dessous.
        </Link>
      )}

      <div className={clsx("grid grid-cols-1", !previewHidden && "min-[1360px]:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]")}>
        <div className={clsx("min-w-0", previewHidden ? "mx-auto w-full max-w-[780px]" : "min-[1360px]:pr-12")}>
          {/* ------------------------------------------------------ MÉDIA */}
          <section aria-labelledby="composer-media" className="pb-8">
            <h2 id="composer-media" className="nb-section-label">
              Média
            </h2>

            {assets.length > 0 && (
              <ul className="mt-4 space-y-4">
                {assets.map((a, i) => (
                  <li key={a.id} className="nb-media-row flex flex-wrap items-center gap-4 sm:flex-nowrap">
                    <div className="h-[84px] w-[64px] shrink-0 overflow-hidden rounded-lg bg-black">
                      {a.type === "VIDEO" ? (
                        <video src={a.previewUrl} poster={a.thumbnailUrl} preload="metadata" playsInline className="h-full w-full object-cover" muted />
                      ) : (
                        // Aperçu local (blob:) : next/image ne s'applique pas.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={a.previewUrl} alt={a.filename} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-white" title={a.filename}>
                        {a.filename}
                      </p>
                      <p className="mt-0.5 text-[13px] text-slate-500">{mediaMetaLine(a, i)}</p>
                      {/* Origine du média (03/10/2026) : « Image importée depuis Canva »… */}
                      <ImportSourceBadge source={a.importSource} type={a.type} variant="inline" className="mt-1" />
                    </div>
                    <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
                      {a.type === "VIDEO" && (
                        <button
                          type="button"
                          onClick={() => setEditingVideo(a)}
                          disabled={uploading}
                          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[14px] text-slate-300 transition hover:bg-[color:var(--nb-hover)] hover:text-white disabled:opacity-50"
                        >
                          <IcPencil className="h-4 w-4" /> Modifier la vidéo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={uploading}
                        className="whitespace-nowrap rounded-lg px-2.5 py-2 text-[14px] text-slate-300 transition hover:bg-[color:var(--nb-hover)] hover:text-white disabled:opacity-50"
                      >
                        Remplacer
                      </button>
                      <button
                        type="button"
                        onClick={() => void confirmRemoveAsset(a)}
                        disabled={uploading}
                        aria-label={`Supprimer ${a.filename}`}
                        title="Retirer ce média"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                      >
                        <IconClose className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Zone de dépôt : un rectangle discret en pointillés, les sources d'import à droite.
                Tout le cadre ouvre le choix du fichier (08/10/2026, demande de Lucas), sauf les
                boutons d'import (Canva, Google Drive…) qui gardent leur propre action ; le
                bouton du texte reste la cible du clavier. */}
            <div className="relative mt-4">
              <div
                onClick={(e) => {
                  if (uploading) return;
                  const target = e.target as HTMLElement;
                  // Clic venu d'une fenêtre d'import (rendue ailleurs dans la page) ou d'un autre bouton : rien.
                  if (!e.currentTarget.contains(target)) return;
                  if (target.closest("button, a, input, label, select, textarea, [role='menu'], [role='dialog']")) return;
                  inputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!dropActive) setDropActive(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropActive(false);
                  onFilesChosen(e.dataTransfer.files);
                }}
                data-testid="composer-dropzone"
                className={clsx(
                  "nb-dropzone flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-dashed px-4 py-3",
                  uploading ? "cursor-progress" : "cursor-pointer",
                  dropActive && "nb-dropzone-active"
                )}
              >
                <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="flex min-w-0 items-center gap-3 py-1.5 text-left text-[15px] text-slate-300">
                  <IconCloudUpload className="h-6 w-6 shrink-0 text-slate-400" />
                  <span>
                    {assets.length > 0 ? "Changer de média" : "Glissez une vidéo ou une image"}, ou <span className="font-semibold text-white underline underline-offset-2">parcourir</span>
                  </span>
                </button>
                <MediaImportBar
                  variant="inline"
                  brandId={activeBrand?.id}
                  disabled={uploading}
                  onImported={onMediaImported}
                  onError={(message) => {
                    setUploadError(message);
                    toast.error(message);
                  }}
                  onBusyChange={setUploading}
                />
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*,image/*"
                  className="hidden"
                  onChange={(e) => {
                    // Copie de la liste avant de vider le champ : choisir à nouveau
                    // le même fichier (après « Supprimer ») doit fonctionner.
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    e.target.value = "";
                    if (files.length) {
                      const dt = new DataTransfer();
                      files.forEach((f) => dt.items.add(f));
                      onFilesChosen(dt.files);
                    }
                  }}
                />
              </div>
              {/* Voile pendant l'envoi : le logo Nebula (anneaux en rotation
                  perpétuelle, nebula-brandmark.tsx) et l'avancement. */}
              {uploading && (
                <div aria-live="polite" className="absolute inset-0 flex items-center justify-center gap-3 rounded-xl bg-[color:var(--nb-page)]/90 backdrop-blur-sm">
                  <NebulaIcon size={32} />
                  <p className="text-sm font-medium text-white">Envoi en cours{uploadPercent !== null ? ` : ${uploadPercent} %` : "..."}</p>
                  {uploadPercent !== null && (
                    <div role="progressbar" aria-label="Avancement de l'envoi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadPercent} className="h-1.5 w-32 overflow-hidden rounded-full bg-[color:var(--nb-active)]">
                      <div className="h-full rounded-full bg-aurora-400 transition-[width] duration-200" style={{ width: `${uploadPercent}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="mt-2 text-[12px] text-slate-500">MP4, MOV, JPG, PNG — un fichier à la fois.</p>
            {!focusMode && uploading && <LoadingMiniGame active />}
            {uploadError && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3 text-sm text-red-300">
                <p className="font-medium">Échec de l&apos;envoi</p>
                <p className="mt-0.5 select-all text-xs text-red-300">{uploadError}</p>
              </div>
            )}

            {videoAsset && (
              <div ref={thumbSectionRef} className="mt-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[14px] font-medium text-white">Miniature{selectedNetworks.includes("YOUTUBE") ? " YouTube" : ""}</h3>
                  {/* Un seul bouton (07/10/2026) : l'ancien « Demander à
                      l'assistant », qui faisait remplir le sujet et le
                      public de la vidéo, est retiré. L'IA regarde la vidéo
                      elle-même ; on discute ensuite des propositions dans
                      le chat, où elles arrivent. */}
                  <Button
                    variant="outline"
                    className="px-3 py-2"
                    onClick={() => void onGenerateThumbnails({ viaChat: true })}
                    disabled={thumbLoading || aiThumbLoading}
                    data-testid="generate-thumbnails"
                    title={aiStatus?.enabled ? "L'IA regarde votre vidéo et crée 3 miniatures, expliquées dans le chat" : "3 images extraites de votre vidéo"}
                  >
                    {aiStatus?.enabled && <AiIcon className={clsx("h-4 w-4", thumbLoading && "animate-pulse")} active={thumbLoading} />}
                    {thumbLoading
                      ? thumbStep === "analyse"
                        ? "Analyse de la vidéo…"
                        : thumbStep === "creation"
                          ? "Création des miniatures…"
                          : aiStatus?.enabled
                            ? "Analyse…"
                            : "Extraction…"
                      : aiStatus?.enabled
                        ? "Générer 3 miniatures"
                        : "Générer des miniatures"}
                  </Button>
                  <input ref={thumbFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onThumbFileChosen(e.target.files?.[0] ?? null)} />
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                  {aiStatus?.enabled
                    ? "En un clic, l'IA regarde votre vidéo (image et son), crée 3 miniatures à partir de ses meilleurs moments et vous explique dans le chat pourquoi chacune fera cliquer. Chaque miniature créée compte dans votre quota de miniatures IA."
                    : "3 images extraites de votre vidéo : choisissez celle qui donne le plus envie de cliquer."}
                </p>
                {assistantBrief && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                    <AiIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 text-slate-300">
                      Brief de l&apos;assistant
                      {assistantBrief.hook && (
                        <>
                          {" "}: <span className="font-semibold text-white">« {assistantBrief.hook} »</span>
                        </>
                      )}
                    </span>
                    {/* Remplace l'ancien bouton « Générer avec l'IA (brief) ». */}
                    <button
                      type="button"
                      onClick={() => void onGenerateThumbnailWithAi()}
                      disabled={aiThumbLoading || thumbLoading}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-aurora-300 transition hover:bg-[color:var(--nb-hover)] disabled:cursor-wait disabled:opacity-60"
                    >
                      <AiIcon className={clsx("h-3 w-3", aiThumbLoading && "animate-pulse")} active={aiThumbLoading} />
                      {aiThumbLoading ? "Génération…" : "Générer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAssistantBrief(null);
                        clearPendingThumbnailBrief();
                      }}
                      aria-label="Retirer le brief de l'assistant"
                      title="Retirer le brief"
                      className="rounded px-1.5 py-0.5 text-slate-500 transition hover:bg-[color:var(--nb-hover)] hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {/* Miniatures proposées + case « Votre image » (cliquer ou déposer une image). */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {thumbOptions.map((url) => (
                    <button
                      key={url}
                      onClick={() => pickThumbnail(url)}
                      title={thumbReasons[url] || undefined}
                      aria-pressed={videoAsset.thumbnailUrl === url}
                      className={clsx("w-[112px] overflow-hidden rounded-lg ring-2 transition", videoAsset.thumbnailUrl === url ? "ring-white" : "ring-transparent hover:ring-[color:var(--nb-sep-strong)]")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img loading="lazy" decoding="async" src={url} alt="Miniature" className={clsx("aspect-video w-full", thumbAspect === "9:16" ? "bg-black object-contain" : "object-cover")} />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => thumbFileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
                      if (file) void onThumbFileChosen(file);
                    }}
                    disabled={thumbUploading}
                    title="Choisir ou déposer une image de votre ordinateur"
                    className="nb-dropzone flex aspect-video w-[112px] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed text-[12px] text-slate-400 transition hover:text-white disabled:cursor-wait disabled:opacity-60"
                  >
                    {thumbUploading ? "Envoi…" : "Votre image"}
                  </button>
                </div>
                {thumbOptions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const chosen = videoAsset.thumbnailUrl && thumbOptions.includes(videoAsset.thumbnailUrl) ? [videoAsset.thumbnailUrl] : [];
                      const urls = [...chosen, ...thumbOptions.filter((u) => !chosen.includes(u))].slice(0, 3);
                      setFeedbackPrefill({ kind: "THUMBNAIL", imageUrls: urls, network: selectedNetworks.includes("YOUTUBE") ? "YOUTUBE" : selectedNetworks.length === 1 ? selectedNetworks[0] : null });
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-slate-400 transition hover:text-white"
                  >
                    <IconUsers className="h-3.5 w-3.5" />
                    Hésitation ? Demander l&apos;avis de la communauté
                  </button>
                )}
                {videoAsset.thumbnailUrl && selectedNetworks.includes("YOUTUBE") && (
                  <p className="mt-2 text-[12px] text-slate-500">La miniature choisie est envoyée à YouTube avec la vidéo (JPEG ou PNG de 2 Mo au plus ; chaîne vérifiée par téléphone requise par YouTube).</p>
                )}
              </div>
            )}

            {/* Étiquette IA : interrupteur général, en haut de page pour qu'on
                y pense avant les réseaux ; une exception possible par réseau. */}
            <AiContentMaster
              checked={aiContentAll}
              onChange={setAiContentEverywhere}
              exceptions={selectedNetworks.filter((n) => aiContentFor(n) !== aiContentAll)}
              networks={selectedNetworks}
              valueFor={aiContentFor}
              onNetworkChange={(n, next) => setAiContentOverrides((prev) => ({ ...prev, [n]: next }))}
            />
          </section>

          {/* ------------------------------------------------------ TEXTE */}
          <section aria-labelledby="composer-text" className="border-t border-[color:var(--nb-sep)] py-8">
            <h2 id="composer-text" className="nb-section-label">
              Texte
            </h2>
            {/* Titre sur une seule ligne logique, qui passe à la ligne à
                l'écran au lieu de défiler (Entrée → description). */}
            <textarea
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/[\r\n]+/g, " "))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  captionInputRef.current?.focus();
                }
              }}
              onFocus={() => (lastField.current = "title")}
              rows={1}
              placeholder="Titre de votre publication…"
              aria-label="Titre de la publication (utilisé notamment comme titre YouTube)"
              title="Utilisé notamment comme titre YouTube"
              className="nb-composer-title mt-3 w-full resize-none overflow-hidden bg-transparent font-display text-[24px] font-semibold leading-tight text-white outline-none sm:text-[32px]"
            />
            <textarea
              ref={captionInputRef}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onFocus={() => (lastField.current = "caption")}
              rows={3}
              placeholder="Décrivez votre publication… Tapez # pour un hashtag."
              aria-label="Description commune à tous les réseaux choisis"
              className="nb-composer-caption mt-3 w-full resize-none overflow-hidden bg-transparent text-[16px] leading-relaxed text-slate-200 outline-none"
            />
            {campaignLinkUsed && (
              <CampaignLinkBuilder
                open={campaignLinkOpen}
                onClose={() => setCampaignLinkOpen(false)}
                brandId={activeBrand?.id}
                defaultSource={selectedNetworks.length === 1 ? selectedNetworks[0].toLowerCase() : undefined}
                defaultMedium="social"
                tip={
                  selectedNetworks.includes("INSTAGRAM")
                    ? "Instagram ne rend pas les liens cliquables dans les légendes : placez ce lien dans votre Page bio, ou en premier commentaire sur Facebook."
                    : undefined
                }
                actions={[
                  {
                    label: "Ajouter en premier commentaire",
                    onApply: (url) => {
                      setFirstComment((prev) => (prev.trim() ? `${prev.trimEnd()} ${url}` : url));
                      setFirstCommentOpen(true);
                      toast.success("Lien ajouté au premier commentaire.");
                    }
                  },
                  {
                    label: "Insérer dans la description",
                    primary: true,
                    onApply: (url) => {
                      setCaption((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${url}` : url));
                      toast.success("Lien ajouté à la fin de la description.");
                    }
                  }
                ]}
              />
            )}

            {/* Barre d'outils du bloc de rédaction */}
            <div className="mt-4 flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => insertIntoField(lastField.current, "#")} title="Insérer un hashtag" aria-label="Insérer un hashtag" className={TOOL_BUTTON}>
                <IconHash className="h-[18px] w-[18px]" />
              </button>
              <button type="button" onClick={(e) => toggleEmojiPicker(lastField.current, e)} title="Insérer un émoji" aria-label="Insérer un émoji" className={TOOL_BUTTON}>
                <IconEmoji className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setCampaignLinkOpen(true)}
                title="Lien de campagne (UTM) : suivez les visites et les ventes venues de cette publication"
                aria-label="Ajouter un lien suivi"
                className={TOOL_BUTTON}
              >
                <IconLink className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => setFeedbackPrefill({ kind: "TITLE", titles: title.trim() ? [title.trim()] : [], network: selectedNetworks.length === 1 ? selectedNetworks[0] : null })}
                title="Demander l'avis de la communauté sur plusieurs versions du titre"
                aria-label="Demander l'avis de la communauté sur le titre"
                className={TOOL_BUTTON}
              >
                <IconMessage className="h-[18px] w-[18px]" />
              </button>
              {aiStatus?.enabled && (
                <div className="relative" ref={aiMenuRef}>
                  <button
                    type="button"
                    onClick={() => setAiMenuOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={aiMenuOpen}
                    className={clsx(
                      "ml-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] transition active:scale-[0.97]",
                      aiMenuOpen ? "nb-menu-item-current" : "text-slate-300 hover:bg-[color:var(--nb-hover)] hover:text-white"
                    )}
                  >
                    <AiIcon className="h-4 w-4" active={analyzingMedia || generatingAll || generatingFields.size > 0 || repurposeLoading} />
                    {analyzingMedia ? "Analyse de la vidéo…" : generatingAll || generatingFields.size > 0 ? "Rédaction…" : "Rédiger avec l'IA"}
                  </button>
                  {aiMenuOpen && (
                    <div role="menu" className="nb-popover absolute left-0 top-[calc(100%+6px)] z-30 w-72 rounded-xl p-1.5">
                      {/* Sans média (09/10/2026) : l'IA a besoin de l'image ou de la vidéo pour écrire. */}
                      {assets.length === 0 && (
                        <p role="note" className="mb-1 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[13px] leading-snug text-slate-300" data-testid="ai-needs-media">
                          {AI_NEEDS_MEDIA}
                        </p>
                      )}
                      <button type="button" role="menuitem" onClick={() => runAi(onGenerateAll)} disabled={generatingAll || assets.length === 0} className={AI_MENU_ITEM}>
                        <AiIcon className="h-4 w-4" active={generatingAll} /> {generatingAll ? "Génération..." : "Titre et description"}
                      </button>
                      <button type="button" role="menuitem" onClick={() => runAi(() => onGenerateOne("title"))} disabled={generatingFields.has("title") || assets.length === 0} className={AI_MENU_ITEM}>
                        <AiIcon className={clsx("h-4 w-4", generatingFields.has("title") && "animate-pulse")} active={generatingFields.has("title")} />
                        {generatingFields.has("title") ? "Génération..." : "Le titre seulement"}
                      </button>
                      <button type="button" role="menuitem" onClick={() => runAi(() => onGenerateOne("description"))} disabled={generatingFields.has("description") || assets.length === 0} className={AI_MENU_ITEM}>
                        <AiIcon className={clsx("h-4 w-4", generatingFields.has("description") && "animate-pulse")} active={generatingFields.has("description")} />
                        {generatingFields.has("description") ? "Génération..." : "La description seulement"}
                      </button>
                      {(title.trim() || caption.trim()) && (
                        <button type="button" role="menuitem" onClick={() => runAi(onRepurpose)} className={AI_MENU_ITEM}>
                          <AiIcon className="h-4 w-4" active={repurposeOpen || repurposeLoading} /> Recycler ce contenu
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <span className={clsx("ml-auto text-[13px] tabular-nums", tightestLimit && caption.length > tightestLimit ? "text-red-400" : "text-slate-500")} title={tightestLimit ? "Limite la plus stricte des réseaux choisis" : undefined}>
                {caption.length.toLocaleString("fr-FR")}
                {tightestLimit ? ` / ${tightestLimit.toLocaleString("fr-FR")}` : ` caractère${caption.length !== 1 ? "s" : ""}`}
              </span>
            </div>
            {captionHashtags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                {captionHashtags.map((tag) => {
                  const count = hashtagCounts[tag];
                  return (
                    <span key={tag} className="text-[12px] text-slate-500">
                      #{tag} <span className="text-slate-400">{count === undefined ? "…" : count === 0 ? "jamais utilisé" : `utilisé ${count}×`}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </section>

          {/* ------------------------------------------------ PUBLIER SUR */}
          <section aria-labelledby="composer-networks" className="border-t border-[color:var(--nb-sep)] py-8">
            <h2 id="composer-networks" className="nb-section-label">
              Publier sur
            </h2>
            <div className="mt-4 space-y-3">
              <NetworkPauseNotice networks={selectedNetworks} />
              <div className="flex flex-wrap gap-2.5">
                {NETWORKS.filter((n) => offeredNetworks.includes(n) || availableNetworks.includes(n)).map((n) => {
                  const connected = availableNetworks.includes(n);
                  if (!connected) {
                    return (
                      <a key={n} href={activeBrand ? `/api/connections/${n.toLowerCase()}/start?brandId=${activeBrand.id}` : "/accounts"} title={`Connecter ${NETWORK_META[n].label}`} className="rounded-full">
                        <NetworkPill network={n} state="connect" />
                      </a>
                    );
                  }
                  const selected = selectedNetworks.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleNetwork(n)}
                      aria-pressed={selected}
                      aria-label={`${NETWORK_META[n].label}${selected ? " (choisi)" : ""}`}
                      className="rounded-full"
                    >
                      <NetworkPill network={n} state={selected ? "selected" : "idle"} label={n === "YOUTUBE" && selected && youtubeKind(mediaFacts) === "SHORT" ? "YouTube Shorts" : undefined} />
                    </button>
                  );
                })}
              </div>
              {noConnections && <p className="text-sm text-slate-500">Connectez au moins un réseau pour choisir une cible.</p>}

              {/* Bluesky (25/09/2026) : 300 caractères et pas encore de vidéo —
                  prévenir ici plutôt qu'à l'échec de la publication. */}
              {selectedNetworks.includes("BLUESKY") &&
                (() => {
                  const ov = overrides.BLUESKY;
                  const blueskyText = ov?.open && ov.caption ? ov.caption : caption;
                  const tooLong = blueskyText.trim().length > NETWORK_META.BLUESKY.maxCaption;
                  const hasVideo = assets.some((a) => a.type === "VIDEO");
                  if (!tooLong && !hasVideo) return null;
                  return (
                    <p className="text-[13px] text-amber-300">
                      {hasVideo
                        ? "Bluesky : la vidéo n'est pas encore prise en charge dans Nebula. Retirez Bluesky des cibles ou publiez une image."
                        : `Bluesky : ${blueskyText.trim().length} caractères, 300 maximum. Utilisez « Texte par réseau » ci-dessous pour écrire une version plus courte.`}
                    </p>
                  );
                })()}
            </div>

            {/* Format par réseau (Publication, Reel, Story ; Short ou vidéo pour YouTube) */}
            {assets.length > 0 && selectedNetworks.some((n) => FORMAT_NETWORKS.has(n) || n === "YOUTUBE") && (
              <div className="mt-6 space-y-3">
                {selectedNetworks
                  .filter((n) => FORMAT_NETWORKS.has(n) || n === "YOUTUBE")
                  .map((n) => (
                    <FormatPicker
                      key={n}
                      network={n}
                      facts={mediaFacts}
                      value={formatFor(n)}
                      onChange={(f) => setFormats((prev) => ({ ...prev, [n]: f }))}
                      shareToFeed={igShareToFeed}
                      onShareToFeedChange={setIgShareToFeed}
                    />
                  ))}
              </div>
            )}

            {/* Compte utilisé, quand un réseau en a plusieurs */}
            {selectedNetworks.some((n) => connections.filter((c) => c.network === n).length > 1) && (
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
                {selectedNetworks.map((n) => {
                  const networkConnections = connections.filter((c) => c.network === n);
                  if (networkConnections.length < 2) return null;
                  return (
                    <label key={n} className="flex items-center gap-2 text-[13px] text-slate-400">
                      Compte {NETWORK_META[n].label} :
                      <select
                        value={selectedConnectionByNetwork[n] ?? networkConnections[0].id}
                        onChange={(e) => setNetworkConnection(n, e.target.value)}
                        className="rounded-lg border border-[color:var(--nb-sep-strong)] bg-transparent px-2 py-1 text-[13px] text-white outline-none focus:border-aurora-400/60"
                      >
                        {networkConnections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Options en plus (« + ») : rien d'ouvert tant qu'on n'en a pas besoin */}
            {!noConnections && (
              <div className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-1" data-testid="composer-addons">
                {addons.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => toggleAddon(a.key)}
                    aria-expanded={a.open}
                    className={clsx("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] transition hover:bg-[color:var(--nb-hover)]", a.open ? "font-medium text-white" : "text-slate-400 hover:text-white")}
                  >
                    {a.open ? <span aria-hidden="true" className="w-4 text-center">−</span> : <IconPlusSmall className="h-4 w-4" />}
                    {a.label}
                    {a.filled && !a.open && <span className="h-1.5 w-1.5 rounded-full bg-aurora-400" aria-label="(rempli)" />}
                  </button>
                ))}
              </div>
            )}

            {firstCommentOpen && (
              <div className="nb-addon mt-5 border-t border-[color:var(--nb-sep)] pt-5">
                <h3 className="text-[14px] font-medium text-white">Premier commentaire</h3>
                <p className="mt-1 text-[13px] text-slate-500">
                  Publié automatiquement juste après la publication, en commentaire sous le post, sur chaque réseau qui le permet. Son sort, réseau par réseau, est indiqué sur la fiche de la publication.
                </p>
                <textarea
                  value={firstComment}
                  onChange={(e) => setFirstComment(e.target.value)}
                  rows={2}
                  placeholder="Ex : Lien en bio 👇"
                  className="mt-3 w-full resize-none rounded-lg border border-[color:var(--nb-sep-strong)] bg-transparent px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
                />
                {/* Où il sera publié (07/10/2026) : avant, TikTok, Pinterest et
                    YouTube l'ignoraient sans rien dire. */}
                {selectedNetworks.length > 0 ? (
                  <ul className="mt-2 space-y-1" data-testid="first-comment-networks">
                    {selectedNetworks.map((network) => {
                      const support = firstCommentSupportFor(network);
                      const tooLong = support.mode === "api" && firstComment.trim() !== "" && firstCommentLength(firstComment) > support.maxLength;
                      const ok = support.mode === "api" && !tooLong;
                      return (
                        <li key={network} className="flex items-start gap-2 text-xs">
                          <NetworkLogo network={network} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className={ok ? "text-slate-300" : "text-amber-300"}>
                            <span className="font-medium">{NETWORK_META[network].label}</span>
                            {" : "}
                            {support.mode === "unsupported"
                              ? support.reason
                              : tooLong
                                ? `trop long, ${support.maxLength} caractères au plus (${firstCommentLength(firstComment)} actuellement).`
                                : network === "YOUTUBE"
                                  ? "publié sous la vidéo. YouTube ne permet pas aux applications de l'épingler : épinglez-le depuis YouTube si vous le souhaitez."
                                  : "publié en commentaire."}
                            {support.mode === "unsupported" && support.reconnect && (
                              <>
                                {" "}
                                <Link href="/accounts" className="underline hover:text-white">
                                  Comptes connectés
                                </Link>
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Possible sur Instagram, Facebook, Threads, LinkedIn, Bluesky et YouTube (avec l&apos;autorisation de commenter). Pas sur TikTok ni Pinterest : leurs API ne permettent pas de commenter.
                  </p>
                )}
              </div>
            )}

            {addonOpen("location") && selectedNetworks.length > 0 && (
              <div className="nb-addon nb-addon-body mt-5 border-t border-[color:var(--nb-sep)] pt-5">
                <LocationPicker brandId={activeBrand?.id} value={location} onChange={setLocation} networks={selectedNetworks} mediaType={assets[0]?.type ?? null} />
              </div>
            )}

            {addonOpen("collaborators") && selectedNetworks.includes("INSTAGRAM") && (
              <div className="nb-addon nb-addon-body mt-5 border-t border-[color:var(--nb-sep)] pt-5">
                <InstagramOptions value={instagramOptions} onChange={setInstagramOptions} />
              </div>
            )}

            {addonOpen("tiktok") && selectedNetworks.includes("TIKTOK") && (
              <div className="nb-addon mt-5 border-t border-[color:var(--nb-sep)] pt-5">
                <h3 className="text-[14px] font-medium text-white">Options TikTok</h3>
                <div className="nb-addon-body mt-3">
                  <TiktokOptions
                    connectionId={selectedConnectionByNetwork.TIKTOK || connections.find((c) => c.network === "TIKTOK")?.id}
                    value={tiktokOptions}
                    onChange={setTiktokOptions}
                    video={assets[0] ? { url: assets[0].previewUrl, type: assets[0].type } : null}
                    onStatus={setTiktokStatus}
                    onPreview={() => setPreviewNetwork("TIKTOK")}
                  />
                </div>
              </div>
            )}

            {addonOpen("pinterest") && selectedNetworks.includes("PINTEREST") && (
              <div className="nb-addon mt-5 border-t border-[color:var(--nb-sep)] pt-5">
                <h3 className="text-[14px] font-medium text-white">Options Pinterest</h3>
                <div className="nb-addon-body mt-3">
                  <PinterestOptions connectionId={selectedConnectionByNetwork.PINTEREST || connections.find((c) => c.network === "PINTEREST")?.id} value={pinterestOptions} onChange={setPinterestOptions} />
                </div>
              </div>
            )}

            {youtubeOptionsOpen && selectedNetworks.includes("YOUTUBE") && (
              <div className="nb-addon mt-5 border-t border-[color:var(--nb-sep)] pt-5">
                <h3 className="text-[14px] font-medium text-white">Options YouTube</h3>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[13px] text-slate-300">
                    <IconBell className="h-4 w-4 text-slate-400" />
                    Notifier les abonnés
                    <InfoTip label="À quoi sert « Notifier les abonnés » ?">{NOTIFY_SUBSCRIBERS_HELP}</InfoTip>
                  </span>
                  <Toggle size="sm" checked={youtubeOptions.notifySubscribers} onChange={(next) => setYoutubeOptions((o) => ({ ...o, notifySubscribers: next }))} aria-label="Notifier les abonnés YouTube" />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select label="Configuration de l'audience" value={youtubeOptions.madeForKids ? "kids" : "not-kids"} onChange={(e) => setYoutubeOptions((o) => ({ ...o, madeForKids: e.target.value === "kids" }))}>
                    <option value="not-kids">Non, cette vidéo n&apos;est pas destinée aux enfants</option>
                    <option value="kids">Oui, cette vidéo est destinée aux enfants</option>
                  </Select>
                  <Select
                    label="Confidentialité"
                    hint={YOUTUBE_UPLOADS_LOCKED_PRIVATE && youtubeOptions.privacyStatus !== "private" ? YOUTUBE_PRIVATE_LOCK_NOTE : undefined}
                    value={youtubeOptions.privacyStatus}
                    onChange={(e) => setYoutubeOptions((o) => ({ ...o, privacyStatus: e.target.value as YoutubeComposerOptions["privacyStatus"] }))}
                  >
                    <option value="public">Publique</option>
                    <option value="unlisted">Non répertoriée</option>
                    <option value="private">Privée</option>
                  </Select>
                  <Select label="Catégorie" value={youtubeOptions.categoryId} onChange={(e) => setYoutubeOptions((o) => ({ ...o, categoryId: e.target.value }))}>
                    <option value="">Non précisée</option>
                    {YOUTUBE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                  <Input label="Tags (séparés par des virgules)" value={youtubeOptions.tags} onChange={(e) => setYoutubeOptions((o) => ({ ...o, tags: e.target.value }))} placeholder="ex : vlog, tutoriel, gaming" />
                  <Input
                    label="Ajouter à la playlist (optionnel)"
                    wrapperClassName="sm:col-span-2"
                    value={youtubeOptions.playlistId}
                    onChange={(e) => setYoutubeOptions((o) => ({ ...o, playlistId: e.target.value }))}
                    placeholder="Identifiant de la playlist YouTube"
                  />
                </div>
              </div>
            )}

            {addonOpen("per-network") && selectedNetworks.length > 0 && (
              <div className="nb-addon mt-5 border-t border-[color:var(--nb-sep)] pt-5">
                <h3 className="text-[14px] font-medium text-white">Texte par réseau</h3>
                <p className="mt-1 text-[13px] text-slate-500">Un titre ou un texte différent sur un réseau ; laissé vide, le texte commun est utilisé.</p>
                <div className="mt-3 divide-y divide-[color:var(--nb-sep)]">
                  {selectedNetworks.map((n) => (
                    <div key={n} className="py-3">
                      <button type="button" onClick={() => toggleOverride(n)} aria-expanded={Boolean(overrides[n]?.open)} className="flex w-full items-center justify-between text-left text-[14px] text-slate-300">
                        <span className="flex items-center gap-2">
                          <NetworkTile network={n} size={18} />
                          Personnaliser pour {NETWORK_META[n].label}
                        </span>
                        <span className="text-[13px] text-slate-500">{overrides[n]?.open ? "Réduire" : "Adapter le texte"}</span>
                      </button>
                      {overrides[n]?.open && (
                        <div className="mt-3 space-y-2">
                          <input
                            value={overrides[n]?.title ?? ""}
                            onChange={(e) => setOverrideField(n, "title", e.target.value)}
                            placeholder={`Titre spécifique à ${NETWORK_META[n].label} (optionnel)`}
                            className="w-full rounded-lg border border-[color:var(--nb-sep-strong)] bg-transparent px-3 py-2 text-[13px] text-white outline-none focus:border-aurora-400/60"
                          />
                          <textarea
                            value={overrides[n]?.caption ?? ""}
                            onChange={(e) => setOverrideField(n, "caption", e.target.value)}
                            rows={2}
                            placeholder={`Texte spécifique à ${NETWORK_META[n].label} (optionnel, max ${NETWORK_META[n].maxCaption} caractères)`}
                            className="w-full resize-none rounded-lg border border-[color:var(--nb-sep-strong)] bg-transparent px-3 py-2 text-[13px] text-white outline-none focus:border-aurora-400/60"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ------------------------------------------------------ QUAND */}
          <WhenSection
            mode={mode}
            scheduleDate={scheduleDate}
            timezone={timezone}
            bestSlot={bestSlot}
            shortcutLabel={shortcutLabel}
            missing={submitMissing}
            missingTone={publishBlocked && assets.length > 0 && selectedNetworks.length > 0 ? "warning" : "neutral"}
            footnote={selectedNetworks.includes("TIKTOK") ? <TiktokConsent options={tiktokOptions} className="mt-3" /> : null}
            actions={
              <PublishActions
                scheduled={scheduledChosen}
                canSubmit={canSubmit}
                submitting={submitting}
                blockedReason={publishBlocked}
                onSchedule={onScheduleClick}
                onPublishNow={onPublishNowClick}
                {...scheduleActionProps}
              />
            }
          />

          <div className="mt-10">
            <ComposerTips />
          </div>
          {/* Place pour la barre d'action collée en bas (téléphone). */}
          <div className="h-24 sm:hidden" aria-hidden="true" />
        </div>

        {/* Aperçu collé à droite (grands écrans), masquable. */}
        {!previewHidden && (
          <aside className="hidden border-l border-[color:var(--nb-sep)] pl-10 min-[1360px]:block" aria-label="Aperçu">
            {/* Sans conteneur défilant : il coupait l'ombre du téléphone en
                rectangle gris. Le cadre tient déjà dans la hauteur (ScaledFrame). */}
            <div className="sticky top-[calc(var(--nb-topbar-offset)_+_24px)] pb-4">
              {wideScreen && (
                <ComposerPreview
                  {...previewProps}
                  sticky
                  onHide={() => {
                    setPreviewHiddenPref(true);
                    setFloatingPreviewOpen(false);
                  }}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Aperçu flottant (petits écrans, ou aperçu rangé) : maquette E. */}
      {(!wideScreen || previewHidden) && (
        <>
          {floatingPreviewOpen && (
            <div className="fixed inset-x-3 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] top-20 z-40 overflow-y-auto sm:inset-x-auto sm:bottom-24 sm:right-6 sm:top-auto sm:max-h-[calc(100vh-140px)] sm:w-[340px]">
              <ComposerPreview {...previewProps} variant="floating" onHide={() => setFloatingPreviewOpen(false)} />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (wideScreen && previewHidden) {
                setPreviewHiddenPref(false);
                return;
              }
              setFloatingPreviewOpen((v) => !v);
            }}
            aria-expanded={floatingPreviewOpen}
            className="nb-preview-fab fixed bottom-[calc(8.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-[14px] font-semibold shadow-lg sm:bottom-6 sm:right-6"
          >
            <IconPhone className="h-[18px] w-[18px]" />
            {wideScreen && previewHidden ? "Afficher l'aperçu" : "Aperçu"}
          </button>
        </>
      )}

      {/* Téléphone : barre d'action collée en bas, au-dessus des onglets. */}
      <div className="nb-tabbar fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 border-t border-[color:var(--nb-sep)] px-4 py-2.5 sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className={clsx("min-w-0 truncate text-[12px]", publishBlocked && canSubmitBasics ? "text-amber-300" : "text-slate-500")}>{submitMissing ?? (scheduledChosen ? formatSlotLabel(scheduleDate) : "Prêt à publier")}</p>
          <PublishActions
            compact
            scheduled={scheduledChosen}
            canSubmit={canSubmit}
            submitting={submitting}
            blockedReason={publishBlocked}
            onSchedule={onScheduleClick}
            onPublishNow={onPublishNowClick}
            {...scheduleActionProps}
          />
        </div>
      </div>

      <FeedbackRequestDialog
        open={feedbackPrefill !== null}
        prefill={feedbackPrefill ?? undefined}
        onClose={() => setFeedbackPrefill(null)}
        onCreated={() => {
          setFeedbackPrefill(null);
          toast.success("Demande d'avis publiée dans la Communauté (onglet Avis) : le résultat arrive dans vos notifications d'ici 72 h.");
        }}
      />

      {/* Voile plein écran pendant l'envoi : toute la page grisée/floutée et
          inutilisable tant que « Envoi... » tourne — voir publish-overlay.tsx. */}
      {submitting && <PublishOverlay active networks={selectedNetworks} mode={submittingMode} mediaType={assets[0]?.type} />}
      {editingVideo && (
        <VideoEditor source={editingVideo.previewUrl} fileName={editingVideo.filename} logoUrl={activeBrand?.logoUrl ?? null} onClose={() => setEditingVideo(null)} onSave={saveEditedVideo} />
      )}

      {emojiPickerFor && emojiAnchor && typeof document !== "undefined"
        ? createPortal(<EmojiPicker anchor={emojiAnchor} panelRef={emojiPopoverRef} onPick={(e) => insertIntoField(emojiPickerFor, e)} />, document.body)
        : null}
    </div>
  );
}

const TOOL_BUTTON = "flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[color:var(--nb-hover)] hover:text-white";
const AI_MENU_ITEM = "nb-menu-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] text-slate-200 disabled:cursor-not-allowed disabled:opacity-50";
/** « Rédiger avec l'IA » sans image ni vidéo (09/10/2026, demande de Lucas). */
const AI_NEEDS_MEDIA = "Importez d'abord une image ou une vidéo : l'IA l'analyse pour trouver le titre et la description.";
/** Analyse refusée (quota, palier) : la fenêtre de mise à niveau est ouverte, rien n'est écrit. */
const AI_BLOCKED = Symbol("ai-blocked");

// Interrupteur général « Contenu généré par l'IA » (section Média), avec une
// exception possible par réseau (« Par réseau »).
function AiContentMaster({
  checked,
  onChange,
  exceptions,
  networks,
  valueFor,
  onNetworkChange
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  exceptions: Network[];
  networks: Network[];
  valueFor: (n: Network) => boolean;
  onNetworkChange: (n: Network, next: boolean) => void;
}) {
  const [perNetwork, setPerNetwork] = useState(false);
  return (
    <div className="mt-7">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[14px] text-white">
            <AiIcon className="h-4 w-4 shrink-0" />
            Contenu généré par l&apos;IA
            <InfoTip label="À quoi sert « Contenu généré par l'IA » ?">
              À activer si ce média contient des images, des voix ou des scènes réalistes créées ou modifiées par l&apos;IA. Un seul clic l&apos;active sur tous vos réseaux : YouTube et TikTok affichent leur propre étiquette IA, et pour Instagram et Facebook (qui ne le permettent pas depuis une application) Nebula ajoute une courte mention à la fin de la légende. Pas besoin de l&apos;activer si l&apos;IA a seulement aidé à écrire le texte. Une exception est possible réseau par réseau (« Par réseau »).
            </InfoTip>
          </p>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {checked ? "Activé sur tous les réseaux choisis" : "S'applique d'un coup à tous les réseaux choisis"}
            {exceptions.length > 0 && <span className="text-amber-300/90"> · sauf {exceptions.map((n) => NETWORK_META[n].label).join(", ")}</span>}
            {networks.length > 0 && (
              <>
                {" · "}
                <button type="button" onClick={() => setPerNetwork((v) => !v)} aria-expanded={perNetwork} className="underline-offset-2 hover:text-white hover:underline">
                  Par réseau
                </button>
              </>
            )}
          </p>
        </div>
        <Toggle checked={checked} onChange={onChange} aria-label="Contenu généré par l'IA, sur tous les réseaux" />
      </div>
      {perNetwork && networks.length > 0 && (
        <ul className="mt-3 space-y-2 border-l border-[color:var(--nb-sep)] pl-4">
          {networks.map((n) => (
            <li key={n} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] text-slate-300">
                <NetworkTile network={n} size={16} />
                {NETWORK_META[n].label}
                <InfoTip label={`À quoi sert « Contenu généré par l'IA » sur ${NETWORK_META[n].label} ?`}>{AI_CONTENT_HELP[n]}</InfoTip>
              </span>
              <Toggle size="sm" checked={valueFor(n)} onChange={(next) => onNetworkChange(n, next)} aria-label={`Contenu généré par l'IA sur ${NETWORK_META[n].label}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Vrai dès que `value` a été vrai une fois (monter un panneau à sa première ouverture). */
function useStickyTrue(value: boolean): boolean {
  const [seen, setSeen] = useState(value);
  useEffect(() => {
    if (value) setSeen(true);
  }, [value]);
  return seen || value;
}
