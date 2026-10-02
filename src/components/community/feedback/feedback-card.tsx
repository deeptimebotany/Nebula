"use client";

// Une demande d'avis dans l'onglet Avis de la Communauté (02/10/2026) :
// propositions à voter, résultats (après son vote, pour l'auteur, ou une
// fois terminée), avis écrits, et actions (terminer, signaler, supprimer).
// Réussites v3 : l'auteur de la demande marque jusqu'à 3 avis « Cet avis m'a
// aidé » (compte pour « Avis utiles » de leurs auteurs).
import { useState } from "react";
import { AvatarRing } from "@/components/reussites/avatar-ring";
import { CommunityAuthor } from "@/components/reussites/community-author";
import { ContentActions } from "@/components/community/content-actions";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { IconMessage } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";
import { reportKey } from "@/lib/community/report-reasons";
import type { Network } from "@/lib/types";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_HELPFUL_MAX,
  optionLetter,
  timeLeftLabel,
  votePercent,
  winningOptions,
  type FeedbackCommentDTO,
  type FeedbackRequestDTO
} from "@/lib/community/feedback-rules";

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function ago(iso: string): string {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export function FeedbackCard({
  request,
  viewerId,
  canModerate,
  reported,
  onReported,
  onChange,
  onDeleted
}: {
  request: FeedbackRequestDTO;
  viewerId: string | null;
  canModerate: boolean;
  reported: Set<string>;
  onReported: (key: string) => void;
  onChange: (next: FeedbackRequestDTO) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [voting, setVoting] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<FeedbackCommentDTO[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const r = request;
  const canVote = !r.mine && !r.closed;
  const resultsVisible = r.totalVotes !== null;
  const winners = r.closed ? winningOptions(r.options) : [];

  async function vote(optionId: string) {
    if (!canVote || voting) return;
    setVoting(optionId);
    const res = await fetch(`/api/community/feedback/${r.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId })
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { request?: FeedbackRequestDTO; error?: string } | null;
    setVoting(null);
    if (!res?.ok || !data?.request) {
      toast.error(data?.error ?? "Vote impossible pour le moment.");
      return;
    }
    const { comments: fresh, ...rest } = data.request;
    if (fresh) setComments(fresh);
    onChange({ ...rest, commentCount: fresh?.length ?? r.commentCount });
  }

  async function loadComments() {
    const res = await fetch(`/api/community/feedback/${r.id}`, { cache: "no-store" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { request?: FeedbackRequestDTO; viewer?: { reported?: string[] } } | null;
    if (data?.request?.comments) setComments(data.request.comments);
    for (const k of data?.viewer?.reported ?? []) onReported(k);
  }

  async function toggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && comments === null) await loadComments();
  }

  async function sendComment() {
    const body = draft.trim();
    if (body.length < 2 || sending) return;
    setSending(true);
    const res = await fetch(`/api/community/feedback/${r.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { comment?: FeedbackCommentDTO; error?: string } | null;
    setSending(false);
    if (!res?.ok || !data?.comment) {
      toast.error(data?.error ?? "Avis non envoyé : réessayez dans un instant.");
      return;
    }
    setComments((prev) => [...(prev ?? []), data.comment as FeedbackCommentDTO]);
    setDraft("");
    onChange({ ...r, commentCount: r.commentCount + 1 });
  }

  async function toggleHelpful(c: FeedbackCommentDTO) {
    if (marking) return;
    setMarking(c.id);
    const res = await fetch(`/api/community/feedback/${r.id}/comments/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ helpful: !c.helpful })
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { helpful?: boolean; error?: string } | null;
    setMarking(null);
    if (!res?.ok || typeof data?.helpful !== "boolean") {
      toast.error(data?.error ?? "Impossible pour le moment : réessayez dans un instant.");
      return;
    }
    setComments((prev) => (prev ?? []).map((x) => (x.id === c.id ? { ...x, helpful: data.helpful as boolean } : x)));
    if (data.helpful) toast.success(`Merci : ${c.author?.name ?? "ce créateur"} saura que son avis vous a aidé.`);
  }

  async function closeNow() {
    const ok = await confirm({
      title: "Terminer cette demande ?",
      message: "Les votes et les avis s'arrêtent, et les résultats deviennent visibles par tous.",
      confirmLabel: "Terminer"
    });
    if (!ok) return;
    const res = await fetch(`/api/community/feedback/${r.id}/close`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      toast.error("Action impossible pour le moment.");
      return;
    }
    onChange({ ...r, closed: true, closesAt: new Date().toISOString() });
  }

  return (
    <article id={`avis-${r.id}`} className="glass-panel scroll-mt-24 rounded-2xl p-4" aria-labelledby={`avis-${r.id}-titre`}>
      <header className="flex items-start gap-3">
        <AvatarRing ring={r.author?.ring} shapeClassName="rounded-full" className="mt-0.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-slate-300" aria-hidden="true">
            {initials(r.author?.name)}
          </span>
        </AvatarRing>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300">{r.kind === "TITLE" ? "Titres" : "Miniatures"}</span>
            {r.network && <NetworkBadge network={r.network as Network} size="sm" />}
            <span className={clsx("text-[11px]", r.closed ? "text-slate-500" : "text-emerald-300")}>{r.closed ? "Terminée" : timeLeftLabel(r.closesAt)}</span>
          </div>
          <h3 id={`avis-${r.id}-titre`} className="mt-1 text-sm text-white">
            {r.context || (r.kind === "TITLE" ? "Quel titre vous donne le plus envie de cliquer ?" : "Quelle miniature vous donne le plus envie de cliquer ?")}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            <CommunityAuthor author={r.author} /> · {ago(r.createdAt)}
          </p>
        </div>
      </header>

      <div className={clsx("mt-3", r.kind === "THUMBNAIL" ? "grid grid-cols-1 gap-2 sm:grid-cols-3" : "space-y-2")} role="group" aria-label="Propositions">
        {r.options.map((o) => {
          const pct = votePercent(o.votes, r.totalVotes);
          const chosen = r.myVote === o.id;
          const won = winners.includes(o.id);
          const label = r.kind === "TITLE" ? o.label : `Miniature ${optionLetter(o.position)}`;
          const result = resultsVisible ? `${pct} % (${o.votes ?? 0} vote${(o.votes ?? 0) > 1 ? "s" : ""})` : null;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => void vote(o.id)}
              disabled={!canVote || voting !== null}
              aria-pressed={canVote ? chosen : undefined}
              aria-label={`${canVote ? "Voter pour " : ""}${label}${result ? `, ${result}` : ""}${chosen ? ", votre choix" : ""}${won ? ", en tête" : ""}`}
              className={clsx(
                "group relative w-full overflow-hidden rounded-xl border text-left transition",
                chosen ? "border-aurora-400 ring-1 ring-aurora-400/60" : won ? "border-emerald-400/60" : "border-white/10",
                canVote ? "hover:border-white/30" : "cursor-default"
              )}
            >
              {r.kind === "THUMBNAIL" ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.imageUrl ?? ""} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 text-xs font-semibold text-white">{optionLetter(o.position)}</span>
                  {resultsVisible && (
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/70 px-2 py-1 text-xs text-white">
                      <span className="font-semibold tabular-nums">{pct} %</span>
                      <span className="text-white/70">{chosen ? "Votre choix" : won ? "En tête" : `${o.votes ?? 0} vote${(o.votes ?? 0) > 1 ? "s" : ""}`}</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="relative flex items-center gap-3 px-3 py-2.5">
                  {resultsVisible && <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-aurora-400/15 transition-[width]" style={{ width: `${pct}%` }} />}
                  <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-xs font-semibold text-slate-200">{optionLetter(o.position)}</span>
                  <span className="relative min-w-0 flex-1 text-sm text-white">{o.label}</span>
                  {resultsVisible && <span className="relative shrink-0 text-xs font-semibold tabular-nums text-slate-200">{pct} %</span>}
                  {chosen && <span className="relative shrink-0 text-[11px] text-aurora-300">Votre choix</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-slate-500" aria-live="polite">
        {r.mine
          ? r.closed
            ? `Terminée : ${r.totalVotes ?? 0} vote${(r.totalVotes ?? 0) > 1 ? "s" : ""}.`
            : `Votre demande : ${r.totalVotes ?? 0} vote${(r.totalVotes ?? 0) > 1 ? "s" : ""} pour l'instant. Vous recevrez le résultat à la fin.`
          : r.closed
            ? `Terminée : ${r.totalVotes ?? 0} vote${(r.totalVotes ?? 0) > 1 ? "s" : ""}.`
            : r.myVote
              ? "Merci ! Vous pouvez changer d'avis tant que la demande est ouverte."
              : "Votez pour voir les résultats."}
      </p>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/[0.06] pt-3">
        <button type="button" onClick={() => void toggleComments()} aria-expanded={showComments} className="inline-flex items-center gap-1.5 text-xs text-slate-300 transition hover:text-white">
          <IconMessage className="h-4 w-4" />
          {r.commentCount > 0 ? `${r.commentCount} avis` : r.closed ? "Aucun avis" : "Donner un avis"}
        </button>
        <div className="flex flex-wrap items-center gap-3">
          {r.mine && !r.closed && (
            <button type="button" onClick={() => void closeNow()} className="text-xs text-slate-400 transition hover:text-white">
              Terminer maintenant
            </button>
          )}
          <ContentActions
            type="FEEDBACK"
            id={r.id}
            mine={r.mine}
            canModerate={canModerate}
            reported={reported.has(reportKey("FEEDBACK", r.id))}
            onReported={() => onReported(reportKey("FEEDBACK", r.id))}
            onDeleted={onDeleted}
          />
        </div>
      </footer>

      {showComments && (
        <div className="mt-3 space-y-2">
          {comments === null ? (
            <p className="text-xs text-slate-500">Chargement des avis…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-slate-500">{r.closed ? "Aucun avis écrit." : "Pas encore d'avis écrit : soyez la première personne à aider."}</p>
          ) : (
            <ul className="space-y-2" aria-label="Avis écrits">
              {comments.map((c) => {
                const own = c.mine || c.author?.id === viewerId;
                const helpfulCount = comments.filter((x) => x.helpful).length;
                const canMark = r.mine && !own;
                return (
                  <li key={c.id} className={clsx("rounded-xl border px-3 py-2", c.helpful ? "border-emerald-400/30 bg-emerald-400/[0.04]" : "border-white/[0.06] bg-white/[0.02]")}>
                    <p className="whitespace-pre-line text-sm text-slate-200">{c.body}</p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-500">
                        <CommunityAuthor author={c.author} /> · {ago(c.createdAt)}
                        {c.helpful && !canMark && <span className="ml-1.5 font-medium text-emerald-300">· {own ? "Votre avis a aidé" : "A aidé l'auteur"}</span>}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {canMark && (
                          <button
                            type="button"
                            aria-pressed={c.helpful}
                            disabled={marking === c.id || (!c.helpful && helpfulCount >= FEEDBACK_HELPFUL_MAX)}
                            onClick={() => void toggleHelpful(c)}
                            className={clsx(
                              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                              c.helpful ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-slate-300 hover:border-emerald-400/40 hover:text-white"
                            )}
                          >
                            {c.helpful && <span aria-hidden="true">✓ </span>}
                            Cet avis m&apos;a aidé
                          </button>
                        )}
                        <ContentActions
                          type="FEEDBACK_COMMENT"
                          id={c.id}
                          threadId={r.id}
                          mine={own}
                          canModerate={canModerate}
                          reported={reported.has(reportKey("FEEDBACK_COMMENT", c.id))}
                          onReported={() => onReported(reportKey("FEEDBACK_COMMENT", c.id))}
                          onDeleted={() => {
                            setComments((prev) => (prev ?? []).filter((x) => x.id !== c.id));
                            onChange({ ...r, commentCount: Math.max(0, r.commentCount - 1) });
                          }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {r.mine && comments !== null && comments.some((c) => !(c.mine || c.author?.id === viewerId)) && (
            <p className="text-[11px] text-slate-500">
              Marquez jusqu&apos;à {FEEDBACK_HELPFUL_MAX} avis qui vous ont aidé : leurs auteurs le verront, et cela compte dans leurs Réussites.
            </p>
          )}
          {!r.closed && (
            <div className="space-y-2">
              <label htmlFor={`avis-${r.id}-champ`} className="sr-only">
                Votre avis
              </label>
              <textarea
                id={`avis-${r.id}-champ`}
                value={draft}
                maxLength={FEEDBACK_COMMENT_MAX}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={r.mine ? "Précisez votre question ou remerciez…" : "Pourquoi celle-ci ? Un conseil pour l'améliorer ?"}
                className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] tabular-nums text-slate-500">
                  {draft.length}/{FEEDBACK_COMMENT_MAX}
                </span>
                <Button type="button" onClick={() => void sendComment()} disabled={draft.trim().length < 2 || sending} className="!px-3 !py-1.5 text-xs">
                  {sending ? "Envoi…" : "Envoyer mon avis"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
