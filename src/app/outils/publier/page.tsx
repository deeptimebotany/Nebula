"use client";

// Générateur de publications (30/09/2026, demande de Lucas : tout ce qui est
// dans l'onglet Publier doit être ensemble, en UN seul outil). Remplace le
// générateur de légendes et de titres (/outils/legendes) et le générateur de
// miniatures (/outils/miniatures), redirigés ici (next.config.js). La page
// suit la page Publier de l'application, carte par carte :
//   1. Média : une vidéo (le NAVIGATEUR en extrait 12 images, la vidéo n'est
//      envoyée nulle part) ou une image. Section Miniature comme dans
//      Publier : avec un compte, l'IA choisit les 3 meilleures images et
//      explique pourquoi ; sans compte, 3 images prises à intervalles
//      réguliers (du vrai, pas une démo). « Rendre plus percutante avec
//      l'IA » : génération d'image, Pro, Agence et essai seulement depuis le
//      30/09/2026 (en Gratuit, le bouton ouvre l'offre Pro). Le sujet de la
//      publication, en bas de la carte, sert à l'IA pour écrire les textes.
//   2. Titre et 3. Description : bouton « IA » (compte, quota par compte) ;
//      sans compte, exemple écrit à l'avance pour une publication fictive,
//      adapté au réseau choisi, et signalé comme tel.
//   4. Réseau, 5. Publication (« Programmer avec Nebula ») et, à droite, le
//      MÊME aperçu que dans Publier : vidéo et miniature, titre, texte.
// API inchangées : /api/public/tools/captions, pick-frames et thumbnail.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { markToolExplored } from "@/lib/tools-explored";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { clsx } from "@/lib/clsx";
import { LAUNCHED_NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { IconDownload, IconSend, IconSparkle, IconUpload } from "@/components/dashboard/icons";
import { NetworkTargetChip } from "@/components/ui/network-badge";
import { ScheduleWithNebula } from "@/components/tools/schedule-with-nebula";
import { ToolDemoNotice, ToolProOffer, ToolQuotaLine } from "@/components/tools/tool-demo-notice";
import { PLAN_LIMITS } from "@/lib/plans";
import { ToolPreview } from "@/components/tools/tool-preview";
import { ToolError } from "@/components/tools/tool-error";
import { saveToolDraft, takeToolDraft, useToolAccess } from "@/components/tools/use-tool-access";
import { DEMO_LEGENDES_BY_NETWORK, DEMO_LEGENDES_CASE } from "@/lib/tools/demo";
import { captureVideoFrames } from "@/lib/video/capture-frames";
import type { UploadedAsset } from "@/components/composer/composer-types";

type Field = "title" | "description";
type DemoNetwork = keyof typeof DEMO_LEGENDES_BY_NETWORK;

const FRAME_COUNT = 12;
const MAX_WIDTH = 1280;
const MAX_FILE = 500 * 1024 * 1024;

const FIELD_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60 focus:shadow-[0_0_0_4px_rgb(var(--c-aurora-400)/0.14)]";

interface Frame {
  url: string;
  blob: Blob;
  index: number;
}

interface Pick {
  index: number;
  reason: string;
  sharpness: number;
  framing: number;
  clickPotential: number;
}

function demoFor(network: Network, field: Field): string {
  const demo = DEMO_LEGENDES_BY_NETWORK[(network in DEMO_LEGENDES_BY_NETWORK ? network : "INSTAGRAM") as DemoNetwork];
  return field === "title" ? demo.title : demo.description;
}

function without(set: Set<Field>, field: Field): Set<Field> {
  if (!set.has(field)) return set;
  const next = new Set(set);
  next.delete(field);
  return next;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Lecture de l'image impossible."));
    reader.readAsDataURL(blob);
  });
}

/** Image réduite à 1 280 px de large, en JPEG : légère à envoyer à l'IA. */
async function shrinkImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = bitmap.width > MAX_WIDTH ? MAX_WIDTH / bitmap.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!out) throw new Error("Cette image n'a pas pu être lue.");
  return out;
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <span className="font-semibold text-white">{value}/5</span>
    </span>
  );
}

export default function FreePublishToolPage() {
  const access = useToolAccess();
  const member = access.status === "member";
  // Miniatures générées par l'IA : paliers payants et essai (30/09/2026) ; en
  // Gratuit, le bouton ouvre l'offre Pro au lieu d'appeler l'IA.
  const imagesIncluded = member && (access.limits?.thumbnail ?? 0) > 0;

  // Textes
  const [topic, setTopic] = useState("");
  const [brandName, setBrandName] = useState("");
  const [network, setNetwork] = useState<Network>("INSTAGRAM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<Set<Field>>(new Set());
  const [textError, setTextError] = useState<string | null>(null);
  const [textErrorReason, setTextErrorReason] = useState<string | null>(null);
  const [copied, setCopied] = useState<Field | null>(null);
  // Champs remplis par l'exemple (sans compte) : suivent le réseau choisi
  // tant que le visiteur ne les modifie pas.
  const [demoFields, setDemoFields] = useState<Set<Field>>(new Set());
  const topicRef = useRef<HTMLTextAreaElement>(null);

  // Média et miniature
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [chosen, setChosen] = useState<{ url: string; blob: Blob } | null>(null);
  const [improved, setImproved] = useState<{ url: string; base64: string; mimeType: string } | null>(null);
  const [showImproved, setShowImproved] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [improving, setImproving] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaErrorReason, setMediaErrorReason] = useState<string | null>(null);
  const [askAccount, setAskAccount] = useState(false);
  const [askPro, setAskPro] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  const track = useCallback((url: string) => {
    urls.current.push(url);
    return url;
  }, []);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Retour après la création du compte : on remet ce qui avait été saisi
  // (y compris depuis les anciens outils, redirigés ici). Lien venu de
  // l'ancien générateur de miniatures : ?reseau=youtube.
  useEffect(() => {
    const drafts = [takeToolDraft("publier"), takeToolDraft("legendes"), takeToolDraft("miniatures")];
    const draft = drafts.find(Boolean);
    const wanted = (draft?.network ?? new URLSearchParams(window.location.search).get("reseau") ?? "").toUpperCase();
    if ((LAUNCHED_NETWORKS as readonly string[]).includes(wanted)) setNetwork(wanted as Network);
    if (!draft) return;
    setTopic(draft.topic ?? "");
    setBrandName(draft.brandName ?? "");
    setTitle(draft.title ?? "");
    setDescription(draft.description ?? "");
  }, []);

  // Image choisie en base64, pour « Programmer avec Nebula » (brouillon).
  const [chosenBase64, setChosenBase64] = useState<string | null>(null);
  useEffect(() => {
    setChosenBase64(null);
    if (!chosen) return;
    let alive = true;
    blobToBase64(chosen.blob)
      .then((b) => alive && setChosenBase64(b))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [chosen]);

  // ---- Textes -------------------------------------------------------------

  function pickNetwork(n: Network) {
    setNetwork(n);
    if (demoFields.has("title")) setTitle(demoFor(n, "title"));
    if (demoFields.has("description")) setDescription(demoFor(n, "description"));
  }

  function showExample(fields: Field[]) {
    setTextError(null);
    setTextErrorReason(null);
    for (const f of fields) (f === "title" ? setTitle : setDescription)(demoFor(network, f));
    setDemoFields((prev) => new Set([...prev, ...fields]));
  }

  async function generate(fields: Field[]) {
    if (!member) {
      showExample(fields);
      return;
    }
    // Sans sujet, le titre déjà écrit en tient lieu.
    const subject = topic.trim() || (demoFields.has("title") ? "" : title.trim());
    if (subject.length < 3) {
      setTextError("Dites d'abord en quelques mots de quoi parle votre publication (carte 1).");
      setTextErrorReason(null);
      topicRef.current?.focus();
      return;
    }
    setTextError(null);
    setTextErrorReason(null);
    setBusy(new Set(fields));
    await Promise.all(
      fields.map(async (field) => {
        try {
          const res = await fetch("/api/public/tools/captions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: subject.slice(0, 400), network, brandName: brandName.trim() || undefined, field })
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 401 && data.signupRequired) {
            access.becomeVisitor();
            showExample([field]);
            return;
          }
          if (!res.ok) {
            setTextError(data.error ?? "Une erreur est survenue.");
            setTextErrorReason(typeof data.reason === "string" ? data.reason : null);
            return;
          }
          (field === "title" ? setTitle : setDescription)(data.text);
          setDemoFields((prev) => without(prev, field));
          markToolExplored();
          if (typeof data.remaining === "number") access.setRemaining("text", data.remaining);
        } catch {
          setTextError("Impossible de contacter le générateur pour le moment.");
        } finally {
          setBusy((prev) => without(prev, field));
        }
      })
    );
  }

  function editField(field: Field, value: string) {
    (field === "title" ? setTitle : setDescription)(value);
    setDemoFields((prev) => without(prev, field));
  }

  async function copy(field: Field) {
    const text = field === "title" ? title : description;
    if (!text) return;
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  // ---- Média et miniature -------------------------------------------------

  function resetMedia() {
    setFrames([]);
    setPicks(null);
    setShowAll(false);
    setChosen(null);
    setImproved(null);
    setAskAccount(false);
    setAskPro(false);
    setMediaError(null);
    setMediaErrorReason(null);
  }

  async function onFile(file: File | null | undefined) {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      resetMedia();
      setVideo(null);
      await takeImage(file);
      return;
    }
    if (!file.type.startsWith("video/")) {
      setMediaError("Déposez une vidéo (MP4, MOV) ou une image (JPG, PNG).");
      setMediaErrorReason(null);
      return;
    }
    if (file.size > MAX_FILE) {
      setMediaError("Vidéo trop lourde (500 Mo au plus). Elle reste sur votre appareil : seules les images extraites comptent.");
      setMediaErrorReason(null);
      return;
    }
    resetMedia();
    setVideo({ url: track(URL.createObjectURL(file)), name: file.name });
  }

  async function takeImage(file: Blob) {
    try {
      const blob = await shrinkImage(file);
      setChosen({ url: track(URL.createObjectURL(blob)), blob });
      setImproved(null);
    } catch (err) {
      setMediaError((err as Error).message);
      setMediaErrorReason(null);
    }
  }

  function removeMedia() {
    resetMedia();
    setVideo(null);
  }

  async function generateThumbnails() {
    if (!video) return;
    setExtracting(true);
    setMediaError(null);
    setMediaErrorReason(null);
    setPicks(null);
    setImproved(null);
    try {
      const blobs = await captureVideoFrames(video.url, FRAME_COUNT, { maxWidth: MAX_WIDTH });
      if (blobs.length < 3) throw new Error("Aucune image n'a pu être extraite de cette vidéo. Essayez un fichier MP4.");
      const list = blobs.map((blob, index) => ({ blob, index, url: track(URL.createObjectURL(blob)) }));
      setFrames(list);
      let chosenPicks: Pick[] | null = null;
      if (member) {
        try {
          const encoded = await Promise.all(list.map(async (f) => ({ index: f.index, base64: await blobToBase64(f.blob), mimeType: "image/jpeg" as const })));
          const res = await fetch("/api/public/tools/pick-frames", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frames: encoded })
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 401 && data.signupRequired) access.becomeVisitor();
          else if (!res.ok) {
            setMediaError(data.error ?? "L'IA n'a pas pu choisir cette fois : voici 3 images prises à intervalles réguliers.");
            setMediaErrorReason(typeof data.reason === "string" ? data.reason : null);
          } else if (Array.isArray(data.picks) && data.picks.length) {
            chosenPicks = data.picks as Pick[];
            markToolExplored();
            if (typeof data.remaining === "number") access.setRemaining("text", data.remaining);
          }
        } catch {
          setMediaError("L'IA n'a pas répondu : voici 3 images prises à intervalles réguliers.");
        }
      }
      // Sans IA : début, milieu et fin de la vidéo (comme la page Publier).
      const shown = chosenPicks ?? [2, 6, 10].map((index) => ({ index, reason: "", sharpness: 0, framing: 0, clickPotential: 0 }));
      setPicks(shown);
      const first = list[shown[0].index];
      if (first) setChosen({ url: first.url, blob: first.blob });
    } catch (err) {
      setMediaError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  async function improve() {
    if (!chosen) return;
    if (!member) {
      setAskAccount(true);
      return;
    }
    if (!imagesIncluded) {
      setAskPro(true);
      return;
    }
    setImproving(true);
    setMediaError(null);
    setMediaErrorReason(null);
    try {
      const res = await fetch("/api/public/tools/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: await blobToBase64(chosen.blob), imageMimeType: "image/jpeg", title: title.trim().slice(0, 100) || undefined, network })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && data.signupRequired) {
        access.becomeVisitor();
        setAskAccount(true);
        return;
      }
      if (res.status === 402) {
        // Palier sans miniatures IA (ex. fin d'essai entre-temps) : l'offre Pro.
        setAskPro(true);
        void access.refresh();
        return;
      }
      if (!res.ok) {
        setMediaError(data.error ?? "Une erreur est survenue.");
        setMediaErrorReason(typeof data.reason === "string" ? data.reason : null);
        return;
      }
      setImproved({ url: `data:${data.imageMimeType};base64,${data.imageBase64}`, base64: data.imageBase64, mimeType: data.imageMimeType });
      setShowImproved(true);
      markToolExplored();
      if (typeof data.remaining === "number") access.setRemaining("thumbnail", data.remaining);
    } catch {
      setMediaError("Impossible de contacter le générateur pour le moment.");
    } finally {
      setImproving(false);
    }
  }

  // ---- Dérivés ------------------------------------------------------------

  const maxCaption = NETWORK_META[network].maxCaption;
  const showingExample = !member && demoFields.size > 0;
  const current = improved && showImproved ? improved.url : chosen?.url;
  const visibleFrames = picks ? (showAll ? frames.map((f) => ({ frame: f, pick: picks.find((p) => p.index === f.index) })) : picks.map((p) => ({ frame: frames[p.index], pick: p }))) : [];
  const aiPicked = Boolean(picks?.some((p) => p.reason));

  // Aperçu : la vidéo avec sa miniature (comme dans Publier), ou l'image.
  const asset: UploadedAsset | undefined = video
    ? { id: `video-${video.url.slice(-12)}-${current ? current.slice(-12) : "sans"}`, url: video.url, previewUrl: video.url, thumbnailUrl: current, filename: video.name, type: "VIDEO" }
    : current
      ? { id: current.slice(-24), url: current, previewUrl: current, filename: "image.jpg", type: "IMAGE" }
      : undefined;

  // Ce qui part dans « Programmer avec Nebula » : jamais le texte d'exemple.
  const realTitle = demoFields.has("title") ? "" : title.trim();
  const realCaption = demoFields.has("description") ? "" : description.trim();
  const image = improved && showImproved ? { imageBase64: improved.base64, imageMimeType: improved.mimeType } : chosenBase64 ? { imageBase64: chosenBase64, imageMimeType: "image/jpeg" } : null;
  const canSchedule = Boolean(realTitle || realCaption || image);

  const saveDraft = () => saveToolDraft("publier", { topic, brandName, network, title: realTitle, description: realCaption });

  // En-tête des cartes Titre / Description, comme dans la page Publier.
  const fieldHeader = (field: Field, n: number, label: string) => {
    const running = busy.has(field);
    return (
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-medium text-white">
          {n}. {label}
        </h2>
        <div className="flex items-center gap-3">
          {(field === "title" ? title : description) && (
            <button type="button" onClick={() => copy(field)} className="text-xs text-slate-400 transition hover:text-white">
              {copied === field ? "Copié !" : "Copier"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void generate([field])}
            disabled={running || access.status === "loading"}
            title={member ? "Générer avec l'IA" : "Voir un exemple (sans compte : écrit à l'avance, sans IA)"}
            className="flex items-center gap-1 text-xs text-aurora-300 transition hover:underline disabled:cursor-wait disabled:opacity-60 disabled:no-underline"
          >
            <IconSparkle className={clsx("h-3.5 w-3.5", running && "animate-pulse")} />
            {running ? "Génération..." : "IA"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <main id="contenu" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-4 pt-16 text-center">
        <Link href="/outils" className="text-xs text-slate-500 hover:text-slate-300 hover:underline">
          ← Tous les outils
        </Link>
        <h1 className="mt-4 flex items-center justify-center gap-2 font-display text-2xl font-semibold text-white sm:text-3xl">
          <IconSend className="hidden h-6 w-6 shrink-0 text-aurora-300 sm:block" /> Générateur de publications
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
          Tout ce que contient la page Publier de Nebula, au même endroit : votre vidéo et sa miniature, le titre, la description et l&apos;aperçu fidèle du
          réseau. Avec un compte gratuit, l&apos;IA écrit les textes ({PLAN_LIMITS.FREE.aiDaily.text} par jour) et choisit les meilleures images de votre vidéo ;
          en Pro, elle retravaille aussi vos miniatures ({PLAN_LIMITS.PRO.aiMonthly.image} par mois).
        </p>
      </section>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-6 px-6 pb-10 pt-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          {/* 1. Média : vidéo ou image, miniature, sujet pour l'IA. */}
          <GlassCard>
            <h2 className="mb-3 font-display text-base font-medium text-white">1. Média</h2>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onFile(file);
              }}
            />
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void takeImage(file);
              }}
            />
            {!video && !chosen ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void onFile(e.dataTransfer.files?.[0]);
                }}
                className={clsx(
                  "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition",
                  dragOver ? "border-aurora-400/70 bg-aurora-400/[0.06]" : "border-white/15 bg-white/[0.02] hover:border-aurora-400/40"
                )}
              >
                <IconUpload className="h-6 w-6 text-aurora-400" />
                <span className="text-sm text-slate-300">Glissez-déposez une vidéo ou une image, ou cliquez pour sélectionner</span>
                <span className="text-xs text-slate-500">MP4, MOV, JPG, PNG — facultatif, le fichier reste sur votre appareil</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                {video ? (
                  <video src={video.url} muted playsInline preload="metadata" className="h-12 w-20 rounded-md bg-black object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={chosen?.url} alt="" className="h-12 w-20 rounded-md bg-black object-cover" />
                )}
                <p className="min-w-0 flex-1 truncate text-sm text-slate-300">{video ? video.name : "Image"}</p>
                <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-slate-400 transition hover:text-white">
                  Remplacer
                </button>
                <button type="button" onClick={removeMedia} className="text-xs text-slate-400 transition hover:text-white">
                  Retirer
                </button>
              </div>
            )}

            {(video || chosen) && (
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-white">{video ? "Miniature" : "Image"}</h3>
                  {video && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void generateThumbnails()} disabled={extracting || access.status === "loading"}>
                        {member && <IconSparkle className={clsx("h-4 w-4 text-aurora-300", extracting && "animate-pulse")} />}
                        {extracting ? (member ? "Analyse..." : "Extraction...") : "Générer des miniatures"}
                      </Button>
                      <Button variant="outline" onClick={() => imageRef.current?.click()}>
                        Depuis mon ordinateur
                      </Button>
                    </div>
                  )}
                </div>
                {video && !chosen && (
                  <p className="mb-3 text-xs text-slate-500">
                    {member
                      ? "L'IA choisit 3 images de votre vidéo (netteté, cadrage, potentiel de clic) et explique chaque choix."
                      : "3 images prises au début, au milieu et à la fin de votre vidéo, extraites dans votre navigateur. Avec un compte gratuit, l'IA choisit les 3 meilleures et explique pourquoi."}
                  </p>
                )}

                {visibleFrames.length > 0 && (
                  // Sur téléphone : 3 vignettes côte à côte, sauf quand l'IA explique ses choix.
                  <div className={clsx("grid gap-2", showAll ? "grid-cols-3 sm:grid-cols-4" : aiPicked ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-3")}>
                    {visibleFrames.map(({ frame, pick }) =>
                      frame ? (
                        <button
                          key={frame.index}
                          type="button"
                          onClick={() => {
                            setChosen({ url: frame.url, blob: frame.blob });
                            setImproved(null);
                          }}
                          aria-pressed={chosen?.url === frame.url}
                          className={clsx(
                            "overflow-hidden rounded-lg border-2 text-left transition",
                            chosen?.url === frame.url ? "border-aurora-400" : "border-white/10 hover:border-white/30"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={frame.url} alt={`Image ${frame.index + 1} de la vidéo`} className="aspect-video w-full bg-black object-cover" />
                          {pick?.reason && !showAll && (
                            <span className="block p-2 text-[11px] leading-snug text-slate-400">
                              {pick.reason}
                              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                                <Score label="Netteté" value={pick.sharpness} />
                                <Score label="Cadrage" value={pick.framing} />
                                <Score label="Clic" value={pick.clickPotential} />
                              </span>
                            </span>
                          )}
                        </button>
                      ) : null
                    )}
                  </div>
                )}
                {frames.length > 0 && (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-aurora-300 hover:underline">
                    {showAll ? (aiPicked ? "Revenir aux 3 choix de l'IA" : "Revenir aux 3 images") : `Voir les ${frames.length} images extraites`}
                  </button>
                )}

                {chosen && (
                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={current ?? chosen.url}
                      alt={video ? "Miniature choisie" : "Image de la publication"}
                      className={clsx(
                        "aspect-video w-full rounded-xl border border-white/10 bg-black object-cover sm:w-60",
                        // Téléphone : la vignette choisie est déjà entourée juste au-dessus.
                        visibleFrames.length > 0 && !improved && "hidden sm:block"
                      )}
                    />
                    <div className="min-w-0 flex-1 space-y-3">
                      {improved && (
                        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-xs" role="group" aria-label="Version affichée">
                          {(
                            [
                              [false, "Image d'origine"],
                              [true, "Version IA"]
                            ] as const
                          ).map(([v, label]) => (
                            <button
                              key={String(v)}
                              type="button"
                              onClick={() => setShowImproved(v)}
                              aria-pressed={showImproved === v}
                              className={clsx("rounded-md px-2.5 py-1 transition", showImproved === v ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                      <div>
                        <Button variant="outline" onClick={() => void improve()} disabled={improving || access.status === "loading"} className="w-full">
                          <IconSparkle className={clsx("h-4 w-4 text-aurora-300", improving && "animate-pulse")} />
                          {improving ? "Génération..." : "Rendre plus percutante avec l'IA"}
                          {member && !imagesIncluded && access.limits && (
                            <span className="rounded-full border border-aurora-400/40 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-aurora-300">Pro</span>
                          )}
                        </Button>
                        {imagesIncluded && <ToolQuotaLine status="member" remaining={access.remaining?.thumbnail ?? null} kind="thumbnail" per={access.thumbnailPer} />}
                      </div>
                      <a
                        href={current ?? chosen.url}
                        download={improved && showImproved ? "miniature-nebula.png" : "miniature.jpg"}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-aurora-300 hover:underline"
                      >
                        <IconDownload className="h-3.5 w-3.5" /> Télécharger l&apos;image
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
            <ToolError message={mediaError} reason={mediaErrorReason} />
            {askAccount && !member && (
              <ToolDemoNotice slug="publier" input="" label="Avec un compte gratuit" onBeforeLeave={saveDraft}>
                Avec un compte gratuit, l&apos;IA choisit les 3 meilleures images de vos vidéos et explique pourquoi. Les miniatures retravaillées par
                l&apos;IA (couleurs, contraste, titre lisible) font partie de Pro ({PLAN_LIMITS.PRO.aiMonthly.image} par mois) et de l&apos;essai. L&apos;extraction
                des images et l&apos;aperçu restent libres, sans compte.
              </ToolDemoNotice>
            )}
            {askPro && member && !imagesIncluded && <ToolProOffer proImages={PLAN_LIMITS.PRO.aiMonthly.image} onClose={() => setAskPro(false)} />}

            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <label htmlFor="publier-topic" className="block text-sm font-medium text-white">
                De quoi parle votre publication ?
              </label>
              <p className="mt-0.5 text-xs text-slate-500">L&apos;IA s&apos;en sert pour écrire le titre et la description.</p>
              <textarea
                id="publier-topic"
                ref={topicRef}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={2}
                maxLength={400}
                placeholder="Ex : ouverture de notre nouvelle boutique à Lyon ce week-end"
                className={clsx(FIELD_CLASS, "mt-2 resize-none")}
              />
              <label htmlFor="publier-brand" className="mt-3 block text-xs text-slate-400">
                Nom de votre marque (facultatif)
              </label>
              <input
                id="publier-brand"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                maxLength={60}
                placeholder="Ex : Studio Lumière"
                className={clsx(FIELD_CLASS, "mt-1.5")}
              />
            </div>
          </GlassCard>

          <GlassCard>
            {fieldHeader("title", 2, "Titre")}
            <input
              value={title}
              onChange={(e) => editField("title", e.target.value)}
              maxLength={200}
              placeholder="Titre de la publication (utilisé notamment comme titre YouTube)..."
              aria-label="Titre"
              className={FIELD_CLASS}
            />
          </GlassCard>

          <GlassCard>
            {fieldHeader("description", 3, "Description")}
            <textarea
              value={description}
              onChange={(e) => editField("description", e.target.value)}
              rows={7}
              placeholder={`Légende / description pour ${NETWORK_META[network].label}...`}
              aria-label="Description"
              className={clsx(FIELD_CLASS, "resize-y")}
            />
            <p className={clsx("mt-1.5 text-right text-[11px]", description.length > maxCaption ? "text-red-300" : "text-slate-500")}>
              {description.length.toLocaleString("fr-FR")} / {maxCaption.toLocaleString("fr-FR")} caractères sur {NETWORK_META[network].label}
            </p>
          </GlassCard>

          <GlassCard>
            <h2 className="mb-3 font-display text-base font-medium text-white">4. Réseau</h2>
            <div className="flex flex-wrap gap-2">
              {LAUNCHED_NETWORKS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pickNetwork(n)}
                  aria-pressed={network === n}
                  aria-label={`${NETWORK_META[n].label}${network === n ? " (choisi)" : ""}`}
                  className="rounded-full"
                >
                  <NetworkTargetChip network={n} state={network === n ? "selected" : "idle"} />
                </button>
              ))}
            </div>
          </GlassCard>

          <div>
            <Button onClick={() => void generate(["title", "description"])} disabled={busy.size > 0 || access.status === "loading"} className="w-full">
              <IconSparkle className="h-4 w-4" />
              {busy.size > 0 ? "Génération..." : member ? "Écrire le titre et la description avec l'IA" : "Voir un exemple (sans IA)"}
            </Button>
            <ToolQuotaLine status={access.status} remaining={access.remaining?.text ?? null} kind="text" />
            <ToolError message={textError} reason={textErrorReason} />
            {showingExample && <ToolDemoNotice slug="publier" input={`${DEMO_LEGENDES_CASE} · ${NETWORK_META[network].label}`} onBeforeLeave={saveDraft} />}
          </div>

          <GlassCard>
            <h2 className="mb-2 font-display text-base font-medium text-white">5. Publication</h2>
            {canSchedule ? (
              <ScheduleWithNebula
                payload={{
                  kind: "POST",
                  tool: "publier",
                  network,
                  content: { ...(realTitle ? { title: realTitle } : {}), ...(realCaption ? { caption: realCaption } : {}), ...(image ?? {}) }
                }}
              />
            ) : (
              <p className="text-sm text-slate-400">
                Dans Nebula, cette publication part sur {NETWORK_META[network].label} tout de suite ou à l&apos;heure choisie. Ajoutez un média ou écrivez votre
                texte pour la programmer.
              </p>
            )}
          </GlassCard>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <ToolPreview
            network={network}
            networks={LAUNCHED_NETWORKS}
            onPickNetwork={pickNetwork}
            title={title}
            caption={description}
            asset={asset}
            accountName={brandName}
            devices={["mobile", "desktop"]}
            note="Même aperçu que dans la page Publier de Nebula."
          />
        </div>
      </section>

      <p className="relative z-10 px-6 pb-20 text-center text-sm text-slate-500">
        Nebula programme et publie sur vos réseaux, miniature YouTube comprise, avec l&apos;IA intégrée.{" "}
        <Link href="/register?utm_source=outils&utm_medium=link&utm_campaign=publier" className="text-aurora-300 underline underline-offset-2 hover:no-underline">
          Créez votre espace gratuit
        </Link>{" "}
        — 14 jours d&apos;essai offerts.
      </p>
    </main>
  );
}
