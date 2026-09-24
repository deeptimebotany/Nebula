"use client";

import { useAvailableNetworks } from "@/lib/use-available-networks";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { LoadingMiniGame } from "@/components/mini-game/loading-mini-game";
import { useFocusMode } from "@/components/bootstrap-provider";
import { RepurposePanel } from "@/components/composer/repurpose-panel";
import { ComposerPreview, type PreviewAccount } from "@/components/composer/composer-preview";
import { PublishCard, ComposerActionBar } from "@/components/composer/publish-card";
import { ComposerTips } from "@/components/composer/composer-tips";
import { PublishOverlay } from "@/components/composer/publish-overlay";
import type { UploadedAsset, ConnectionRow, NetworkOverride, ScheduleMode, YoutubeComposerOptions } from "@/components/composer/composer-types";
import { DEFAULT_YOUTUBE_OPTIONS, YOUTUBE_CATEGORIES } from "@/components/composer/composer-types";
import { InfoTip } from "@/components/ui/info-tip";
import { CampaignLinkBuilder } from "@/components/composer/campaign-link-builder";
import { LocationPicker, type PickedLocation } from "@/components/composer/location-picker";
import { PinterestOptions, DEFAULT_PINTEREST_OPTIONS, type PinterestComposerOptions } from "@/components/composer/pinterest-options";
import { Toggle } from "@/components/ui/toggle";
import { DEFAULT_TIMEZONE, localInputToUtc } from "@/lib/timezone";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { NetworkBadge, NetworkLogo } from "@/components/ui/network-badge";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { IconUpload, IconSparkle, IconMessage, IconEmoji, IconHash, IconBell, IconLink } from "@/components/dashboard/icons";
import { NebulaIcon } from "@/components/dashboard/nebula-brandmark";
import type { RepurposedContent } from "@/lib/ai/gemini";
import { uploadMediaFile, type UploadedAssetResult } from "@/lib/upload-client";
import { MediaImportBar } from "@/components/composer/media-import/media-import-bar";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { playLaunchWhoosh } from "@/lib/cosmic-audio";

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

const DRAFT_KEY_PREFIX = "nebula:composer-draft:";

// Extrait des frames d'une vidéo directement dans le navigateur (canvas),
// sans passer par ffmpeg côté serveur : fonctionne partout, y compris sur
// Vercel et avec des vidéos stockées sur Vercel Blob, contrairement à
// l'ancienne extraction serveur qui échouait dans ces deux cas.
async function captureVideoFrames(sourceUrl: string, count: number): Promise<Blob[]> {
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Impossible de lire cette vidéo pour en extraire des images."));
  });

  const duration = video.duration || 0;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 360;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Capture d'image non supportée par ce navigateur.");

  const blobs: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const t = duration > 0 ? (duration * (i + 1)) / (count + 1) : 0;
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = t;
      video.onerror = () => reject(new Error("Erreur pendant l'extraction d'une image."));
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob) blobs.push(blob);
  }
  return blobs;
}

async function uploadThumbnailBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", new File([blob], "frame.jpg", { type: blob.type || "image/jpeg" }));
  const res = await fetch("/api/media/thumbnails/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Échec de l'envoi de l'image.");
  return data.url as string;
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
  const { celebrateMilestone } = useMilestoneCelebration();
  const searchParams = useSearchParams();
  const duplicateId = searchParams.get("duplicate");
  // Brouillon venu d'un outil gratuit (« Programmer cette publication avec
  // Nebula », brief growth lot G4.a) : /composer?draft=<id>.
  const publicDraftId = searchParams.get("draft");
  const prefilledDate = searchParams.get("date"); // depuis un clic sur une case du calendrier (YYYY-MM-DD)
  const prefilledTime = searchParams.get("time"); // optionnel, depuis la vue heures du calendrier (HH:mm)
  // Depuis le "+" d'un compte précis sur la page Comptes (voir accounts/page.tsx)
  // — pré-sélectionne CE compte (et lui seul) au chargement, voir l'effet
  // juste après le chargement des connexions ci-dessous.
  const targetConnectionId = searchParams.get("connectionId");
  const aiStatus = useAiStatus(activeBrand?.id);

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
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
  const thumbSectionRef = useRef<HTMLDivElement>(null);
  const [assistantBrief, setAssistantBrief] = useState<ThumbnailBrief | null>(null);
  const briefAutoRunRef = useRef(false);
  // Cache la frame/image envoyée à Gemini pour la génération de titre/
  // description (voir getMediaFrameForAi) — invalidé dès que le média
  // change pour ne jamais analyser un fichier obsolète.
  const mediaFrameRef = useRef<{ base64: string; mimeType: string } | null>(null);
  useEffect(() => {
    mediaFrameRef.current = null;
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
  const [repurposeResult, setRepurposeResult] = useState<RepurposedContent | null>(null);

  // Bulle émojis + insertion au curseur pour Titre/Description. Un seul
  // panneau partagé (rendu via portail, voir EmojiPicker) positionné selon
  // les coordonnées réelles du bouton cliqué (emojiAnchor).
  const [emojiPickerFor, setEmojiPickerFor] = useState<"title" | "caption" | null>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<{ top: number; right: number } | null>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
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

  // Réseau affiché dans l'aperçu à droite (voir carte "Aperçu" ci-dessous) —
  // se recale automatiquement sur le premier réseau sélectionné tant que la
  // personne n'a pas cliqué sur un autre onglet réseau dans l'aperçu.
  const [previewNetwork, setPreviewNetwork] = useState<Network | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const draftRestored = useRef(false);
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl");

  useEffect(() => {
    setShortcutLabel(navigator.platform?.toLowerCase().includes("mac") ? "⌘" : "Ctrl");
  }, []);

  useEffect(() => {
    if (!activeBrand) return;
    fetch(`/api/connections?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => setConnections(d.connections ?? []));
  }, [activeBrand]);

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
          post.media.map((m: { mediaAsset: { id: string; url: string; filename: string; type: "VIDEO" | "IMAGE"; thumbnailUrl?: string } }) => ({
            id: m.mediaAsset.id,
            url: m.mediaAsset.url,
            filename: m.mediaAsset.filename,
            type: m.mediaAsset.type,
            previewUrl: m.mediaAsset.url,
            thumbnailUrl: m.mediaAsset.thumbnailUrl
          }))
        );
        setSelectedNetworks(post.targets.map((t: { network: Network }) => t.network));
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

  useEffect(() => {
    if (!activeBrand || duplicateId || publicDraftId || draftRestored.current) return;
    draftRestored.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY_PREFIX + activeBrand.id);
      if (raw) {
        const draft = JSON.parse(raw) as { title: string; caption: string; firstComment?: string; selectedNetworks: Network[] };
        if (draft.title || draft.caption) {
          setTitle(draft.title ?? "");
          setCaption(draft.caption ?? "");
          if (draft.firstComment) {
            setFirstComment(draft.firstComment);
            setFirstCommentOpen(true);
          }
          setSelectedNetworks(draft.selectedNetworks ?? []);
          toast.info("Brouillon restauré depuis votre dernière visite.");
        }
      }
    } catch {
      // stockage indisponible — tant pis, pas de brouillon
    }
    // publicDraftId : lu une fois à l'arrivée (voir l'effet dédié plus bas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand, duplicateId, toast]);

  useEffect(() => {
    if (!activeBrand || duplicateId) return;
    try {
      if (!title && !caption) {
        localStorage.removeItem(DRAFT_KEY_PREFIX + activeBrand.id);
        return;
      }
      localStorage.setItem(DRAFT_KEY_PREFIX + activeBrand.id, JSON.stringify({ title, caption, firstComment, selectedNetworks }));
    } catch {
      // ignore
    }
  }, [activeBrand, duplicateId, title, caption, firstComment, selectedNetworks]);

  const availableNetworks = Array.from(new Set(connections.map((c) => c.network)));
  const videoAsset = assets.find((a) => a.type === "VIDEO");

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
      toast.error("Cette proposition ne correspond plus à la vidéo en cours : relancez « Générer des miniatures ».");
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
    (asset: UploadedAssetResult, extra?: { credit?: { name: string } | null; creditInCaption?: boolean }) => {
      setUploadError(null);
      setAssets([{ id: asset.id, url: asset.url, filename: asset.filename, type: asset.type, previewUrl: asset.url }]);
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
      setUploadError(null);

      // Un seul média à la fois : un nouveau fichier remplace le précédent.
      const fileList = Array.from(files).slice(0, 1);
      const results = await Promise.allSettled(
        fileList.map(async (f) => {
          const previewUrl = URL.createObjectURL(f);
          const asset = await uploadMediaFile(f, activeBrand.id);
          return { asset, previewUrl };
        })
      );

      setUploading(false);

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

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setPreviewAspectClass("aspect-square");
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

  async function generateField(field: "title" | "description", network?: Network) {
    if (!activeBrand) return "";
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
        frameMimeType: frame?.mimeType
      })
    });
    const data = await res.json();
    if (!res.ok) {
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
    setGeneratingAll(true);
    const tasks: Promise<void>[] = [onGenerateOne("title"), onGenerateOne("description")];
    for (const n of selectedNetworks) {
      if (overrides[n]?.open) {
        tasks.push(onGenerateOne("title", n));
        tasks.push(onGenerateOne("description", n));
      }
    }
    await Promise.all(tasks);
    setGeneratingAll(false);
  }

  // « Générer des miniatures » : extrait 12 images de la vidéo, en fait
  // choisir exactement 3 à l'IA (netteté, cadrage, potentiel de clic) et —
  // quand l'appel vient du bouton — ouvre le chat IA pour présenter ces 3
  // propositions avec le pourquoi de chaque choix et un bouton « Choisir
  // celle-ci ». Sans IA : 3 images prises à intervalles réguliers, sans chat.
  // `viaChat: false` : appel interne (ex. avant la génération d'un brief), sans
  // ouvrir le chat.
  async function onGenerateThumbnails(options: { viaChat?: boolean } = {}) {
    if (!videoAsset) return;
    const CANDIDATE_COUNT = 12;
    const TARGET_COUNT = 3;
    const useAi = Boolean(aiStatus?.enabled && activeBrand);
    const useChat = Boolean(options.viaChat && useAi && assistant.enabled);
    setThumbLoading(true);
    if (useChat) {
      assistant.inject(
        [{ role: "user", text: `Propose-moi les 3 meilleures miniatures pour ma vidéo${title.trim() ? ` « ${title.trim()} »` : ""}.` }],
        { contextKey: "thumbnails" }
      );
      assistant.setExternalThinking(true);
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
    setAiThumbLoading(true);
    try {
      const base64 = await blobToBase64(lastCapturedFrame.current);
      const res = await fetch(`/api/media/${videoAsset.id}/thumbnails/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameBase64: base64, frameMimeType: "image/jpeg", title, brief })
      });
      const data = await res.json();
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
    await fetch(`/api/media/${videoAsset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbnailUrl: url })
    });
    setAssets((prev) => prev.map((a) => (a.id === videoAsset.id ? { ...a, thumbnailUrl: url } : a)));
  }

  const canSubmit = assets.length > 0 && selectedNetworks.length > 0 && !!activeBrand;

  // Easter egg : 20 clics sur "Publier" alors qu'il est visuellement
  // désactivé (voir le bouton plus bas — désactivé par CSS/aria-disabled,
  // PAS par l'attribut natif "disabled", pour que le clic reste détectable).
  const disabledClicks = useRef(0);
  const disabledClicksResetTimer = useRef<number | null>(null);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) {
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
            network === "YOUTUBE" || network === "PINTEREST" || (aiContentOverrides[network] ?? aiContentAll) || (location && LOCATION_NETWORKS.has(network))
              ? {
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
    const scheduledAt = mode === "date" && scheduleDate ? localInputToUtc(scheduleDate, timezone)?.toISOString() : undefined;
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
        publishNow: mode === "now"
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

    try {
      if (activeBrand) localStorage.removeItem(DRAFT_KEY_PREFIX + activeBrand.id);
    } catch {
      // ignore
    }
    if (typeof data.milestone === "number") celebrateMilestone(data.milestone);
    // Easter egg "Son Décollage" : uniquement pour une publication IMMÉDIATE
    // qui a réellement réussi (status "PUBLISHED") — jamais pour un post
    // programmé (personne ne regarde l'écran quand il partira plus tard, même
    // rationnel que dans milestone-celebration.tsx) ni pour un échec partiel.
    if (mode === "now" && data.status === "PUBLISHED" && publishSoundEnabled) {
      try {
        playLaunchWhoosh();
      } catch {
        // agrément sonore facultatif — jamais bloquant
      }
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
  const effectivePreviewNetwork: Network = previewNetwork ?? selectedNetworks[0] ?? "INSTAGRAM";
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
  const previewTitle = previewOverride?.open && previewOverride.title ? previewOverride.title : title;
  const previewCaption = previewOverride?.open && previewOverride.caption ? previewOverride.caption : caption;
  const previewAsset = assets[0];

  const noConnections = connections.length === 0;
  const tightestLimit =
    selectedNetworks.length > 0
      ? Math.min(...selectedNetworks.map((n) => NETWORK_META[n].maxCaption))
      : null;

  return (
    // Page normale, comme les autres pages du tableau de bord — plus de
    // popup fixe en plein écran avec fond assombri/flouté : la création de
    // publication se fait directement ici, à la demande explicite (retour
    // "je veux que ça devienne comme toutes les pages du site").
    <div className="space-y-6">
      <PageHeader
        title="Publier"
        description={
          <>
            Un média (ou un carrousel), une légende, vos réseaux cibles — publiez ou programmez en un clic.
            <span className="mt-0.5 block text-xs text-slate-500">
              Votre brouillon (titre + description) est sauvegardé automatiquement dans ce navigateur pendant que vous rédigez.
            </span>
          </>
        }
        actions={
          <>
            {aiStatus?.enabled && (title.trim() || caption.trim()) && (
              <Button variant="outline" onClick={onRepurpose}>
                <IconSparkle className="h-4 w-4" /> Recycler ce contenu
              </Button>
            )}
            {aiStatus?.enabled && (
              <Button variant="outline" onClick={onGenerateAll} disabled={generatingAll}>
                <IconSparkle className="h-4 w-4" /> {generatingAll ? "Génération..." : "Générer tout avec l'IA"}
              </Button>
            )}
          </>
        }
      />

      <RepurposePanel open={repurposeOpen} loading={repurposeLoading} result={repurposeResult} onClose={() => setRepurposeOpen(false)} onApply={applyRepurposed} />

      {activeBrand && aiStatus && !aiStatus.enabled && (
        <GlassCard className="border-white/10 bg-white/[0.02]">
          <p className="text-sm text-slate-400">
            {aiStatus.keyConfigured
              ? "L'assistant IA fait partie des paliers Pro/Agence."
              : "L'assistant IA n'est pas configuré sur cette instance (clé Gemini absente)."}{" "}
            {aiStatus.keyConfigured && (
              <Link href="/billing" className="text-aurora-300 underline">
                Voir les paliers
              </Link>
            )}
          </p>
        </GlassCard>
      )}

      {noConnections && (
        <Link href="/accounts" className="block">
          <GlassCard className="border-amber-500/30 bg-amber-500/[0.04] transition hover:border-amber-400/50 hover:bg-amber-500/[0.07]">
            <p className="text-sm text-amber-200">
              Aucun réseau connecté. <span className="underline">Cliquez ici pour connecter un compte</span> et
              pouvoir publier — vous pouvez tout de même préparer votre import ci-dessous.
            </p>
          </GlassCard>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <GlassCard>
            <h2 className="mb-3 font-display text-base font-medium text-white">1. Média</h2>
            <div className="relative">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFilesChosen(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] py-10 text-center transition hover:border-aurora-400/40"
              >
                <IconUpload className="h-6 w-6 text-aurora-400" />
                <p className="text-sm text-slate-300">Glissez-déposez une vidéo/image, ou cliquez pour sélectionner</p>
                <p className="text-xs text-slate-500">MP4, MOV, JPG, PNG — un seul fichier à la fois</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*,image/*"
                  className="hidden"
                  onChange={(e) => onFilesChosen(e.target.files)}
                />
              </div>
              {/* Voile flouté + logo animé pendant l'envoi : le logo Nebula
                  (nebula-brandmark.tsx) a déjà ses anneaux en rotation
                  perpétuelle en SVG, donc pas besoin d'une animation séparée
                  ici — juste le poser par-dessus la zone d'import. */}
              {uploading && (
                <div
                  aria-live="polite"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-void-950/70 backdrop-blur-sm"
                >
                  <NebulaIcon size={44} />
                  <p className="text-sm font-medium text-aurora-300">Envoi en cours...</p>
                </div>
              )}
            </div>
            <MediaImportBar
              brandId={activeBrand?.id}
              disabled={uploading}
              onImported={onMediaImported}
              onError={(message) => {
                setUploadError(message);
                toast.error(message);
              }}
              onBusyChange={setUploading}
            />
            {!focusMode && <LoadingMiniGame active={uploading} />}
            {uploadError && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3 text-sm text-red-300">
                <p className="font-medium">Échec de l&apos;envoi</p>
                <p className="mt-0.5 select-all text-xs text-red-300">{uploadError}</p>
              </div>
            )}

            {assets.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {assets.map((a) => (
                  <div key={a.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    {a.type === "VIDEO" ? (
                      <video src={a.previewUrl} poster={a.thumbnailUrl} className="h-28 w-full object-cover" muted />
                    ) : (
                      <img loading="lazy" decoding="async" src={a.previewUrl} alt={a.filename} className="h-28 w-full object-cover" />
                    )}
                    <button
                      onClick={() => removeAsset(a.id)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-xs text-white opacity-0 transition duration-150 hover:scale-125 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                    <p className="truncate px-2 py-1 text-[11px] text-slate-400">{a.filename}</p>
                  </div>
                ))}
              </div>
            )}

            {videoAsset && (
              <div ref={thumbSectionRef} className="mt-4 border-t border-white/[0.06] pt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-white">Miniature</h3>
                  <div className="flex flex-wrap gap-2">
                    {assistant.enabled && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          assistant.ask(
                            `Propose un concept de miniature pour ma vidéo${title.trim() ? ` « ${title.trim()} »` : ""} (sujet : …, public visé : …) et explique pourquoi chaque choix donne envie de cliquer.`,
                            { submit: false, contextKey: "thumbnails" }
                          )
                        }
                        title="Ouvrir l'assistant en mode miniature : concept, accroche, composition — et le pourquoi de chaque choix"
                      >
                        <IconSparkle className="h-4 w-4 text-aurora-300" />
                        Demander à l&apos;assistant
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => void onGenerateThumbnails({ viaChat: true })}
                      disabled={thumbLoading || aiThumbLoading}
                      title={aiStatus?.enabled ? "3 propositions choisies par l'IA, expliquées dans le chat" : "3 images extraites de votre vidéo"}
                    >
                      {/* Un seul bouton de génération (le 24/09/2026, l'ancien
                          « Générer avec l'IA » séparé a été fusionné ici) :
                          l'étoile signale que l'IA choisit et explique. La
                          version « plus accrocheuse » se demande dans le chat,
                          qui renvoie un brief → « Générer » sur le brief. */}
                      {aiStatus?.enabled && <IconSparkle className={clsx("h-4 w-4 text-aurora-300", thumbLoading && "animate-pulse")} />}
                      {thumbLoading ? (aiStatus?.enabled ? "Analyse..." : "Extraction...") : "Générer des miniatures"}
                    </Button>
                    <Button variant="outline" onClick={() => thumbFileInputRef.current?.click()} disabled={thumbUploading}>
                      {thumbUploading ? "Envoi..." : "Depuis mon ordinateur"}
                    </Button>
                    <input
                      ref={thumbFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onThumbFileChosen(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
                <p className="mb-2 text-xs text-slate-500">
                  {aiStatus?.enabled
                    ? "L'IA choisit 3 images de votre vidéo (netteté, cadrage, potentiel de clic) et vous explique ses choix dans le chat — choisissez celle qui donne le plus envie de cliquer, ou demandez-lui dans le chat d'en créer une version plus accrocheuse."
                    : "3 images extraites de votre vidéo — choisissez celle qui donne le plus envie de cliquer."}
                </p>
                {assistantBrief && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-aurora-400/25 bg-nebula-900/40 px-3 py-2 text-xs">
                    <IconSparkle className="h-3.5 w-3.5 shrink-0 text-aurora-300" />
                    <span className="min-w-0 text-slate-300">
                      Brief de l&apos;assistant
                      {assistantBrief.hook && (
                        <>
                          {" "}: <span className="font-semibold text-white">« {assistantBrief.hook} »</span>
                        </>
                      )}
                    </span>
                    <span className="flex-1" />
                    {/* Remplace l'ancien bouton « Générer avec l'IA (brief) ». */}
                    <button
                      type="button"
                      onClick={() => void onGenerateThumbnailWithAi()}
                      disabled={aiThumbLoading || thumbLoading}
                      className="inline-flex items-center gap-1 rounded-lg bg-aurora-400/15 px-2.5 py-1 font-medium text-aurora-200 transition hover:bg-aurora-400/25 disabled:cursor-wait disabled:opacity-60"
                    >
                      <IconSparkle className={clsx("h-3 w-3", aiThumbLoading && "animate-pulse")} />
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
                      className="rounded px-1.5 py-0.5 text-slate-500 transition hover:bg-white/5 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {thumbOptions.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {thumbOptions.map((url) => (
                      <button
                        key={url}
                        onClick={() => pickThumbnail(url)}
                        title={thumbReasons[url] || undefined}
                        className={clsx(
                          "overflow-hidden rounded-lg border-2 transition",
                          videoAsset.thumbnailUrl === url ? "border-aurora-400" : "border-white/10 hover:border-white/30"
                        )}
                      >
                        <img loading="lazy" decoding="async" src={url} alt="Miniature" className="aspect-video w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Étiquette IA : interrupteur général, placé ici (juste après le
                choix du média, en haut de page) pour qu'on y pense avant de
                descendre jusqu'aux réseaux. Il active/désactive l'option sur
                TOUS les réseaux ; chaque réseau garde son propre interrupteur
                pour une exception (section « 4. Réseaux cibles »). */}
            <AiContentMaster
              checked={aiContentAll}
              onChange={setAiContentEverywhere}
              exceptions={selectedNetworks.filter((n) => aiContentFor(n) !== aiContentAll)}
            />
          </GlassCard>

          <GlassCard>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-medium text-white">2. Titre</h2>
              <div className="relative flex items-center gap-3">
                <button
                  onClick={() => insertIntoField("title", "#")}
                  title="Insérer un hashtag"
                  className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-white"
                >
                  <IconHash className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => toggleEmojiPicker("title", e)}
                  title="Insérer un émoji"
                  className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-white"
                >
                  <IconEmoji className="h-3.5 w-3.5" />
                </button>
                {aiStatus?.enabled && (
                  <button
                    onClick={() => onGenerateOne("title")}
                    disabled={generatingFields.has("title")}
                    title={generatingFields.has("title") ? "Génération en cours..." : "Générer avec l'IA"}
                    className="flex items-center gap-1 text-xs text-aurora-300 transition hover:underline disabled:cursor-wait disabled:opacity-60 disabled:no-underline"
                  >
                    <IconSparkle className={clsx("h-3.5 w-3.5", generatingFields.has("title") && "animate-pulse")} />
                    {generatingFields.has("title") ? "Génération..." : "IA"}
                  </button>
                )}
              </div>
            </div>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de la publication (utilisé notamment comme titre YouTube)..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition-all duration-200 focus:scale-[1.01] focus:border-aurora-400/60 focus:shadow-[0_0_0_5px_rgb(var(--c-aurora-400)/0.16)]"
            />
          </GlassCard>

          <GlassCard>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-medium text-white">3. Description</h2>
              <div className="relative flex items-center gap-3">
                <button
                  onClick={() => insertIntoField("caption", "#")}
                  title="Insérer un hashtag"
                  className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-white"
                >
                  <IconHash className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => toggleEmojiPicker("caption", e)}
                  title="Insérer un émoji"
                  className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-white"
                >
                  <IconEmoji className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setCampaignLinkOpen(true)}
                  title="Lien de campagne (UTM) : suivez les visites et les ventes venues de cette publication"
                  className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-white"
                >
                  <IconLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Lien suivi</span>
                </button>
                {aiStatus?.enabled && (
                  <button
                    onClick={() => onGenerateOne("description")}
                    disabled={generatingFields.has("description")}
                    title={generatingFields.has("description") ? "Génération en cours..." : "Générer avec l'IA"}
                    className="flex items-center gap-1 text-xs text-aurora-300 transition hover:underline disabled:cursor-wait disabled:opacity-60 disabled:no-underline"
                  >
                    <IconSparkle className={clsx("h-3.5 w-3.5", generatingFields.has("description") && "animate-pulse")} />
                    {generatingFields.has("description") ? "Génération..." : "IA"}
                  </button>
                )}
              </div>
            </div>
            <textarea
              ref={captionInputRef}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Légende / description commune à tous les réseaux sélectionnés..."
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition-all duration-200 focus:scale-[1.01] focus:border-aurora-400/60 focus:shadow-[0_0_0_5px_rgb(var(--c-aurora-400)/0.16)]"
            />
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
            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className={clsx(tightestLimit && caption.length > tightestLimit ? "text-red-400" : "text-slate-500")}>
                {caption.length} caractère{caption.length !== 1 ? "s" : ""}
                {tightestLimit ? ` / ${tightestLimit} (limite la plus stricte des réseaux sélectionnés)` : ""}
              </span>
            </div>
            {captionHashtags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {captionHashtags.map((tag) => {
                  const count = hashtagCounts[tag];
                  return (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-400"
                    >
                      #{tag}
                      <span className="text-aurora-300">
                        {count === undefined ? "…" : count === 0 ? "jamais utilisé" : `utilisé ${count}×`}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </GlassCard>

          <GlassCard>
              <h2 className="mb-3 font-display text-base font-medium text-white">4. Réseaux cibles</h2>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {NETWORKS.filter((n) => offeredNetworks.includes(n) || availableNetworks.includes(n)).map((n) => {
                    const connected = availableNetworks.includes(n);
                    if (!connected) {
                      return (
                        <a
                          key={n}
                          href={activeBrand ? `/api/connections/${n.toLowerCase()}/start?brandId=${activeBrand.id}` : "/accounts"}
                          title={`Connecter ${NETWORK_META[n].label}`}
                          className="flex items-center gap-1.5 rounded-full border border-dashed border-white/15 px-2.5 py-1 text-xs text-slate-500 transition hover:border-aurora-400/40 hover:text-white"
                        >
                          <NetworkLogo network={n} className="h-3.5 w-3.5" />
                          {NETWORK_META[n].label}
                          <span className="text-[10px] text-aurora-300">connecter</span>
                        </a>
                      );
                    }
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => toggleNetwork(n)}
                        aria-pressed={selectedNetworks.includes(n)}
                        className={clsx("rounded-full transition", selectedNetworks.includes(n) ? "scale-105" : "hover:brightness-110")}
                      >
                        <NetworkBadge network={n} muted={!selectedNetworks.includes(n)} />
                      </button>
                    );
                  })}
                </div>

                {!noConnections && selectedNetworks.length > 0 && (
                  <LocationPicker
                    brandId={activeBrand?.id}
                    value={location}
                    onChange={setLocation}
                    networks={selectedNetworks}
                    mediaType={assets[0]?.type ?? null}
                  />
                )}

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
                      <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
                        {hasVideo
                          ? "Bluesky : la vidéo n'est pas encore prise en charge dans Nebula. Retirez Bluesky des cibles ou publiez une image."
                          : `Bluesky : ${blueskyText.trim().length} caractères, 300 maximum. Utilisez « Personnaliser pour Bluesky » ci-dessous pour écrire une version plus courte.`}
                      </p>
                    );
                  })()}

                {noConnections ? (
                  <p className="text-sm text-slate-500">Connectez au moins un réseau pour choisir une cible.</p>
                ) : (
                  <>

                  {selectedNetworks.map((n) => {
                    const networkConnections = connections.filter((c) => c.network === n);
                    return (
                    <div key={n} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                      {networkConnections.length > 1 && (
                        <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                          <span>Compte {NETWORK_META[n].label} :</span>
                          <select
                            value={selectedConnectionByNetwork[n] ?? networkConnections[0].id}
                            onChange={(e) => setNetworkConnection(n, e.target.value)}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white outline-none focus:border-aurora-400/60"
                          >
                            {networkConnections.map((c) => (
                              <option key={c.id} value={c.id} className="bg-void-900">
                                {c.displayName}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <button
                        onClick={() => toggleOverride(n)}
                        className="flex w-full items-center justify-between text-left text-xs text-slate-400"
                      >
                        <span>
                          Personnaliser pour <NetworkBadge network={n} size="sm" />
                        </span>
                        <span>{overrides[n]?.open ? "▲ réduire" : "▼ adapter le texte"}</span>
                      </button>
                      {overrides[n]?.open && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={overrides[n]?.title ?? ""}
                              onChange={(e) => setOverrideField(n, "title", e.target.value)}
                              placeholder={`Titre spécifique à ${NETWORK_META[n].label} (optionnel)`}
                              className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
                            />
                            {aiStatus?.enabled && (
                              <button
                                onClick={() => onGenerateOne("title", n)}
                                disabled={generatingFields.has(fieldKey("title", n))}
                                title={generatingFields.has(fieldKey("title", n)) ? "Génération en cours..." : "Générer avec l'IA"}
                                className="text-aurora-300 transition disabled:cursor-wait disabled:opacity-50"
                              >
                                <IconSparkle className={clsx("h-4 w-4", generatingFields.has(fieldKey("title", n)) && "animate-pulse")} />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <textarea
                              value={overrides[n]?.caption ?? ""}
                              onChange={(e) => setOverrideField(n, "caption", e.target.value)}
                              rows={2}
                              placeholder={`Texte spécifique à ${NETWORK_META[n].label} (optionnel, max ${NETWORK_META[n].maxCaption} caractères)`}
                              className="flex-1 resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
                            />
                            {aiStatus?.enabled && (
                              <button
                                onClick={() => onGenerateOne("description", n)}
                                disabled={generatingFields.has(fieldKey("description", n))}
                                title={generatingFields.has(fieldKey("description", n)) ? "Génération en cours..." : "Générer avec l'IA"}
                                className="text-aurora-300 transition disabled:cursor-wait disabled:opacity-50"
                              >
                                <IconSparkle className={clsx("h-4 w-4", generatingFields.has(fieldKey("description", n)) && "animate-pulse")} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Options de diffusion communes, présentées pareil pour
                          chaque réseau : interrupteur + bulle d'aide. */}
                      <div className="mt-3 space-y-2.5 border-t border-white/[0.06] pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-xs text-slate-400">
                            <IconSparkle className="h-3.5 w-3.5 text-aurora-300" />
                            Contenu généré par l&apos;IA
                            <InfoTip label={`À quoi sert « Contenu généré par l'IA » sur ${NETWORK_META[n].label} ?`}>{AI_CONTENT_HELP[n]}</InfoTip>
                          </span>
                          <Toggle
                            size="sm"
                            checked={aiContentFor(n)}
                            onChange={(next) => setAiContentOverrides((prev) => ({ ...prev, [n]: next }))}
                            aria-label={`Contenu généré par l'IA sur ${NETWORK_META[n].label}`}
                          />
                        </div>
                        {n === "YOUTUBE" && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5 text-xs text-slate-400">
                              <IconBell className="h-3.5 w-3.5 text-aurora-300" />
                              Notifier les abonnés
                              <InfoTip label="À quoi sert « Notifier les abonnés » ?">{NOTIFY_SUBSCRIBERS_HELP}</InfoTip>
                            </span>
                            <Toggle
                              size="sm"
                              checked={youtubeOptions.notifySubscribers}
                              onChange={(next) => setYoutubeOptions((o) => ({ ...o, notifySubscribers: next }))}
                              aria-label="Notifier les abonnés YouTube"
                            />
                          </div>
                        )}
                      </div>

                      {n === "PINTEREST" && (
                        <PinterestOptions
                          connectionId={selectedConnectionByNetwork.PINTEREST || networkConnections[0]?.id}
                          value={pinterestOptions}
                          onChange={setPinterestOptions}
                        />
                      )}

                      {n === "YOUTUBE" && (
                        <div className="mt-3 border-t border-white/[0.06] pt-3">
                          <button
                            type="button"
                            onClick={() => setYoutubeOptionsOpen((v) => !v)}
                            className="flex w-full items-center justify-between text-left text-xs text-slate-400"
                          >
                            <span>Préréglages YouTube</span>
                            <span>{youtubeOptionsOpen ? "▲ réduire" : "▼ configurer"}</span>
                          </button>
                          {youtubeOptionsOpen && (
                            <div className="mt-3 space-y-3">
                              <div>
                                <label className="mb-1 block text-[11px] text-slate-500">Configuration de l&apos;audience</label>
                                <select
                                  value={youtubeOptions.madeForKids ? "kids" : "not-kids"}
                                  onChange={(e) =>
                                    setYoutubeOptions((o) => ({ ...o, madeForKids: e.target.value === "kids" }))
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
                                >
                                  <option value="not-kids" className="bg-void-900">
                                    Non, cette vidéo n&apos;est pas destinée aux enfants
                                  </option>
                                  <option value="kids" className="bg-void-900">
                                    Oui, cette vidéo est destinée aux enfants
                                  </option>
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-[11px] text-slate-500">Confidentialité</label>
                                <select
                                  value={youtubeOptions.privacyStatus}
                                  onChange={(e) =>
                                    setYoutubeOptions((o) => ({
                                      ...o,
                                      privacyStatus: e.target.value as YoutubeComposerOptions["privacyStatus"]
                                    }))
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
                                >
                                  <option value="public" className="bg-void-900">
                                    Publique
                                  </option>
                                  <option value="unlisted" className="bg-void-900">
                                    Non répertoriée
                                  </option>
                                  <option value="private" className="bg-void-900">
                                    Privée
                                  </option>
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-[11px] text-slate-500">Catégorie</label>
                                <select
                                  value={youtubeOptions.categoryId}
                                  onChange={(e) => setYoutubeOptions((o) => ({ ...o, categoryId: e.target.value }))}
                                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
                                >
                                  <option value="" className="bg-void-900">
                                    Non précisée
                                  </option>
                                  {YOUTUBE_CATEGORIES.map((c) => (
                                    <option key={c.id} value={c.id} className="bg-void-900">
                                      {c.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-[11px] text-slate-500">Tags (séparés par des virgules)</label>
                                <input
                                  value={youtubeOptions.tags}
                                  onChange={(e) => setYoutubeOptions((o) => ({ ...o, tags: e.target.value }))}
                                  placeholder="ex : vlog, tutoriel, gaming"
                                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-[11px] text-slate-500">Ajouter à la playlist (optionnel)</label>
                                <input
                                  value={youtubeOptions.playlistId}
                                  onChange={(e) => setYoutubeOptions((o) => ({ ...o, playlistId: e.target.value }))}
                                  placeholder="Identifiant de la playlist YouTube"
                                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
                                />
                              </div>

                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                  })}
                  </>
                )}
              </div>
            </GlassCard>

          <GlassCard>
            <button
              onClick={() => setFirstCommentOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="flex items-center gap-2 font-display text-base font-medium text-white">
                <IconMessage className="h-4 w-4 text-slate-400" /> Premier commentaire
                <span className="text-xs font-normal text-slate-500">(option)</span>
              </h2>
              <span className="text-xs text-slate-400">{firstCommentOpen ? "▲ réduire" : "▼ ajouter"}</span>
            </button>
            {firstCommentOpen && (
              <div className="mt-3 animate-fade-in-up rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 text-xs text-slate-400">
                  Publié automatiquement juste après la publication, en commentaire sous le post (Instagram,
                  Facebook, Bluesky, Threads et LinkedIn — pas encore TikTok, YouTube ni Pinterest). Les comptes
                  Instagram et Facebook connectés avant cette option doivent se reconnecter une fois.
                </p>
                <textarea
                  value={firstComment}
                  onChange={(e) => setFirstComment(e.target.value)}
                  rows={2}
                  placeholder="Ex : Lien en bio 👇"
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition-all duration-200 focus:scale-[1.01] focus:border-aurora-400/60 focus:shadow-[0_0_0_5px_rgb(var(--c-aurora-400)/0.16)]"
                />
              </div>
            )}
          </GlassCard>
        </div>

        <div className="space-y-5">
          <PublishCard mode={mode} onModeChange={setMode} scheduleDate={scheduleDate} onScheduleDateChange={setScheduleDate} timezone={timezone} shortcutLabel={shortcutLabel} />

          <ComposerPreview
            network={effectivePreviewNetwork}
            accountFor={previewAccountFor}
            selectedNetworks={selectedNetworks}
            onPickNetwork={setPreviewNetwork}
            asset={previewAsset}
            title={previewTitle}
            caption={previewCaption}
            aspectClass={previewAspectClass}
            onAspectClass={setPreviewAspectClass}
            showInstagramGrid={showInstagramGrid}
            onToggleInstagramGrid={onToggleInstagramGrid}
            instagramGridTiles={instagramGridTiles}
            gridLoading={gridLoading}
          />

          <ComposerTips />
        </div>
      </div>

      <ComposerActionBar
        mode={mode}
        scheduleDate={scheduleDate}
        timezone={timezone}
        selectedCount={selectedNetworks.length}
        hasMedia={assets.length > 0}
        canSubmit={canSubmit}
        submitting={submitting}
        onSubmit={onSubmit}
      />

      {/* Voile plein écran pendant l'envoi : toute la page grisée/floutée et
          inutilisable tant que « Envoi... » tourne — voir publish-overlay.tsx. */}
      <PublishOverlay active={submitting} networks={selectedNetworks} mode={mode} mediaType={assets[0]?.type} />

      {emojiPickerFor && emojiAnchor && typeof document !== "undefined"
        ? createPortal(
            <EmojiPicker
              anchor={emojiAnchor}
              panelRef={emojiPopoverRef}
              onPick={(e) => insertIntoField(emojiPickerFor, e)}
            />,
            document.body
          )
        : null}
    </div>
  );
}

// Interrupteur général « Contenu généré par l'IA » (carte « 1. Média »).
function AiContentMaster({ checked, onChange, exceptions }: { checked: boolean; onChange: (next: boolean) => void; exceptions: Network[] }) {
  return (
    <div
      className={clsx(
        "mt-4 rounded-xl border px-3.5 py-3 transition",
        checked ? "border-aurora-400/40 bg-aurora-400/[0.06]" : "border-white/10 bg-white/[0.02]"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-white">
            <IconSparkle className="h-4 w-4 shrink-0 text-aurora-300" />
            Contenu généré par l&apos;IA
            <InfoTip label="À quoi sert « Contenu généré par l'IA » ?">
              À activer si ce média contient des images, des voix ou des scènes réalistes créées ou modifiées par l&apos;IA. Un seul clic l&apos;active sur tous vos réseaux : YouTube et TikTok affichent leur propre étiquette IA, et pour Instagram et Facebook (qui ne le permettent pas depuis une application) Nebula ajoute une courte mention à la fin de la légende. Pas besoin de l&apos;activer si l&apos;IA a seulement aidé à écrire le texte. Vous pouvez faire une exception réseau par réseau, plus bas dans « 4. Réseaux cibles ».
            </InfoTip>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {checked ? "Activé sur tous les réseaux sélectionnés" : "S'applique d'un coup à tous les réseaux sélectionnés"}
            {exceptions.length > 0 && (
              <span className="text-amber-300/90">
                {" "}
                · sauf {exceptions.map((n) => NETWORK_META[n].label).join(", ")}
              </span>
            )}
          </p>
        </div>
        <Toggle checked={checked} onChange={onChange} aria-label="Contenu généré par l'IA, sur tous les réseaux" />
      </div>
    </div>
  );
}
