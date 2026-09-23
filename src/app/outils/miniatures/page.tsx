"use client";

// Générateur gratuit de miniatures, sans compte (voir /api/public/tools/thumbnail).
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { IconUpload, IconSparkle } from "@/components/dashboard/icons";
import { ScheduleWithNebula } from "@/components/tools/schedule-with-nebula";
import { ToolLeadCapture, hasToolLead } from "@/components/tools/tool-lead-capture";

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, base64] = result.split(",");
      resolve({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function FreeThumbnailToolPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [title, setTitle] = useState("");
  const [network, setNetwork] = useState<Network | "">("");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [generated, setGenerated] = useState<{ base64: string; mimeType: string } | null>(null);
  // Capture d'email après la 2e génération du jour (lot G4.b).
  const [used, setUsed] = useState(0);
  const [leadStep, setLeadStep] = useState<"idle" | "ask" | "done" | "skipped">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFileChosen(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Merci d'envoyer une image (JPG, PNG...).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image trop lourde (8 Mo maximum).");
      return;
    }
    setError(null);
    setResultUrl(null);
    const data = await fileToBase64(file);
    setImageData(data);
    setPreview(`data:${data.mimeType};base64,${data.base64}`);
  }

  async function generate() {
    if (!imageData) {
      setError("Envoyez d'abord une photo.");
      return;
    }
    if (used >= 2 && leadStep === "idle" && !hasToolLead()) {
      setLeadStep("ask");
      return;
    }
    setLoading(true);
    setError(null);
    setResultUrl(null);
    try {
      const res = await fetch("/api/public/tools/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imageData.base64,
          imageMimeType: imageData.mimeType,
          title: title.trim() || undefined,
          network: network || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Une erreur est survenue.");
        return;
      }
      setResultUrl(`data:${data.imageMimeType};base64,${data.imageBase64}`);
      setGenerated({ base64: data.imageBase64, mimeType: data.imageMimeType });
      setRemaining(data.remaining ?? null);
      if (typeof data.used === "number") setUsed(data.used);
    } catch {
      setError("Impossible de contacter le générateur pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="contenu" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="noise-grid grain-overlay pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-4 pt-16 text-center">
        <Link href="/outils" className="text-xs text-slate-500 hover:text-slate-300 hover:underline">
          ← Tous les outils
        </Link>
        <h1 className="mt-4 flex items-center justify-center gap-2 font-display text-2xl font-semibold text-white sm:text-3xl">
          <IconUpload className="h-6 w-6 text-aurora-300" /> Générateur de miniatures
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-slate-400">
          Envoyez une photo, l&apos;IA la rend plus percutante façon miniature YouTube/TikTok. Gratuit, sans compte.
        </p>
      </section>

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-24">
        <GlassCard>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFileChosen(e.target.files[0])}
          />

          {preview ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-center text-xs uppercase tracking-wide text-slate-500">Original</p>
                <img loading="lazy" decoding="async" src={preview} alt="" className="aspect-video w-full rounded-xl border border-white/10 object-cover" />
              </div>
              <div>
                <p className="mb-1.5 text-center text-xs uppercase tracking-wide text-slate-500">Résultat IA</p>
                <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.02]">
                  {resultUrl ? (
                    <img loading="lazy" decoding="async" src={resultUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    <span className="text-xs text-slate-500">{loading ? "Génération..." : "En attente"}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] p-10 text-center transition hover:border-aurora-400/40"
            >
              <IconUpload className="h-6 w-6 text-slate-500" />
              <span className="text-sm text-slate-300">Cliquez pour choisir une photo</span>
              <span className="text-xs text-slate-500">JPG, PNG — 8 Mo maximum</span>
            </button>
          )}

          {preview && (
            <button onClick={() => fileInputRef.current?.click()} className="mt-3 text-xs text-aurora-300 hover:underline">
              Changer de photo
            </button>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-500">Titre de la vidéo (optionnel)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="Ex : 5 astuces à connaître"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-500">Réseau (optionnel)</label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value as Network | "")}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
              >
                <option value="" className="bg-void-900">Générique</option>
                {NETWORKS.map((n) => (
                  <option key={n} value={n} className="bg-void-900">
                    {NETWORK_META[n].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button onClick={generate} disabled={loading || !imageData} className="mt-4 w-full">
            <IconSparkle className="h-4 w-4" /> {loading ? "Génération..." : "Générer la miniature"}
          </Button>

          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

          {leadStep === "ask" && (
            <ToolLeadCapture
              tool="miniatures"
              onDone={(bonus) => {
                setLeadStep("done");
                setRemaining((r) => (r === null ? null : r + bonus));
              }}
              onSkip={() => setLeadStep("skipped")}
            />
          )}

          {resultUrl && (
            <>
              <div className="mt-3 flex items-center justify-between">
                <a href={resultUrl} download="miniature-nebula.png" className="text-xs font-medium text-aurora-300 hover:underline">
                  Télécharger l&apos;image
                </a>
                {remaining !== null && (
                  <span className="text-[11px] text-slate-500">{remaining} génération(s) gratuite(s) restante(s) aujourd&apos;hui</span>
                )}
              </div>
              {generated && (
                <ScheduleWithNebula
                  className="mt-4"
                  payload={{ kind: "THUMBNAIL", tool: "miniatures", network: network || undefined, content: { title: title.trim() || undefined, imageBase64: generated.base64, imageMimeType: generated.mimeType } }}
                />
              )}
            </>
          )}
        </GlassCard>

        <p className="mt-6 text-center text-sm text-slate-500">
          Envie de générer des miniatures directement depuis vos vidéos, sans les extraire vous-même ?{" "}
          <Link href="/register?utm_source=outils&utm_medium=link&utm_campaign=miniatures" className="text-aurora-300 hover:underline">
            Créez votre espace Nebula gratuit
          </Link>{" "}
          — 14 jours de Pro offerts.
        </p>
      </section>
    </main>
  );
}
