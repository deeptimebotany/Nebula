"use client";

// Générateur gratuit de titres/légendes, sans compte (voir /api/public/tools/captions).
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { clsx } from "@/lib/clsx";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { IconMessage, IconSparkle } from "@/components/dashboard/icons";

type Field = "title" | "description";

export default function FreeCaptionToolPage() {
  const [topic, setTopic] = useState("");
  const [network, setNetwork] = useState<Network | "">("");
  const [brandName, setBrandName] = useState("");
  const [field, setField] = useState<Field>("description");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (topic.trim().length < 3) {
      setError("Décrivez votre publication en quelques mots.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/public/tools/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), network: network || undefined, brandName: brandName.trim() || undefined, field })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Une erreur est survenue.");
        return;
      }
      setResult(data.text);
      setRemaining(data.remaining ?? null);
    } catch {
      setError("Impossible de contacter le générateur pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <IconMessage className="h-6 w-6 text-aurora-300" /> Générateur de légendes & titres
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-slate-400">
          Décrivez votre publication, l&apos;IA rédige un texte prêt à copier-coller. Gratuit, sans compte.
        </p>
      </section>

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-24">
        <GlassCard>
          <div className="flex gap-2">
            <button
              onClick={() => setField("description")}
              className={clsx(
                "flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition",
                field === "description" ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25"
              )}
            >
              Légende
            </button>
            <button
              onClick={() => setField("title")}
              className={clsx(
                "flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition",
                field === "title" ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25"
              )}
            >
              Titre
            </button>
          </div>

          <label className="mt-4 block text-xs uppercase tracking-wide text-slate-500">
            De quoi parle votre publication ?
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="Ex : ouverture de notre nouvelle boutique à Lyon ce week-end"
            className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
          />

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="legendes-network" className="block text-xs uppercase tracking-wide text-slate-500">Réseau (optionnel)</label>
              <select
                id="legendes-network"
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
            <div>
              <label className="block text-xs uppercase tracking-wide text-slate-500">Nom de marque (optionnel)</label>
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                maxLength={60}
                placeholder="Ex : Studio Lucas"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
              />
            </div>
          </div>

          <Button onClick={generate} disabled={loading || topic.trim().length < 3} className="mt-4 w-full">
            <IconSparkle className="h-4 w-4" /> {loading ? "Génération..." : "Générer"}
          </Button>

          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

          {result && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="whitespace-pre-line text-sm text-white">{result}</p>
              <div className="mt-3 flex items-center justify-between">
                <button onClick={copyResult} className="text-xs font-medium text-aurora-300 hover:underline">
                  {copied ? "Copié !" : "Copier le texte"}
                </button>
                {remaining !== null && (
                  <span className="text-[11px] text-slate-500">{remaining} génération(s) gratuite(s) restante(s) aujourd&apos;hui</span>
                )}
              </div>
            </div>
          )}
        </GlassCard>

        <p className="mt-6 text-center text-sm text-slate-500">
          Besoin de publier directement sur vos réseaux depuis ce texte ?{" "}
          <Link href="/register" className="text-aurora-300 hover:underline">
            Créez votre espace Nebula gratuit
          </Link>{" "}
          — l&apos;assistant IA intégré fait partie des paliers Pro et Agence.
        </p>
      </section>
    </main>
  );
}
