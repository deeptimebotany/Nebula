"use client";

// Bandeau « Mode test » (24/09/2026) : visible seulement par le compte
// propriétaire quand un mode de test est actif (Tout déverrouillé, aperçu
// Gratuit/Pro/Agence — voir dev-preview.ts), sur toutes les pages de
// l'application. Un clic sur « Quitter le mode test » remet le compte dans
// son état réel, sans passer par l'onglet Test / QA.
import { useState } from "react";
import Link from "next/link";

const LABELS: Record<string, string> = {
  ALL: "Tout déverrouillé",
  FREE: "Aperçu Gratuit",
  PRO: "Aperçu Pro",
  AGENCY: "Aperçu Agence"
};

export function TestModeBar({ mode }: { mode: string | null }) {
  const [leaving, setLeaving] = useState(false);
  if (!mode || mode === "REAL") return null;

  async function leave() {
    setLeaving(true);
    const res = await fetch("/api/dev-preview/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: null })
    }).catch(() => null);
    // Rechargement complet : thèmes, fonds et cosmétiques repartent de l'état réel.
    if (res?.ok) window.location.reload();
    else setLeaving(false);
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[70] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/40 bg-[#1b1406]/95 py-1.5 pl-3 pr-1.5 text-xs text-amber-100 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur lg:left-[calc(50%+7rem)]"
    >
      <span aria-hidden="true">🧪</span>
      <span className="truncate">
        Mode test : <strong className="font-semibold">{LABELS[mode] ?? mode}</strong>
      </span>
      <Link href="/dev-preview" className="hidden rounded-full px-2 py-1 text-amber-200/80 transition hover:text-white sm:inline">
        Changer
      </Link>
      <button
        type="button"
        onClick={leave}
        disabled={leaving}
        className="rounded-full bg-amber-300 px-3 py-1 font-semibold text-[#1b1406] transition hover:bg-amber-200 disabled:opacity-60"
      >
        {leaving ? "Retour…" : "Quitter le mode test"}
      </button>
    </div>
  );
}
