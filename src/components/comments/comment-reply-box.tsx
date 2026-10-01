"use client";

// Champ « Répondre » sous un commentaire de la page Commentaires
// (01/10/2026). La réponse part sur le réseau, sous le nom du compte, quand
// le réseau le permet (voir social/comment-reply-support.ts) ; sinon le
// champ sert de brouillon (copier, puis répondre sur le réseau).
// « Proposer une réponse » remplit le champ avec une proposition de l'IA :
// rien n'est envoyé sans clic sur « Envoyer ».
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconSend, IconSparkle } from "@/components/dashboard/icons";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { replyLength, type CommentReplySupport } from "@/lib/social/comment-reply-support";
import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";

export interface ReplyTarget {
  id: string;
  network: Network;
  authorName: string | null;
  text: string | null;
  permalink: string | null;
  postPermalink: string | null;
}

interface ReplyError {
  error: string;
  uncertain?: boolean;
  reconnect?: boolean;
  manualUrl?: string | null;
}

export function CommentReplyBox({
  item,
  support,
  aiEnabled,
  suggestOnOpen,
  onSent,
  onClose
}: {
  item: ReplyTarget;
  support: CommentReplySupport;
  aiEnabled: boolean;
  /** Ouvert par « Proposer une réponse » : la proposition arrive tout de suite. */
  suggestOnOpen?: boolean;
  onSent: (result: { repliedAt: string; text: string }) => void;
  onClose: () => void;
}) {
  const label = NETWORK_META[item.network]?.label ?? item.network;
  const fieldId = useId();
  const hintId = useId();
  const upgrade = useUpgradeModal();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"send" | "suggest" | null>(null);
  const [tone, setTone] = useState<"warm" | "sober">("warm");
  const [error, setError] = useState<ReplyError | null>(null);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const viaApi = support.mode === "api";
  const max = support.mode === "api" ? support.maxLength : null;
  const length = replyLength(draft);
  const tooLong = max !== null && length > max;
  const link = item.permalink || item.postPermalink;

  useEffect(() => {
    field.current?.focus();
  }, []);

  async function suggest(nextTone: "warm" | "sober" = tone) {
    setBusy("suggest");
    setError(null);
    const res = await fetch("/api/ai/comment-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engagementId: item.id, tone: nextTone })
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { reply?: string; error?: string } | null;
    setBusy(null);
    if (!res || !res.ok || !data?.reply) {
      if (res && data && upgrade.openFromResponse(res.status, data)) return;
      setError({ error: data?.error ?? "Proposition impossible pour le moment. Réessayez dans un instant." });
      return;
    }
    setTone(nextTone);
    setDraft(data.reply);
    requestAnimationFrame(() => field.current?.focus());
  }

  // Ouvert par « Proposer une réponse » : une seule proposition, au montage.
  const suggested = useRef(false);
  useEffect(() => {
    if (suggestOnOpen && aiEnabled && item.text && !suggested.current) {
      suggested.current = true;
      void suggest("warm");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    if (!viaApi || !draft.trim() || tooLong || busy) return;
    setBusy("send");
    setError(null);
    const text = draft.trim();
    const res = await fetch(`/api/engagement/${item.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as ({ repliedAt?: string } & Partial<ReplyError>) | null;
    setBusy(null);
    if (!res) {
      setError({ error: `Connexion perdue : vérifiez sur ${label} si votre réponse est en ligne avant de la renvoyer.`, uncertain: true, manualUrl: link });
      return;
    }
    if (!res.ok || !data?.repliedAt) {
      if (data && upgrade.openFromResponse(res.status, data)) return;
      setError({ error: data?.error ?? "Envoi impossible pour le moment.", uncertain: data?.uncertain, reconnect: data?.reconnect, manualUrl: data?.manualUrl ?? link });
      return;
    }
    onSent({ repliedAt: data.repliedAt, text });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError({ error: "Copie impossible : sélectionnez le texte puis copiez-le." });
    }
  }

  return (
    // Les clics dans le champ ne marquent pas le commentaire comme lu deux fois.
    <div className="mt-2.5 space-y-2" onClick={(e) => e.stopPropagation()}>
      {!viaApi && (
        <p id={hintId} className="text-xs text-slate-400">
          {support.how}{" "}
          {support.reconnect && (
            <Link href="/accounts" className="text-aurora-300 underline">
              Reconnecter le compte
            </Link>
          )}
        </p>
      )}
      <div className="relative">
        <label htmlFor={fieldId} className="sr-only">
          {viaApi ? `Votre réponse à ${item.authorName || "ce commentaire"}, publiée sur ${label}` : `Brouillon de réponse à ${item.authorName || "ce commentaire"}`}
        </label>
        <textarea
          id={fieldId}
          ref={field}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error && !error.uncertain) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          disabled={busy !== null}
          placeholder={busy === "suggest" ? "L'IA rédige une proposition…" : viaApi ? `Votre réponse, publiée sur ${label} au nom du compte` : "Préparez votre réponse ici, puis copiez-la"}
          aria-describedby={!viaApi ? hintId : undefined}
          className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none transition focus:border-aurora-400/60 disabled:opacity-70"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {viaApi ? (
          <Button onClick={() => void send()} disabled={!draft.trim() || tooLong || busy !== null} className="!px-3 !py-1.5 text-xs">
            <IconSend className="h-3.5 w-3.5" />
            {busy === "send" ? "Envoi…" : `Envoyer sur ${label}`}
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => void copy()} disabled={!draft.trim()} className="!px-3 !py-1.5 text-xs">
              {copied ? "Copié ✓" : "Copier la réponse"}
            </Button>
            {link && (
              <a href={link} target="_blank" rel="noreferrer" className="text-xs text-aurora-300 underline">
                Répondre sur {label} ↗
              </a>
            )}
          </>
        )}
        {aiEnabled && item.text && (
          <button
            type="button"
            onClick={() => void suggest(draft ? (tone === "warm" ? "sober" : "warm") : tone)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            <IconSparkle className="h-3.5 w-3.5 text-aurora-300" />
            {busy === "suggest" ? "Proposition…" : draft ? (tone === "warm" ? "Version plus sobre" : "Version plus chaleureuse") : "Proposer une réponse"}
          </button>
        )}
        <button type="button" onClick={onClose} disabled={busy === "send"} className="rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:text-white disabled:opacity-50">
          Annuler
        </button>
        {max !== null && (
          <span className={clsx("ml-auto text-[11px] tabular-nums", tooLong ? "text-red-300" : "text-slate-500")} aria-live="polite">
            {length}/{max}
          </span>
        )}
      </div>
      {error && (
        <div role="alert" className={clsx("rounded-lg border px-3 py-2 text-xs", error.uncertain ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-200" : "border-red-500/30 bg-red-500/[0.06] text-red-200")}>
          <p>{error.error}</p>
          <p className="mt-1 flex flex-wrap gap-x-3">
            {error.manualUrl && (
              <a href={error.manualUrl} target="_blank" rel="noreferrer" className="text-aurora-300 underline">
                {error.uncertain ? `Vérifier sur ${label}` : `Ouvrir sur ${label}`}
              </a>
            )}
            {error.reconnect && (
              <Link href="/accounts" className="text-aurora-300 underline">
                Reconnecter le compte
              </Link>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
