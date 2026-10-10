"use client";

// « Écrire à l'équipe » (page Soutenir Nebula, 10/10/2026, demande de Lucas) :
// une idée, un bug, un encouragement ou une question, envoyé directement à
// l'équipe Nebula depuis son compte, sans rien payer. Réponse par e-mail à
// l'adresse du compte. Voir /api/support/message.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { clsx } from "@/lib/clsx";
import { SUPPORT_MESSAGE_KINDS, SUPPORT_MESSAGE_LABEL, SUPPORT_MESSAGE_MAX, SUPPORT_MESSAGE_MIN, type SupportMessageKind } from "@/lib/support-message";

const PLACEHOLDER: Record<SupportMessageKind, string> = {
  idee: "Ce que vous aimeriez voir dans Nebula, et pourquoi…",
  bug: "Ce qui ne marche pas, sur quelle page, et ce que vous faisiez juste avant…",
  merci: "Un petit mot pour l'équipe…",
  question: "Votre question…",
  autre: "Votre message…"
};

export function TeamMessageForm() {
  const toast = useToast();
  const [kind, setKind] = useState<SupportMessageKind>("idee");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (message.trim().length < SUPPORT_MESSAGE_MIN || sending) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/support/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, message: message.trim() }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setSending(false);
    if (!res?.ok) {
      setError(data?.error ?? "Message non envoyé : réessayez dans un instant.");
      return;
    }
    setMessage("");
    setSent(true);
    toast.success("Message envoyé à l'équipe Nebula. Merci !");
  }

  return (
    <section id="ecrire" aria-labelledby="ecrire-titre" className="scroll-mt-24" data-testid="team-message">
      <h2 id="ecrire-titre" className="font-display text-sm font-medium text-white">
        Écrire à l&apos;équipe
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Une idée, un bug, un mot d&apos;encouragement ? Il arrive directement à l&apos;équipe Nebula. C&apos;est gratuit : nous répondons par e-mail, à l&apos;adresse de votre compte.
      </p>
      {sent ? (
        <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3">
          <p className="text-sm font-medium text-emerald-200">Merci, votre message est bien arrivé.</p>
          <button type="button" onClick={() => setSent(false)} className="mt-1 text-xs text-emerald-300 underline-offset-2 hover:underline">
            Écrire un autre message
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type de message">
            {SUPPORT_MESSAGE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs transition",
                  kind === k ? "border-aurora-400/60 bg-aurora-400/[0.12] text-white" : "border-white/10 text-slate-300 hover:border-white/25 hover:text-white"
                )}
              >
                {SUPPORT_MESSAGE_LABEL[k]}
              </button>
            ))}
          </div>
          <label htmlFor="message-equipe" className="sr-only">
            Votre message
          </label>
          <textarea
            id="message-equipe"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={SUPPORT_MESSAGE_MAX}
            rows={4}
            placeholder={PLACEHOLDER[kind]}
            className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-aurora-400/60"
          />
          {error && (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] tabular-nums text-slate-500">
              {message.length}/{SUPPORT_MESSAGE_MAX}
            </span>
            <Button onClick={() => void send()} disabled={sending || message.trim().length < SUPPORT_MESSAGE_MIN}>
              {sending ? "Envoi…" : "Envoyer à l'équipe"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
