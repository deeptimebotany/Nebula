"use client";

// Puce de filtre (« Tous les comptes », « Non lus », « Par publication »…)
// partagée par les pages Commentaires et Engagements : un bouton à bascule
// avec aria-pressed, pour que l'état actif soit annoncé au clavier / lecteur
// d'écran et pas seulement visible.
import type { ReactNode } from "react";
import { clsx } from "@/lib/clsx";

export function FilterChip({ active, onClick, children, title, className }: { active: boolean; onClick: () => void; children: ReactNode; title?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={clsx(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
        active ? "border-aurora-400/50 bg-nebula-700/40 text-white" : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white",
        className
      )}
    >
      {children}
    </button>
  );
}
