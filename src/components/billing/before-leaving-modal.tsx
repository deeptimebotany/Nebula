"use client";

// « Avant de partir » (brief growth, lot G2.c) : sur Facturation, « Résilier »
// ouvre cette modale plutôt que le portail Stripe directement. Trois choix :
// mettre en pause 1, 2 ou 3 mois (Stripe pause_collection, données
// conservées, reprise automatique), passer au Gratuit (portail Stripe :
// parcours actuel), ou continuer. Pas un toast : Mode focus respecté.
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/dashboard/toast";
import { IconClose } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";

export function BeforeLeavingModal({ open, onClose, onDowngrade, onPaused }: { open: boolean; onClose: () => void; onDowngrade: () => void; onPaused: (pausedUntil: string) => void }) {
  const toast = useToast();
  const [months, setMonths] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => firstRef.current?.focus(), 50);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function pause() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/pause", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ months }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Pause impossible.");
      toast.success(`Abonnement mis en pause ${months} mois.`);
      onPaused(d.pausedUntil);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const resumeDate = new Date();
  resumeDate.setMonth(resumeDate.getMonth() + months);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="before-leaving-title" onClick={(e) => e.stopPropagation()} className="glass-panel-solid w-full max-w-lg rounded-t-3xl p-6 sm:rounded-3xl sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <h2 id="before-leaving-title" className="font-display text-2xl font-semibold text-white">Avant de partir</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">Une pause coûte 0 € et garde tout en place : vos marques, comptes, statistiques et rapports vous attendent.</p>

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-sm font-medium text-white">Mettre en pause</p>
          <div className="mt-2 flex gap-2" role="group" aria-label="Durée de la pause">
            {([1, 2, 3] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                aria-pressed={months === m}
                className={clsx(
                  "flex-1 rounded-lg border px-3 py-2 text-sm transition",
                  months === m ? "border-aurora-400/50 bg-nebula-700/40 text-white" : "border-white/10 text-slate-300 hover:border-white/20 hover:text-white"
                )}
              >
                {m} mois
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Aucun prélèvement jusqu&apos;au {resumeDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}, puis reprise automatique. Pendant la pause, votre compte suit les règles du Gratuit, sans rien perdre.
          </p>
          <button ref={firstRef} type="button" onClick={pause} disabled={busy} className="btn-glow mt-3 inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {busy ? "Mise en pause…" : `Mettre en pause ${months} mois`}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 px-1">
          <button type="button" onClick={onDowngrade} className="text-sm text-slate-300 underline-offset-2 transition hover:text-white hover:underline">
            Passer au plan Gratuit
          </button>
          <button type="button" onClick={onClose} className="text-sm text-slate-400 transition hover:text-white">
            Continuer mon abonnement
          </button>
        </div>
      </div>
    </div>
  );
}
