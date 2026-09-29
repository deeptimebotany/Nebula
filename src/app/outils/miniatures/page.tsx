"use client";

// Générateur de miniatures (voir /api/public/tools/pick-frames et
// /api/public/tools/thumbnail). Refonte du 29/09/2026 (demande de Lucas :
// « comme sur mon site », fin du chargement qui tournait dans le vide) : la
// page reprend la section Miniature de la page Publier.
//   1. On dépose une vidéo : le NAVIGATEUR en extrait 12 images (la vidéo
//      n'est envoyée nulle part), ou une image directement.
//   2. « Générer des miniatures » : avec un compte, l'IA choisit les 3
//      meilleures et explique pourquoi ; sans compte, 3 images prises à
//      intervalles réguliers (comme dans l'app sans IA) — du vrai, pas une démo.
//   3. « Améliorer avec l'IA » (compte) : version plus percutante.
// L'aperçu à droite est celui de la page Publier (YouTube, TikTok…).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { markToolExplored } from "@/lib/tools-explored";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { clsx } from "@/lib/clsx";
import type { Network } from "@/lib/types";
import { IconDownload, IconSparkle, IconUpload } from "@/components/dashboard/icons";
import { ScheduleWithNebula } from "@/components/tools/schedule-with-nebula";
import { ToolDemoNotice, ToolQuotaLine } from "@/components/tools/tool-demo-notice";
import { ToolPreview } from "@/components/tools/tool-preview";
import { saveToolDraft, takeToolDraft, useToolAccess } from "@/components/tools/use-tool-access";
import { captureVideoFrames } from "@/lib/video/capture-frames";
import type { UploadedAsset } from "@/components/composer/composer-types";
import { ToolError } from "@/components/tools/tool-error";

const PREVIEW_NETWORKS: Network[] = ["YOUTUBE", "TIKTOK", "INSTAGRAM", "FACEBOOK"];
const FRAME_COUNT = 12;
const MAX_WIDTH = 1280;
const MAX_FILE = 500 * 1024 * 1024;

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

export default function FreeThumbnailToolPage() {
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [chosen, setChosen] = useState<{ url: string; blob: Blob } | null>(null);
  const [improved, setImproved] = useState<{ url: string; base64: string; mimeType: string } | null>(null);
  const [showImproved, setShowImproved] = useState(true);
  const [title, setTitle] = useState("");
  const [network, setNetwork] = useState<Network>("YOUTUBE");
  const [extracting, setExtracting] = useState(false);
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [askAccount, setAskAccount] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const access = useToolAccess();
  const member = access.status === "member";
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  const track = useCallback((url: string) => {
    urls.current.push(url);
    return url;
  }, []);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    const draft = takeToolDraft("miniatures");
    if (draft?.title) setTitle(draft.title);
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

  function reset() {
    setFrames([]);
    setPicks(null);
    setShowAll(false);
    setChosen(null);
    setImproved(null);
    setAskAccount(false);
    setError(null);
    setErrorReason(null);
  }

  async function onFile(file: File | null | undefined) {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      reset();
      setVideo(null);
      await takeImage(file);
      return;
    }
    if (!file.type.startsWith("video/")) {
      setError("Déposez une vidéo (MP4, MOV) ou une image (JPG, PNG).");
      return;
    }
    if (file.size > MAX_FILE) {
      setError("Vidéo trop lourde (500 Mo au plus). Elle reste sur votre appareil : seules les images extraites comptent.");
      return;
    }
    reset();
    setVideo({ url: track(URL.createObjectURL(file)), name: file.name });
  }

  async function takeImage(file: Blob) {
    try {
      const blob = await shrinkImage(file);
      setChosen({ url: track(URL.createObjectURL(blob)), blob });
      setImproved(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function generateThumbnails() {
    if (!video) return;
    setExtracting(true);
    setError(null);
    setErrorReason(null);
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
            setError(data.error ?? "L'IA n'a pas pu choisir cette fois : voici 3 images prises à intervalles réguliers.");
            setErrorReason(typeof data.reason === "string" ? data.reason : null);
          }
          else if (Array.isArray(data.picks) && data.picks.length) {
            chosenPicks = data.picks as Pick[];
            markToolExplored();
            if (typeof data.remaining === "number") access.setRemaining("text", data.remaining);
          }
        } catch {
          setError("L'IA n'a pas répondu : voici 3 images prises à intervalles réguliers.");
        }
      }
      // Sans IA : début, milieu et fin de la vidéo (comme la page Publier).
      const shown = chosenPicks ?? [2, 6, 10].map((index) => ({ index, reason: "", sharpness: 0, framing: 0, clickPotential: 0 }));
      setPicks(shown);
      const first = list[shown[0].index];
      if (first) setChosen({ url: first.url, blob: first.blob });
    } catch (err) {
      setError((err as Error).message);
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
    setImproving(true);
    setError(null);
    setErrorReason(null);
    try {
      const res = await fetch("/api/public/tools/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: await blobToBase64(chosen.blob), imageMimeType: "image/jpeg", title: title.trim() || undefined, network })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && data.signupRequired) {
        access.becomeVisitor();
        setAskAccount(true);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Une erreur est survenue.");
        setErrorReason(typeof data.reason === "string" ? data.reason : null);
        return;
      }
      setImproved({ url: `data:${data.imageMimeType};base64,${data.imageBase64}`, base64: data.imageBase64, mimeType: data.imageMimeType });
      setShowImproved(true);
      markToolExplored();
      if (typeof data.remaining === "number") access.setRemaining("thumbnail", data.remaining);
    } catch {
      setError("Impossible de contacter le générateur pour le moment.");
    } finally {
      setImproving(false);
    }
  }

  const current = improved && showImproved ? improved.url : chosen?.url ?? null;
  const asset: UploadedAsset | undefined = current ? { id: current.slice(-24), url: current, previewUrl: current, filename: "miniature.jpg", type: "IMAGE" } : undefined;
  const visibleFrames = picks ? (showAll ? frames.map((f) => ({ frame: f, pick: picks.find((p) => p.index === f.index) })) : picks.map((p) => ({ frame: frames[p.index], pick: p }))) : [];
  const aiPicked = Boolean(picks?.some((p) => p.reason));

  return (
    <main id="contenu" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-4 pt-16 text-center">
        <Link href="/outils" className="text-xs text-slate-500 hover:text-slate-300 hover:underline">
          ← Tous les outils
        </Link>
        <h1 className="mt-4 flex items-center justify-center gap-2 font-display text-2xl font-semibold text-white sm:text-3xl">
          <IconUpload className="h-6 w-6 text-aurora-300" /> Générateur de miniatures
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
          Comme dans Nebula : déposez votre vidéo, choisissez la meilleure image et voyez-la en situation sur YouTube ou TikTok. Avec un compte gratuit,
          l&apos;IA choisit les 3 meilleures et les rend plus percutantes.
        </p>
      </section>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-6 px-6 pb-10 pt-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <GlassCard>
            <h2 className="mb-3 font-display text-base font-medium text-white">1. Média</h2>
            <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void takeImage(e.target.files[0])} />
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
              <span className="text-xs text-slate-500">MP4, MOV, JPG, PNG — la vidéo reste sur votre appareil</span>
            </button>

            {video && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                <video src={video.url} muted playsInline preload="metadata" className="h-12 w-20 rounded-md bg-black object-cover" />
                <p className="min-w-0 flex-1 truncate text-sm text-slate-300">{video.name}</p>
                <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-slate-400 transition hover:text-white">
                  Remplacer
                </button>
              </div>
            )}

            {(video || chosen) && (
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-white">Miniature</h3>
                  <div className="flex flex-wrap gap-2">
                    {video && (
                      <Button variant="outline" onClick={() => void generateThumbnails()} disabled={extracting || access.status === "loading"}>
                        {member && <IconSparkle className={clsx("h-4 w-4 text-aurora-300", extracting && "animate-pulse")} />}
                        {extracting ? (member ? "Analyse..." : "Extraction...") : "Générer des miniatures"}
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => imageRef.current?.click()}>
                      Depuis mon ordinateur
                    </Button>
                  </div>
                </div>
                {video && (
                  <p className="mb-3 text-xs text-slate-500">
                    {member
                      ? "L'IA choisit 3 images de votre vidéo (netteté, cadrage, potentiel de clic) et explique chaque choix — choisissez celle qui donne le plus envie de cliquer."
                      : "3 images prises au début, au milieu et à la fin de votre vidéo, extraites dans votre navigateur. Avec un compte gratuit, l'IA choisit les 3 meilleures et explique pourquoi."}
                  </p>
                )}

                {visibleFrames.length > 0 && (
                  <div className={clsx("grid gap-2", showAll ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3")}>
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
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="mb-3 font-display text-base font-medium text-white">2. Titre de la vidéo</h2>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Ex : 5 astuces pour un café parfait"
              aria-label="Titre de la vidéo"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">Affiché dans l&apos;aperçu, et utilisé par l&apos;IA pour le texte de la miniature.</p>
          </GlassCard>

          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-medium text-white">3. Miniature choisie</h2>
              {chosen && (
                <a href={current ?? chosen.url} download={improved && showImproved ? "miniature-nebula.png" : "miniature.jpg"} className="inline-flex items-center gap-1.5 text-xs font-medium text-aurora-300 hover:underline">
                  <IconDownload className="h-3.5 w-3.5" /> Télécharger l&apos;image
                </a>
              )}
            </div>
            {chosen ? (
              <>
                {improved && (
                  <div className="mt-3 inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-xs" role="group" aria-label="Version affichée">
                    {[
                      [false, "Image d'origine"],
                      [true, "Version IA"]
                    ].map(([v, label]) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setShowImproved(v as boolean)}
                        aria-pressed={showImproved === v}
                        className={clsx("rounded-md px-2.5 py-1 transition", showImproved === v ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}
                      >
                        {label as string}
                      </button>
                    ))}
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current ?? chosen.url} alt="Miniature choisie" className="mt-3 aspect-video w-full rounded-xl border border-white/10 bg-black object-cover" />
                <Button onClick={() => void improve()} disabled={improving || access.status === "loading"} className="mt-4 w-full">
                  <IconSparkle className={clsx("h-4 w-4", improving && "animate-pulse")} />
                  {improving ? "Génération..." : "Rendre plus percutante avec l'IA"}
                </Button>
                <ToolQuotaLine status={member ? "member" : "loading"} remaining={access.remaining?.thumbnail ?? null} kind="thumbnail" />
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Déposez une vidéo puis « Générer des miniatures », ou choisissez une image depuis votre ordinateur.</p>
            )}
            <ToolError message={error} reason={errorReason} />
            {askAccount && !member && (
              <ToolDemoNotice slug="miniatures" input="" label="Avec un compte gratuit" onBeforeLeave={() => saveToolDraft("miniatures", { title })}>
                L&apos;IA retravaille votre miniature (couleurs, contraste, titre lisible) et choisit les meilleures images de vos vidéos : il faut un compte
                gratuit, avec 2 miniatures par jour. L&apos;extraction des images et l&apos;aperçu restent libres, sans compte.
              </ToolDemoNotice>
            )}
            {(improved && showImproved) || chosenBase64 ? (
              <ScheduleWithNebula
                className="mt-4"
                payload={{
                  kind: "THUMBNAIL",
                  tool: "miniatures",
                  network,
                  content:
                    improved && showImproved
                      ? { title: title.trim() || undefined, imageBase64: improved.base64, imageMimeType: improved.mimeType }
                      : { title: title.trim() || undefined, imageBase64: chosenBase64 ?? "", imageMimeType: "image/jpeg" }
                }}
              />
            ) : null}
          </GlassCard>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <ToolPreview
            network={network}
            networks={PREVIEW_NETWORKS}
            onPickNetwork={setNetwork}
            title={title}
            caption=""
            asset={asset}
            devices={["desktop", "mobile"]}
            note="Même aperçu que dans la page Publier de Nebula."
          />
        </div>
      </section>

      <p className="relative z-10 px-6 pb-20 text-center text-sm text-slate-500">
        Dans Nebula, la miniature choisie part avec la vidéo sur YouTube.{" "}
        <Link href="/register?utm_source=outils&utm_medium=link&utm_campaign=miniatures" className="text-aurora-300 hover:underline">
          Créez votre espace gratuit
        </Link>{" "}
        — 14 jours d&apos;essai offerts.
      </p>
    </main>
  );
}
