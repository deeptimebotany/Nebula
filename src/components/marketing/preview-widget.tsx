"use client";

// Mini-widget public (page d'accueil, avant connexion) : le visiteur tape un
// texte de publication et voit tout de suite comment Nebula l'adapterait
// par réseau (limite de caractères, troncature) — purement client-side,
// aucune donnée envoyée nulle part.

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { NETWORKS, NETWORK_META } from "@/lib/types";

const SAMPLE =
  "Nouvelle collection disponible dès aujourd'hui ! Foncez la découvrir avant qu'elle ne parte en rupture de stock. #nouveaute #collection";

export function PreviewWidget() {
  const [text, setText] = useState(SAMPLE);

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
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {NETWORKS.map((n) => {
          const meta = NETWORK_META[n];
          const overLimit = text.length > meta.maxCaption;
          const preview = overLimit ? `${text.slice(0, meta.maxCaption - 1)}…` : text;
          return (
            <div key={n} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className={overLimit ? "text-[11px] text-amber-400" : "text-[11px] text-slate-500"}>
                  {text.length} / {meta.maxCaption >= 9999 ? "∞" : meta.maxCaption}
                </span>
              </div>
              <p className="mt-1.5 line-clamp-3 text-xs text-slate-400">{preview || "…"}</p>
              {overLimit && <p className="mt-1 text-[11px] text-amber-400">Sera tronqué sur {meta.label}.</p>}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
