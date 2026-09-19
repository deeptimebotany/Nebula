"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { useAiStatus } from "@/components/use-ai-status";
import { useToast } from "@/components/dashboard/toast";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { NetworkBadge, NetworkDot } from "@/components/ui/network-badge";
import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { IconUpload, IconSparkle } from "@/components/dashboard/icons";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { uploadMediaFile } from "@/lib/upload-client";
import type { Plan } from "@/lib/plans";

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
  const searchParams = useSearchParams();
  const duplicateId = searchParams.get("duplicate");
  const prefilledDate = searchParams.get("date"); // depuis un clic sur une case du calendrier (YYYY-MM-DD)
  const prefilledTime = searchParams.get("time"); // optionnel, depuis la vue heures du calendrier (HH:mm)
  const aiStatus = useAiStatus(activeBrand?.id);

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [massPublishAllowed, setMassPublishAllowed] = useState(false);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [selectedNetworks, setSelectedNetworks] = useState<Network[]>([]);
  const [overrides, setOverrides] = useState<Partial<Record<Network, NetworkOverride>>>({});
  const [mode, setMode] = useState<ScheduleMode>(prefilledDate ? "date" : "now");
  const [scheduleDate, setScheduleDate] = useState(() =>
    prefilledDate ? `${prefilledDate}T${prefilledTime ?? "12:00"}` : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbOptions, setThumbOptions] = useState<string[]>([]);
  const [aiThumbLoading, setAiThumbLoading] = useState(false);
  const lastCapturedFrame = useRef<Blob | null>(null);

  // Publication en masse (palier Agence uniquement) : au lieu d'un seul
  // compte par réseau, on publie la même vidéo sur un ensemble de comptes
  // choisis librement, à travers TOUS les réseaux à la fois (ex : 3 comptes
  // Instagram + 2 pages Facebook + 1 chaîne YouTube en un seul clic).
  const [massMode, setMassMode] = useState(false);
  const [massConnectionIds, setMassConnectionIds] = useState<string[]>([]);

  // Quel compte utiliser pour chaque réseau sélectionné en mode normal —
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
    fetch(`/api/billing/plan?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => {
        setPlan(d.plan ?? "FREE");
        setMassPublishAllowed(Boolean(d.limits?.massPublishEnabled));
      })
      .catch(() => undefined);
  }, [activeBrand]);

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
        const draft = JSON.parse(raw) as { title: string; caption: string; selectedNetworks: Network[] };
        if (draft.title || draft.caption) {
          setTitle(draft.title ?? "");
          setCaption(draft.caption ?? "");
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
      localStorage.setItem(DRAFT_KEY_PREFIX + activeBrand.id, JSON.stringify({ title, caption, selectedNetworks }));
    } catch {
      // ignore
    }
  }, [activeBrand, duplicateId, title, caption, selectedNetworks]);

  const availableNetworks = Array.from(new Set(connections.map((c) => c.network)));
  const videoAsset = assets.find((a) => a.type === "VIDEO");
  const connectionsByNetwork = availableNetworks.map((n) => ({
    network: n,
    connections: connections.filter((c) => c.network === n)
  }));

  const onFilesChosen = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length || !activeBrand) return;
      setUploading(true);
      setUploadError(null);

      const fileList = Array.from(files);
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
        setAssets((prev) => [...prev, ...newAssets]);
        setThumbOptions([]);
      }
    },
    [activeBrand, toast]
  );

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
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

  function toggleMassMode() {
    setMassMode((v) => !v);
    setMassConnectionIds([]);
  }

  function toggleMassConnection(id: string) {
    setMassConnectionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function generateField(field: "title" | "description", network?: Network) {
    if (!activeBrand) return "";
    const res = await fetch("/api/ai/generate-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: activeBrand.id,
        field,
        network,
        existingTitle: title,
        existingCaption: caption,
        mediaHint: videoAsset ? "vidéo" : assets.length ? "image" : undefined
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
    const text = await generateField(field, network);
    if (!text) return;
    if (!network) {
      if (field === "title") setTitle(text);
      else setCaption(text);
    } else {
      setOverrideField(network, field === "title" ? "title" : "caption", text);
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
      const blobs = await captureVideoFrames(videoAsset.previewUrl, 6);
      if (!blobs.length) throw new Error("Aucune image n'a pu être extraite de cette vidéo.");
      lastCapturedFrame.current = blobs[0];
      const urls = await Promise.all(blobs.map(uploadThumbnailBlob));
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

  async function pickThumbnail(url: string) {
    if (!videoAsset) return;
    await fetch(`/api/media/${videoAsset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbnailUrl: url })
    });
    setAssets((prev) => prev.map((a) => (a.id === videoAsset.id ? { ...a, thumbnailUrl: url } : a)));
  }

  const canSubmit =
    assets.length > 0 &&
    (massMode ? massConnectionIds.length > 0 : selectedNetworks.length > 0) &&
    !!activeBrand;

  const onSubmit = useCallback(async () => {
    if (!activeBrand || !canSubmit) return;
    setSubmitting(true);

    const targets = massMode
      ? massConnectionIds
          .map((connectionId) => {
            const connection = connections.find((c) => c.id === connectionId);
            return connection ? { connectionId, network: connection.network } : null;
          })
          .filter((t): t is NonNullable<typeof t> => t !== null)
      : selectedNetworks
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
    router.push(`/posts/${data.postId}`);
  }, [activeBrand, canSubmit, massMode, massConnectionIds, selectedNetworks, selectedConnectionByNetwork, connections, overrides, mode, scheduleDate, title, caption, assets, toast, router]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Composer</h1>
          <p className="mt-1 text-sm text-slate-400">
            Un média (ou un carrousel), une légende, vos réseaux cibles — publiez ou programmez en un clic.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {massPublishAllowed && (
            <Button variant={massMode ? "glow" : "outline"} onClick={toggleMassMode}>
              {massMode ? "Quitter le mode masse" : "Publication en masse"}
            </Button>
          )}
          {aiStatus?.enabled && (
            <Button variant="outline" onClick={onGenerateAll} disabled={generatingAll}>
              <IconSparkle className="h-4 w-4" /> {generatingAll ? "Génération..." : "Générer tout avec l'IA"}
            </Button>
          )}
        </div>
      </div>

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

      {massMode && (
        <GlassCard className="border-aurora-400/30 bg-nebula-700/[0.15]">
          <p className="text-sm text-slate-200">
            <strong className="text-white">Mode publication en masse</strong> — cochez librement les comptes sur
            lesquels publier en même temps, toutes plateformes confondues (aucune limite de comptes, réservé au
            palier Agence).
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
              <p className="text-xs text-slate-500">
                MP4, MOV, JPG, PNG — plusieurs images possibles pour un carrousel
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="video/*,image/*"
                className="hidden"
                onChange={(e) => onFilesChosen(e.target.files)}
              />
            </div>
            {uploading && <p className="mt-3 text-sm text-aurora-300">Envoi en cours...</p>}
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
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
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
                  </div>
                </div>
                <p className="mb-2 text-xs text-slate-500">
                  Images extraites directement de votre vidéo — choisissez celle qui donne le plus envie de
                  cliquer, ou laissez l&apos;IA en créer une version plus accrocheuse.
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
              {aiStatus?.enabled && (
                <button
                  onClick={() => onGenerateOne("title")}
                  className="flex items-center gap-1 text-xs text-aurora-300 hover:underline"
                >
                  <IconSparkle className="h-3.5 w-3.5" /> IA
                </button>
              )}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de la publication (utilisé notamment comme titre YouTube)..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
            />
          </GlassCard>

          <GlassCard>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-medium text-white">3. Description</h2>
              {aiStatus?.enabled && (
                <button
                  onClick={() => onGenerateOne("description")}
                  className="flex items-center gap-1 text-xs text-aurora-300 hover:underline"
                >
                  <IconSparkle className="h-3.5 w-3.5" /> IA
                </button>
              )}
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Légende / description commune à tous les réseaux sélectionnés..."
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
            />
            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className={clsx(tightestLimit && caption.length > tightestLimit ? "text-red-400" : "text-slate-500")}>
                {caption.length} caractère{caption.length !== 1 ? "s" : ""}
                {tightestLimit ? ` / ${tightestLimit} (limite la plus stricte des réseaux sélectionnés)` : ""}
              </span>
            </div>
          </GlassCard>

          {!massMode ? (
            <GlassCard>
              <h2 className="mb-3 font-display text-base font-medium text-white">4. Réseaux cibles</h2>
              {noConnections ? (
                <p className="text-sm text-slate-500">Connectez au moins un réseau pour choisir une cible.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {availableNetworks.map((n) => (
                      <button
                        key={n}
                        onClick={() => toggleNetwork(n)}
                        className={clsx("rounded-full transition", selectedNetworks.includes(n) ? "scale-105" : "opacity-50 hover:opacity-80")}
                      >
                        <NetworkBadge network={n} />
                      </button>
                    ))}
                  </div>

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
                              <button onClick={() => onGenerateOne("title", n)} className="text-aurora-300">
                                <IconSparkle className="h-4 w-4" />
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
                              <button onClick={() => onGenerateOne("description", n)} className="text-aurora-300">
                                <IconSparkle className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              )}
            </GlassCard>
          ) : (
            <GlassCard>
              <h2 className="mb-3 font-display text-base font-medium text-white">4. Comptes cibles (masse)</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{massConnectionIds.length} compte(s) sélectionné(s) sur {connections.length}</span>
                  <button onClick={() => setMassConnectionIds(connections.map((c) => c.id))} className="text-aurora-300 hover:underline">
                    Tout sélectionner
                  </button>
                </div>
                {connectionsByNetwork.map(({ network, connections: netConnections }) => (
                  <div key={network} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <NetworkBadge network={network} size="sm" />
                    </div>
                    <ul className="space-y-1.5">
                      {netConnections.map((c) => (
                        <li key={c.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-white/[0.02] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.04]">
                            <input
                              type="checkbox"
                              checked={massConnectionIds.includes(c.id)}
                              onChange={() => toggleMassConnection(c.id)}
                              className="accent-aurora-500"
                            />
                            {c.displayName}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {connections.length === 0 && <p className="text-sm text-slate-500">Aucun compte connecté.</p>}
              </div>
            </GlassCard>
          )}
        </div>

        <div className="space-y-5">
          <GlassCard>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-medium text-white">Aperçu</h2>
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
              <div className="flex aspect-square w-full items-center justify-center bg-black/40">
                {previewAsset ? (
                  previewAsset.type === "VIDEO" ? (
                    <video
                      src={previewAsset.previewUrl}
                      poster={previewAsset.thumbnailUrl}
                      className="h-full w-full object-cover"
                      muted
                    />
                  ) : (
                    <img src={previewAsset.previewUrl} alt="" className="h-full w-full object-cover" />
                  )
                ) : (
                  <p className="px-4 text-center text-xs text-slate-600">
                    Votre média apparaîtra ici dès que vous en importerez un.
                  </p>
                )}
              </div>
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
          </GlassCard>

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

            <Button className="mt-4 w-full" disabled={submitting || !canSubmit} onClick={onSubmit}>
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
              <li>• Votre brouillon (titre + description) est sauvegardé automatiquement dans ce navigateur.</li>
            </ul>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
