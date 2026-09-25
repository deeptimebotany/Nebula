"use client";

// « Supprimer ce rapport » : quiconque a le lien peut le supprimer (la
// personne analysée comprise). Confirmation en deux temps, sans fenêtre du
// navigateur.
import { useState } from "react";

export function DeleteReport({ token }: { token: string }) {
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "done" | "error">("idle");

  async function remove() {
    setStep("busy");
    const res = await fetch(`/api/public/audit/${encodeURIComponent(token)}`, { method: "DELETE" }).catch(() => null);
    setStep(res?.ok || res?.status === 404 ? "done" : "error");
  }

  if (step === "done") {
    return (
      <p role="status" className="text-sm text-emerald-300">
        Rapport supprimé. Ce lien ne fonctionne plus.
      </p>
    );
  }
  if (step === "confirm" || step === "busy") {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm" role="group" aria-label="Confirmer la suppression">
        <span className="text-slate-300">Supprimer définitivement ce rapport pour tout le monde ?</span>
        <button type="button" onClick={remove} disabled={step === "busy"} className="rounded-lg border border-red-400/40 px-3 py-1.5 text-red-300 transition hover:bg-red-400/10 disabled:opacity-60">
          {step === "busy" ? "Suppression…" : "Oui, supprimer"}
        </button>
        <button type="button" onClick={() => setStep("idle")} className="rounded-lg px-3 py-1.5 text-slate-400 transition hover:text-white">
          Annuler
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <button type="button" onClick={() => setStep("confirm")} className="text-xs text-slate-400 underline-offset-2 transition hover:text-red-300 hover:underline">
        Supprimer ce rapport
      </button>
      {step === "error" && <p className="text-xs text-red-300">Suppression impossible pour le moment : réessayez dans un instant.</p>}
    </div>
  );
}
