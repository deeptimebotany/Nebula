"use client";

// Sujet du forum, façon commentaires YouTube (10/10/2026, demande de Lucas) :
//  - le sujet, puis « Ajouter une réponse » ;
//  - chaque réponse : photo (bulle de profil au clic), @pseudo (page de
//    profil), date, texte, J'aime (avec le nombre), Je n'aime pas (sans
//    nombre), Répondre ;
//  - les réponses à une réponse sont repliées derrière « N réponses », sous
//    un trait qui descend ; répondre à quelqu'un dans un fil le mentionne.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CommunityAuthor } from "@/components/reussites/community-author";
import { MemberAvatar } from "@/components/community/member-avatar";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { useBootstrap } from "@/components/bootstrap-provider";
import { ContentActions } from "@/components/community/content-actions";
import { reportKey } from "@/lib/community/report-reasons";
import { clsx } from "@/lib/clsx";
import type { ForumReplyDTO, ForumThreadDTO, ForumVote } from "@/lib/community/forum";

const CATEGORY_LABEL: Record<string, string> = {
  GENERAL: "Général",
  AIDE: "Aide",
  SUGGESTIONS: "Suggestions",
  SHOWCASE: "Vitrine"
};

/** Réponses d'un fil montrées d'un coup (puis « Afficher plus de réponses »). */
const CHILD_PAGE = 10;

function ago(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  const y = Math.round(mo / 12);
  return `il y a ${y} an${y > 1 ? "s" : ""}`;
}

function ThumbIcon({ down = false, filled = false }: { down?: boolean; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={clsx("h-[18px] w-[18px]", down && "rotate-180")} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4-8a3 3 0 0 1 3 3v4h5.6a2 2 0 0 1 2 2.3l-1.3 7a2 2 0 0 1-2 1.7H7" />
    </svg>
  );
}

function VoteBar({
  likes,
  myVote,
  onVote,
  onReply,
  busy
}: {
  likes: number;
  myVote: ForumVote;
  onVote: (v: ForumVote) => void;
  onReply?: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1 text-slate-300">
      <button
        type="button"
        disabled={busy}
        onClick={() => onVote(myVote === "like" ? null : "like")}
        aria-pressed={myVote === "like"}
        aria-label={myVote === "like" ? "Retirer mon j'aime" : "J'aime"}
        data-testid="vote-like"
        className={clsx("inline-flex h-8 items-center gap-1.5 rounded-full px-2 transition hover:bg-white/[0.08]", myVote === "like" && "text-white")}
      >
        <ThumbIcon filled={myVote === "like"} />
        {likes > 0 && <span className="text-xs tabular-nums">{likes.toLocaleString("fr-FR")}</span>}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onVote(myVote === "dislike" ? null : "dislike")}
        aria-pressed={myVote === "dislike"}
        aria-label={myVote === "dislike" ? "Retirer mon je n'aime pas" : "Je n'aime pas"}
        data-testid="vote-dislike"
        className={clsx("inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/[0.08]", myVote === "dislike" && "text-white")}
      >
        <ThumbIcon down filled={myVote === "dislike"} />
      </button>
      {onReply && (
        <button type="button" onClick={onReply} className="ml-1 h-8 rounded-full px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] hover:text-white">
          Répondre
        </button>
      )}
    </div>
  );
}

function Composer({
  placeholder,
  initial = "",
  autoFocus = false,
  compact = false,
  onCancel,
  onSend
}: {
  placeholder: string;
  initial?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onCancel?: () => void;
  onSend: (body: string) => Promise<boolean>;
}) {
  const { data: me } = useBootstrap();
  const [text, setText] = useState(initial);
  const [focused, setFocused] = useState(autoFocus);
  const [sending, setSending] = useState(false);
  const meAuthor = me?.user ? { id: me.user.id, name: me.user.handle ? `@${me.user.handle}` : "@membre", handle: me.user.handle, avatarUrl: me.user.avatarUrl } : null;
  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onSend(text.trim());
    setSending(false);
    if (ok) {
      setText("");
      setFocused(false);
      onCancel?.();
    }
  }
  return (
    <div className="flex items-start gap-3">
      <MemberAvatar author={meAuthor} size={compact ? 26 : 38} interactive={false} />
      <div className="min-w-0 flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={focused || text ? 2 : 1}
          maxLength={3000}
          aria-label={placeholder}
          className="w-full resize-none border-b border-white/15 bg-transparent pb-1.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-white/60"
        />
        {(focused || text) && (
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setText("");
                setFocused(false);
                onCancel?.();
              }}
              className="h-9 rounded-full px-4 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Annuler
            </button>
            <Button onClick={() => void send()} disabled={sending || !text.trim()} className="rounded-full">
              {sending ? "Envoi…" : "Répondre"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ThreadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: me } = useBootstrap();
  const userId = me?.user?.id;

  const [thread, setThread] = useState<ForumThreadDTO | null>(null);
  const [missing, setMissing] = useState(false);
  // Modération (30/09/2026) : contenus déjà signalés, droit de supprimer.
  const [canModerate, setCanModerate] = useState(false);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Record<string, number>>({});
  const [replyTo, setReplyTo] = useState<{ topId: string; to: ForumReplyDTO } | null>(null);
  const [voting, setVoting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/community/threads/${params.id}`, { cache: "no-store" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { thread?: ForumThreadDTO; viewer?: { canModerate?: boolean; reported?: string[] } } | null;
    if (res?.ok && data?.thread) {
      setThread(data.thread);
      setCanModerate(Boolean(data.viewer?.canModerate));
      setReported(new Set<string>(data.viewer?.reported ?? []));
    } else if (res?.status === 404) setMissing(true);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Lien direct vers une réponse (#reponse-…, ex. depuis une notification) :
  // on ouvre son fil puis on y descend.
  useEffect(() => {
    if (!thread || !window.location.hash.startsWith("#reponse-")) return;
    const id = window.location.hash.slice("#reponse-".length);
    const target = thread.replies.find((r) => r.id === id);
    if (target?.parentId) setOpen((prev) => new Set(prev).add(target.parentId as string));
    window.setTimeout(() => document.getElementById(`reponse-${id}`)?.scrollIntoView({ block: "center" }), 60);
  }, [thread]);

  const { tops, children } = useMemo(() => {
    const kids = new Map<string, ForumReplyDTO[]>();
    const top: ForumReplyDTO[] = [];
    for (const r of thread?.replies ?? []) {
      if (r.parentId) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r]);
      else top.push(r);
    }
    return { tops: top, children: kids };
  }, [thread]);

  const markReported = (key: string) => setReported((prev) => new Set(prev).add(key));

  async function vote(target: { threadId?: string; replyId?: string }, value: ForumVote) {
    if (!thread) return;
    const key = target.threadId ?? target.replyId ?? "";
    setVoting(key);
    const res = await fetch("/api/community/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, value }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { likes?: number; myVote?: ForumVote; error?: string } | null;
    setVoting(null);
    if (!res?.ok || typeof data?.likes !== "number") {
      toast.error(data?.error ?? "Vote impossible pour le moment.");
      return;
    }
    const patch = { likes: data.likes, myVote: data.myVote ?? null };
    setThread((t) =>
      t
        ? target.threadId
          ? { ...t, ...patch }
          : { ...t, replies: t.replies.map((r) => (r.id === target.replyId ? { ...r, ...patch } : r)) }
        : t
    );
  }

  async function send(body: string, parentId: string | null): Promise<boolean> {
    const res = await fetch(`/api/community/threads/${params.id}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentId })
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { reply?: ForumReplyDTO; error?: string } | null;
    if (!res?.ok || !data?.reply) {
      toast.error(data?.error ?? "Réponse non envoyée : réessayez dans un instant.");
      return false;
    }
    const reply = data.reply;
    setThread((t) => (t ? { ...t, replies: [...t.replies, reply] } : t));
    if (reply.parentId) {
      setOpen((prev) => new Set(prev).add(reply.parentId as string));
      setShown((prev) => ({ ...prev, [reply.parentId as string]: Math.max(prev[reply.parentId as string] ?? CHILD_PAGE, (children.get(reply.parentId as string)?.length ?? 0) + 1) }));
    }
    return true;
  }

  // Fonction (pas un composant) : la zone de réponse ouverte garde son texte quand la page se met à jour.
  function renderMessage(r: ForumReplyDTO, child = false) {
    const topId = r.parentId ?? r.id;
    return (
      <div id={`reponse-${r.id}`} className="flex scroll-mt-24 items-start gap-3" data-testid={child ? "forum-child" : "forum-reply"}>
        <MemberAvatar author={r.author} size={child ? 26 : 38} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
            <CommunityAuthor author={r.author} />
            <span className="text-slate-500">{ago(r.createdAt)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-100">{r.body}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VoteBar likes={r.likes} myVote={r.myVote} busy={voting === r.id} onVote={(v) => void vote({ replyId: r.id }, v)} onReply={() => setReplyTo({ topId, to: r })} />
            <ContentActions
              type="REPLY"
              id={r.id}
              threadId={thread?.id}
              mine={userId === r.author?.id}
              canModerate={canModerate}
              reported={reported.has(reportKey("REPLY", r.id))}
              onReported={() => markReported(reportKey("REPLY", r.id))}
              onDeleted={() => void load()}
            />
          </div>
          {replyTo?.to.id === r.id && (
            <div className="mt-2">
              <Composer
                compact
                autoFocus
                placeholder="Ajouter une réponse…"
                initial={child && r.author?.name ? `${r.author.name} ` : ""}
                onCancel={() => setReplyTo(null)}
                onSend={(body) => send(body, topId)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-10 text-center">
        <p className="text-sm text-slate-300">Ce sujet n&apos;existe plus.</p>
        <Link href="/community" className="text-sm text-aurora-300 hover:text-white">
          ← Retour à la communauté
        </Link>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="mx-auto max-w-3xl space-y-4" aria-busy="true">
        <Skeleton className="h-7 w-2/3" />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={2} />
        <span className="sr-only">Chargement de la discussion</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/community" className="text-xs text-slate-500 hover:text-slate-300">
        ← Retour à la communauté
      </Link>

      {/* Le sujet */}
      <article className="flex items-start gap-3">
        <MemberAvatar author={thread.author} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-400">{CATEGORY_LABEL[thread.category] ?? thread.category}</span>
            <CommunityAuthor author={thread.author} />
            <span className="text-slate-500">{ago(thread.createdAt)}</span>
          </div>
          <h1 className="mt-2 font-display text-xl font-semibold text-white">{thread.title}</h1>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{thread.body}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VoteBar likes={thread.likes} myVote={thread.myVote} busy={voting === thread.id} onVote={(v) => void vote({ threadId: thread.id }, v)} />
            <ContentActions
              type="THREAD"
              id={thread.id}
              mine={userId === thread.author?.id}
              canModerate={canModerate}
              reported={reported.has(reportKey("THREAD", thread.id))}
              onReported={() => markReported(reportKey("THREAD", thread.id))}
              onDeleted={() => router.push("/community")}
            />
          </div>
        </div>
      </article>

      <section aria-labelledby="reponses-titre" className="space-y-5 border-t border-white/[0.06] pt-5">
        <h2 id="reponses-titre" className="font-display text-base font-semibold text-white">
          {thread.replies.length} réponse{thread.replies.length > 1 ? "s" : ""}
        </h2>
        <Composer placeholder="Ajouter une réponse…" onSend={(body) => send(body, null)} />

        <div className="space-y-5">
          {tops.map((r) => {
            const kids = children.get(r.id) ?? [];
            const isOpen = open.has(r.id);
            const limit = shown[r.id] ?? CHILD_PAGE;
            return (
              <div key={r.id}>
                {renderMessage(r)}
                {kids.length > 0 && (
                  <div className="relative ml-[19px] pl-[31px]">
                    {/* Le trait qui descend depuis la photo, puis le coude vers chaque fil. */}
                    <span aria-hidden="true" className="absolute left-0 top-0 h-[22px] w-5 rounded-bl-xl border-b border-l border-white/15" />
                    {isOpen && <span aria-hidden="true" className="absolute bottom-6 left-0 top-[22px] border-l border-white/15" />}
                    <button
                      type="button"
                      onClick={() => setOpen((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })}
                      aria-expanded={isOpen}
                      data-testid="toggle-replies"
                      className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-aurora-500/[0.14] px-3.5 text-sm font-semibold text-aurora-200 transition hover:bg-aurora-500/[0.24]"
                    >
                      {kids.length} réponse{kids.length > 1 ? "s" : ""}
                      <svg viewBox="0 0 24 24" className={clsx("h-4 w-4 transition", isOpen && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="mt-3 space-y-4">
                        {kids.slice(0, limit).map((c) => (
                          <div key={c.id} className="relative">
                            <span aria-hidden="true" className="absolute -left-[31px] top-0 h-[13px] w-6 rounded-bl-xl border-b border-l border-white/15" />
                            {renderMessage(c, true)}
                          </div>
                        ))}
                        {kids.length > limit && (
                          <button
                            type="button"
                            onClick={() => setShown((prev) => ({ ...prev, [r.id]: limit + CHILD_PAGE }))}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                          >
                            Afficher plus de réponses
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
