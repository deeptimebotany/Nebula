"use client";

// Mini-widget public (page d'accueil, avant connexion) : le visiteur tape un
// texte de publication et voit tout de suite comment Nebula l'adapterait
// par réseau (limite de caractères, troncature) — purement client-side,
// aucune donnée envoyée nulle part.
//
// "Démo interactive dans le Hero" : en cliquant sur une puce réseau, on
// bascule sur un aperçu unique, en grand, façon carte de publication pour
// CE réseau précisément — sans quitter la page d'accueil. Un mode "Comparer
// tout" reste disponible pour retrouver la grille d'origine.

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { NetworkLogo } from "@/components/ui/network-badge";
import { clsx } from "@/lib/clsx";

const SAMPLE =
  "Nouvelle collection disponible dès aujourd'hui ! Foncez la découvrir avant qu'elle ne parte en rupture de stock. #nouveaute #collection";

function NetworkPreviewCard({ network, text, large = false }: { network: Network; text: string; large?: boolean }) {
  const meta = NETWORK_META[network];
  const overLimit = text.length > meta.maxCaption;
  const preview = overLimit ? `${text.slice(0, meta.maxCaption - 1)}…` : text;
  return (
    <div
      className={clsx(
        "rounded-xl border border-white/[0.06] bg-white/[0.02] transition",
        large ? "p-5 text-left" : "p-3"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
          <NetworkLogo network={network} className="h-3.5 w-3.5" />
          {meta.label}
        </span>
        <span className={overLimit ? "text-[11px] text-amber-400" : "text-[11px] text-slate-500"}>
          {text.length} / {meta.maxCaption >= 9999 ? "∞" : meta.maxCaption}
        </span>
      </div>
      <p className={clsx("mt-1.5 whitespace-pre-wrap text-slate-400", large ? "text-sm" : "line-clamp-3 text-xs")}>
        {preview || "…"}
      </p>
      {overLimit && <p className="mt-1.5 text-[11px] text-amber-400">Sera tronqué sur {meta.label}.</p>}
    </div>
  );
}

export function PreviewWidget() {
  const [text, setText] = useState(SAMPLE);
  const [focusNetwork, setFocusNetwork] = useState<Network | null>(null);

  return (
    <GlassCard className="mx-auto mt-10 max-w-2xl text-left" hover={false}>
      <p className="text-xs font-medium uppercase tracking-wider text-aurora-300">Essayez sans créer de compte</p>
      <h3 className="mt-1.5 font-display text-lg font-medium text-white">
        Voyez comment votre texte s&apos;adapte à chaque réseau
      </h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Tapez le texte d'une publication..."
        className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {NETWORKS.map((n) => (
          <button
            key={n}
            onClick={() => setFocusNetwork((prev) => (prev === n ? null : n))}
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
              focusNetwork === n
                ? "scale-105 border-transparent text-white shadow-glow"
                : "border-white/10 text-slate-400 hover:border-white/25 hover:text-white"
            )}
            style={focusNetwork === n ? { background: NETWORK_META[n].color } : undefined}
          >
            <NetworkLogo network={n} className="h-3.5 w-3.5" />
            {NETWORK_META[n].label}
          </button>
        ))}
        {focusNetwork && (
          <button onClick={() => setFocusNetwork(null)} className="text-xs text-slate-500 underline hover:text-white">
            Comparer tout
          </button>
        )}
      </div>

      <div className="mt-3">
        {focusNetwork ? (
          <NetworkPreviewCard network={focusNetwork} text={text} large />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {NETWORKS.map((n) => (
              <button key={n} onClick={() => setFocusNetwork(n)} className="text-left">
                <NetworkPreviewCard network={n} text={text} />
              </button>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
