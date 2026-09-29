"use client";

// Message d'erreur des outils de /outils (dans la page, jamais un toast).
// Lot E2 (brief « Essai 14 jours ») : l'IA de l'essai et du Gratuit demande
// une adresse confirmée — la raison `email_unverified` ajoute le bouton
// « Renvoyer le lien », comme le bandeau de l'application.
import { useState } from "react";

export function ToolError({ message, reason }: { message: string | null; reason?: string | null }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  if (!message) return null;

  async function resend() {
    setState("sending");
    try {
      const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-3 text-sm text-red-300" role="alert">
      <p>{message}</p>
      {reason === "email_unverified" && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-slate-300">
          <button
            type="button"
            onClick={resend}
            disabled={state === "sending" || state === "sent"}
            className="rounded-lg border border-white/15 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/5 disabled:opacity-60"
          >
            {state === "sending" ? "Envoi…" : state === "sent" ? "Lien envoyé" : "Renvoyer le lien"}
          </button>
          <span className="text-xs" aria-live="polite">
            {state === "sent" ? "Ouvrez le lien reçu par email, puis relancez la génération." : state === "error" ? "Envoi impossible pour le moment." : ""}
          </span>
        </p>
      )}
    </div>
  );
}
