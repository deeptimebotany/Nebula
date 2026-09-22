"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { useAiStatus } from "@/components/use-ai-status";
import { useToast } from "@/components/dashboard/toast";
import { useMilestoneCelebration } from "@/components/milestone-celebration";
import { LoadingMiniGame } from "@/components/mini-game/loading-mini-game";
import { GlassCard } from "@/components/ui/glass-card";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { NetworkBadge, NetworkDot, NetworkLogo } from "@/components/ui/network-badge";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import {
  IconUpload,
  IconSparkle,
  IconHeart,
  IconMessage,
  IconSend,
  IconAvatar,
  IconEmoji,
  IconHash
} from "@/components/dashboard/icons";
import type { RepurposedContent } from "@/lib/ai/gemini";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { uploadMediaFile } from "@/lib/upload-client";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { CosmeticDecorOverlay } from "@/components/cosmetics/decor-overlay";
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

interface UploadedAsset {
  id: string;
  url: string;
  filename: string;
  type: "VIDEO" | "IMAGE";
  previewUrl: string;
  thumbnailUrl?: string;
}

interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
}

interface NetworkOverride {
  open: boolean;
  title: string;
  caption: string;
}

type ScheduleMode = "now" | "date";

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

// useSearchParams() impose un <Suspense> autour du composant qui l'appelle,
// sinon Next.js refuse de pré-générer la page au build (même erreur que
// celle rencontrée sur /register — voir ce fichier pour le détail).
export default function ComposerPage() {
  return (
    <Suspense fallback={null}>
      <ComposerPageInner />
    </Suspense>
  );
}

function ComposerPageInner() {
  const { activeBrand } = useBrand();
  const router = useRouter();
  const toast = useToast();
  const { celebrateMilestone } = useMilestoneCelebration();
  const searchParams = useSearchParams();
  const duplicateId = searchParams.get("duplicate");
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  // Bulle "Premier commentaire" (voir carte dédiée plus bas) : commentaire
  // optionnel posté automatiquement juste après la publication.
  const [firstComment, setFirstComment] = useState("");
  const [firstCommentOpen, setFirstCommentOpen] = useState(false);

  // Compteur de popularité des hashtags (voir carte "3. Description") :
  // combien de fois CETTE marque a déjà utilisé chaque hashtag tapé, tiré
  // de son vrai historique de publications (pas une popularité globale).
  const [hashtagCounts, setHashtagCounts] = useState<Record<string, number>>({});
  const [selectedNetworks, setSelectedNetworks] = useState<Network[]>([]);
  const [overrides, setOverrides] = useState<Partial<Record<Network, NetworkOverride>>>({});
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
  const [aiThumbLoading, setAiThumbLoading] = useState(false);
  const [thumbUploading, setThumbUploading] = useState(false);
  const lastCapturedFrame = useRef<Blob | null>(null);
  const thumbFileInputRef = useRef<HTMLInputElement>(null);
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
  const [showTiktokUi, setShowTiktokUi] = useState(false);

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
  useEffect(() => {
    if (!activeBrand || duplicateId || draftRestored.current) return;
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
        setShowTiktokUi(false);
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

  async function onGenerateThumbnails() {
    if (!videoAsset) return;
    setThumbLoading(true);
    try {
      // On extrait plus de frames candidates que ce qu'on affiche (12 au lieu
      // de 6) pour donner à l'IA une vraie marge de choix, puis — si l'IA est
      // disponible — on lui demande de sélectionner les plus nettes/les mieux
      // cadrées plutôt que de garder un échantillonnage purement temporel
      // (qui tombe parfois en plein flou de mouvement ou en transition).
      const CANDIDATE_COUNT = 12;
      const TARGET_COUNT = 6;
      const blobs = await captureVideoFrames(videoAsset.previewUrl, CANDIDATE_COUNT);
      if (!blobs.length) throw new Error("Aucune image n'a pu être extraite de cette vidéo.");

      let chosen = blobs;
      if (aiStatus?.enabled && activeBrand) {
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
          if (res.ok && Array.isArray(data.bestIndexes) && data.bestIndexes.length > 0) {
            const picked = data.bestIndexes.map((i: number) => blobs[i]).filter(Boolean) as Blob[];
            if (picked.length) chosen = picked;
          }
        } catch {
          // L'IA a échoué ou n'a pas répondu à temps — on retombe simplement
          // sur l'échantillonnage classique ci-dessous plutôt que d'échouer.
        }
      }
      if (chosen.length > TARGET_COUNT) chosen = chosen.slice(0, TARGET_COUNT);

      lastCapturedFrame.current = chosen[0];
      const urls = await Promise.all(chosen.map(uploadThumbnailBlob));
      setThumbOptions(urls);
    } catch (err) {
      toast.error((err as Error).message ?? "Échec de l'extraction de miniatures.");
    } finally {
      setThumbLoading(false);
    }
  }

  async function onGenerateThumbnailWithAi() {
    if (!videoAsset) return;
    if (!lastCapturedFrame.current) {
      await onGenerateThumbnails();
    }
    if (!lastCapturedFrame.current) return;
    setAiThumbLoading(true);
    try {
      const base64 = await blobToBase64(lastCapturedFrame.current);
      const res = await fetch(`/api/media/${videoAsset.id}/thumbnails/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameBase64: base64, frameMimeType: "image/jpeg", title })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec de la génération IA.");
      setThumbOptions((prev) => [data.url, ...prev]);
      await pickThumbnail(data.url);
      toast.success("Miniature générée par l'IA ajoutée.");
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
          captionOverride: ov?.open && ov.caption ? ov.caption : undefined
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    const scheduledAt = mode === "date" && scheduleDate ? new Date(scheduleDate).toISOString() : undefined;

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
    setSubmitting(false);

    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Erreur lors de la création du post.");
      return;
    }

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
    mode,
    scheduleDate,
    title,
    caption,
    firstComment,
    assets,
    toast,
    celebrateMilestone,
    router,
    publishSoundEnabled
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

  // Aperçu en temps réel (carte "Aperçu", colonne de droite) : retombe sur le
  // premier réseau sélectionné si celui choisi manuellement n'est plus dans
  // la sélection (ex : décoché), et utilise le texte personnalisé de ce
  // réseau quand il est ouvert, sinon le titre/légende commun.
  const effectivePreviewNetwork: Network | null =
    previewNetwork && selectedNetworks.includes(previewNetwork) ? previewNetwork : selectedNetworks[0] ?? null;
  const previewOverride = effectivePreviewNetwork ? overrides[effectivePreviewNetwork] : undefined;
  const previewTitle = previewOverride?.open && previewOverride.title ? previewOverride.title : title;
  const previewCaption = previewOverride?.open && previewOverride.caption ? previewOverride.caption : caption;
  const previewAsset = assets[0];

  const noConnections = connections.length === 0;
  const tightestLimit =
    selectedNetworks.length > 0
      ? Math.min(...selectedNetworks.map((n) => NETWORK_META[n].maxCaption))
      : null;

  // Revient à la page précédente (calendrier, vue d'ensemble...) — c'est ce
  // que fait la croix de fermeture et la touche Échap de la popup ci-dessous.
  // router.back() plutôt qu'un chemin fixe : on veut retomber là d'où
  // l'utilisateur est venu, pas toujours au même endroit.
  const closeComposer = useCallback(() => {
    router.back();
  }, [router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore Échap tant qu'un panneau flottant secondaire (sélecteur
      // d'émojis...) est ouvert : c'est à lui de se fermer en premier.
      if (e.key === "Escape" && !emojiPickerFor) closeComposer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeComposer, emojiPickerFor]);

  return (
    // Toute la création de publication se fait dans une popup qui s'ouvre
    // automatiquement dès qu'on arrive sur cette page (import vidéo par
    // glisser-déposer ou sélection de fichier, légende, réseaux ciblés,
    // programmation...) plutôt que dans une page pleine, pour rester
    // concentré sur cette seule tâche — voir la capture de référence fournie.
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8 backdrop-blur-sm sm:items-center">
      <div className="glass-panel relative w-full max-w-5xl overflow-hidden rounded-2xl">
        <CosmeticDecorOverlay cosmeticKey="ciel-nocturne-composer" variant="starfield" />
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h1 className="font-display text-lg font-semibold text-white">Créer une publication</h1>
          <button
            type="button"
            onClick={closeComposer}
            aria-label="Fermer"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-5">
        <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">
            Un média (ou un carrousel), une légende, vos réseaux cibles — publiez ou programmez en un clic.
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Votre brouillon (titre + description) est sauvegardé automatiquement dans ce navigateur pendant que vous rédigez.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      <AnimatePresence>
      {repurposeOpen && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
        <MotionGlassCard glow className="border-aurora-400/25 bg-nebula-700/[0.08]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-base font-medium text-white">
              <IconSparkle className="h-4 w-4 text-aurora-300" /> Recyclage de contenu (Auto-Repurpose)
            </h2>
            <button onClick={() => setRepurposeOpen(false)} className="text-xs text-slate-500 hover:text-white">
              Fermer
            </button>
          </div>
          {repurposeLoading ? (
            <p className="text-sm text-slate-500">Génération des 3 déclinaisons...</p>
          ) : repurposeResult ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { network: "INSTAGRAM" as Network, label: "Reel Instagram", text: repurposeResult.instagramReel },
                { network: "FACEBOOK" as Network, label: "Post Facebook", text: repurposeResult.facebookPost },
                { network: "TIKTOK" as Network, label: "Script TikTok", text: repurposeResult.tiktokScript }
              ].map((v) => (
                <div key={v.network} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-xs font-medium" style={{ color: NETWORK_META[v.network].color }}>{v.label}</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-300">{v.text || "—"}</p>
                  {v.text && (
                    <button
                      onClick={() => applyRepurposed(v.network, v.text)}
                      className="mt-2 text-xs text-aurora-300 hover:underline"
                    >
                      Utiliser pour {NETWORK_META[v.network].label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Erreur — réessayez.</p>
          )}
        </MotionGlassCard>
        </motion.div>
      )}
      </AnimatePresence>

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
            {uploading && <p className="mt-3 text-sm text-aurora-300">Envoi en cours...</p>}
            <LoadingMiniGame active={uploading} />
            {uploadError && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3 text-sm text-red-300">
                <p className="font-medium">Échec de l&apos;envoi</p>
                <p className="mt-0.5 select-all text-xs text-red-300/80">{uploadError}</p>
              </div>
            )}

            {assets.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {assets.map((a) => (
                  <div key={a.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    {a.type === "VIDEO" ? (
                      <video src={a.previewUrl} poster={a.thumbnailUrl} className="h-28 w-full object-cover" muted />
                    ) : (
                      <img src={a.previewUrl} alt={a.filename} className="h-28 w-full object-cover" />
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
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-white">Miniature</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={onGenerateThumbnails} disabled={thumbLoading}>
                      {thumbLoading ? "Extraction..." : "Générer des miniatures"}
                    </Button>
                    {aiStatus?.enabled && (
                      <Button variant="outline" onClick={onGenerateThumbnailWithAi} disabled={aiThumbLoading || thumbLoading}>
                        <IconSparkle className="h-4 w-4" />
                        {aiThumbLoading ? "Génération IA..." : "Générer avec l'IA"}
                      </Button>
                    )}
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
                    ? "L'IA présélectionne les frames les plus nettes et les mieux cadrées parmi votre vidéo — choisissez celle qui donne le plus envie de cliquer, ou laissez l'IA en créer une version plus accrocheuse."
                    : "Images extraites directement de votre vidéo — choisissez celle qui donne le plus envie de cliquer."}
                </p>
                {thumbOptions.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {thumbOptions.map((url) => (
                      <button
                        key={url}
                        onClick={() => pickThumbnail(url)}
                        className={clsx(
                          "overflow-hidden rounded-lg border-2 transition",
                          videoAsset.thumbnailUrl === url ? "border-aurora-400" : "border-white/10 hover:border-white/30"
                        )}
                      >
                        <img src={url} alt="Miniature" className="h-16 w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                  {NETWORKS.map((n) => {
                    const connected = availableNetworks.includes(n);
                    if (!connected) {
                      return (
                        <a
                          key={n}
                          href={activeBrand ? `/api/connections/${n.toLowerCase()}/start?brandId=${activeBrand.id}` : "/accounts"}
                          title={`Connecter ${NETWORK_META[n].label}`}
                          className="flex items-center gap-1.5 rounded-full border border-dashed border-white/15 px-2.5 py-1 text-xs text-slate-500 opacity-70 transition hover:border-aurora-400/40 hover:text-white hover:opacity-100"
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
                        onClick={() => toggleNetwork(n)}
                        className={clsx("rounded-full transition", selectedNetworks.includes(n) ? "scale-105" : "opacity-50 hover:opacity-80")}
                      >
                        <NetworkBadge network={n} />
                      </button>
                    );
                  })}
                </div>

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
                <IconMessage className="h-4 w-4 text-slate-400" /> 5. Premier commentaire
                <span className="text-xs font-normal text-slate-500">(optionnel)</span>
              </h2>
              <span className="text-xs text-slate-400">{firstCommentOpen ? "▲ réduire" : "▼ ajouter"}</span>
            </button>
            {firstCommentOpen && (
              <div className="mt-3 animate-fade-in-up rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="mb-2 text-xs text-slate-400">
                  Publié automatiquement juste après la publication, en commentaire sous le post (Instagram et
                  Facebook pour le moment — les comptes déjà connectés devront se reconnecter une fois pour
                  autoriser les commentaires).
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
          <MotionGlassCard glow>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-medium text-white">Aperçu</h2>
              <div className="flex items-center gap-2">
                {effectivePreviewNetwork === "TIKTOK" && previewAsset && (
                  <button
                    onClick={() => setShowTiktokUi((v) => !v)}
                    className={clsx(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                      showTiktokUi
                        ? "border-aurora-400/60 bg-aurora-400/10 text-aurora-300"
                        : "border-white/10 text-slate-500 hover:text-white"
                    )}
                  >
                    Interface TikTok {showTiktokUi ? "ON" : "OFF"}
                  </button>
                )}
                {effectivePreviewNetwork === "INSTAGRAM" && previewAsset && (
                  <button
                    onClick={onToggleInstagramGrid}
                    className={clsx(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                      showInstagramGrid
                        ? "border-aurora-400/60 bg-aurora-400/10 text-aurora-300"
                        : "border-white/10 text-slate-500 hover:text-white"
                    )}
                  >
                    Aperçu de grille {showInstagramGrid ? "ON" : "OFF"}
                  </button>
                )}
                {selectedNetworks.length > 1 && (
                  <div className="flex gap-1">
                    {selectedNetworks.map((n) => (
                      <button
                        key={n}
                        onClick={() => setPreviewNetwork(n)}
                        className={clsx(
                          "rounded-full p-0.5 transition",
                          effectivePreviewNetwork === n ? "ring-2 ring-aurora-400" : "opacity-50 hover:opacity-80"
                        )}
                        title={`Aperçu ${NETWORK_META[n].label}`}
                      >
                        <NetworkDot network={n} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-void-950/60">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                  {(activeBrand?.name ?? "N").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white">{activeBrand?.name ?? "Votre marque"}</p>
                  {effectivePreviewNetwork && (
                    <p className="text-[10px] text-slate-500">{NETWORK_META[effectivePreviewNetwork].label}</p>
                  )}
                </div>
                {effectivePreviewNetwork && <NetworkDot network={effectivePreviewNetwork} />}
              </div>
              <div className={clsx("relative flex w-full items-center justify-center bg-black/40", previewAspectClass)}>
                {previewAsset ? (
                  previewAsset.type === "VIDEO" ? (
                    <video
                      key={previewAsset.id}
                      src={previewAsset.previewUrl}
                      poster={previewAsset.thumbnailUrl}
                      className="h-full w-full object-cover"
                      controls
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        setPreviewAspectClass(
                          v.videoHeight > v.videoWidth
                            ? "aspect-[9/16]"
                            : v.videoWidth > v.videoHeight
                              ? "aspect-video"
                              : "aspect-square"
                        );
                      }}
                    />
                  ) : (
                    <img
                      key={previewAsset.id}
                      src={previewAsset.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setPreviewAspectClass(
                          img.naturalHeight > img.naturalWidth
                            ? "aspect-[9/16]"
                            : img.naturalWidth > img.naturalHeight
                              ? "aspect-video"
                              : "aspect-square"
                        );
                      }}
                    />
                  )
                ) : (
                  <p className="px-4 text-center text-xs text-slate-600">
                    Votre média apparaîtra ici dès que vous en importerez un.
                  </p>
                )}

                {/* Simulateur d'interface TikTok — purement visuel, activé via
                    le bouton "Interface TikTok ON/OFF" ci-dessus. */}
                {showTiktokUi && effectivePreviewNetwork === "TIKTOK" && previewAsset && (
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute bottom-3 right-2.5 flex flex-col items-center gap-4 text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white/20 backdrop-blur">
                        <IconAvatar className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <IconHeart className="h-6 w-6" />
                        <span className="text-[10px] font-semibold">12,4k</span>
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <IconMessage className="h-6 w-6" />
                        <span className="text-[10px] font-semibold">348</span>
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <IconSend className="h-6 w-6" />
                        <span className="text-[10px] font-semibold">Partager</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <AnimatePresence>
              {showInstagramGrid && effectivePreviewNetwork === "INSTAGRAM" && previewAsset && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ overflow: "hidden" }}
                  className="border-t border-white/[0.06] p-3"
                >
                  <p className="mb-2 text-[11px] text-slate-500">
                    Votre nouveau post (en surbrillance) intégré à vos {instagramGridTiles.length} dernières
                    publications Instagram réelles.
                  </p>
                  {gridLoading ? (
                    <p className="text-xs text-slate-500">Chargement de votre grille...</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1">
                      <div className="relative aspect-square overflow-hidden rounded ring-2 ring-aurora-400">
                        {previewAsset.type === "VIDEO" ? (
                          <video src={previewAsset.previewUrl} className="h-full w-full object-cover" muted />
                        ) : (
                          <img src={previewAsset.previewUrl} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      {instagramGridTiles.slice(0, 8).map((tile, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="aspect-square overflow-hidden rounded"
                        >
                          <img src={tile.imageUrl} alt="" className="h-full w-full object-cover" />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
              </AnimatePresence>

              <div className="space-y-1 px-3 py-2.5">
                {previewTitle && <p className="truncate text-xs font-semibold text-white">{previewTitle}</p>}
                <p className="line-clamp-4 whitespace-pre-wrap text-xs text-slate-300">
                  {previewCaption || "Votre légende apparaîtra ici au fil de la saisie..."}
                </p>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Rendu indicatif — la mise en page réelle varie selon la plateforme.
            </p>
          </MotionGlassCard>

          <GlassCard className="border-white/10 bg-white/[0.015]">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-aurora-300">💡</span>
              Astuce générale : les publications programmées en fin d&apos;après-midi en semaine (17h–19h) obtiennent
              souvent le plus d&apos;engagement — à ajuster selon vos propres statistiques une fois synchronisées.
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="mb-3 font-display text-base font-medium text-white">5. Publication</h2>
            <div className="space-y-2">
              {[
                { id: "now", label: "Publier immédiatement" },
                { id: "date", label: "Programmer à une date précise" }
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={clsx(
                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
                    mode === opt.id ? "border-aurora-400/50 bg-nebula-700/30 text-white" : "border-white/10 text-slate-400 hover:border-white/20"
                  )}
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === opt.id}
                    onChange={() => setMode(opt.id as ScheduleMode)}
                    className="accent-aurora-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {mode === "date" && (
              <div className="mt-3">
                <DateTimePicker value={scheduleDate} onChange={setScheduleDate} />
              </div>
            )}

            {/* disabled={submitting} SEULEMENT (pas !canSubmit) : le bouton
                doit rester réellement cliquable quand canSubmit est faux
                pour pouvoir compter les clics (voir disabledClicks
                ci-dessus) — l'apparence "désactivée" vient d'aria-disabled
                + de la classe, la garde fonctionnelle reste dans onSubmit. */}
            <Button
              className={clsx("mt-4 w-full", !canSubmit && !submitting && "opacity-50 cursor-not-allowed")}
              disabled={submitting}
              aria-disabled={!canSubmit}
              onClick={onSubmit}
            >
              {submitting ? "Envoi..." : mode === "now" ? "Publier maintenant" : "Programmer"}
            </Button>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Astuce : {shortcutLabel}+Entrée pour publier sans lâcher le clavier.
            </p>
          </GlassCard>

          <GlassCard>
            <h2 className="mb-2 font-display text-sm font-medium text-white">Ce qui se passe ensuite</h2>
            <ul className="space-y-1.5 text-xs text-slate-400">
              <li>• Vous arrivez sur la page de la publication : statut par réseau, discussion, et (sur YouTube) analyse de rétention par IA.</li>
              <li>• En mode programmé, le worker planifié publie automatiquement à l&apos;heure prévue.</li>
              <li>• Un post resté bloqué peut être dupliqué en un clic depuis sa page pour retenter l&apos;envoi.</li>
            </ul>
          </GlassCard>
        </div>
      </div>

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
    {/* fin de .space-y-6 */}
        </div>
        {/* fin de la zone défilante */}
      </div>
      {/* fin de la carte de la popup */}
    </div>
  );
}
