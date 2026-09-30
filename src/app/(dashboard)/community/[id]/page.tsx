"use client";

import { CommunityAuthor, type CommunityAuthorInfo } from "@/components/reussites/community-author";
import { useEffect, useState, useCallback } from "react";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { useSession } from "next-auth/react";
import { ContentActions } from "@/components/community/content-actions";
import { reportKey } from "@/lib/community/report-reasons";

const CATEGORY_LABEL: Record<string, string> = {
  GENERAL: "Général",
  AIDE: "Aide",
  SUGGESTIONS: "Suggestions",
  SHOWCASE: "Vitrine"
};

interface Reply {
  id: string;
  body: string;
  createdAt: string;
  author: CommunityAuthorInfo;
}

interface Thread {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  author: CommunityAuthorInfo;
  replies: Reply[];
}

export default function ThreadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();

  const [thread, setThread] = useState<Thread | null>(null);
  // Modération (30/09/2026) : contenus déjà signalés, droit de supprimer.
  const [canModerate, setCanModerate] = useState(false);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/community/threads/${params.id}`);
    const data = await res.json();
    if (res.ok) {
      setThread(data.thread);
      setCanModerate(Boolean(data.viewer?.canModerate));
      setReported(new Set<string>(data.viewer?.reported ?? []));
    }
  }, [params.id]);

  const markReported = (key: string) => setReported((prev) => new Set(prev).add(key));

  // Lien direct vers une réponse (#reponse-…, ex. depuis une alerte de
  // signalement) : on y descend une fois la discussion chargée.
  useEffect(() => {
    if (!thread || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [thread]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    const res = await fetch(`/api/community/threads/${params.id}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply })
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors de la réponse.");
      return;
    }
    setReply("");
    load();
  }

  if (!thread) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-7 w-2/3" />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={2} />
        <span className="sr-only">Chargement de la discussion</span>
      </div>
    );
  }

  const userId = (session?.user as { id?: string } | undefined)?.id;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/community" className="text-xs text-slate-500 hover:text-slate-300">← Retour à la communauté</Link>

      <GlassCard>
        <div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-400">
            {CATEGORY_LABEL[thread.category] ?? thread.category}
          </span>
          <h1 className="mt-2 font-display text-xl font-semibold text-white">{thread.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            par <CommunityAuthor author={thread.author} /> · {new Date(thread.createdAt).toLocaleString("fr-FR")}
          </p>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-200">{thread.body}</p>
        <ContentActions
          className="mt-4 justify-end border-t border-white/[0.06] pt-3"
          type="THREAD"
          id={thread.id}
          mine={userId === thread.author?.id}
          canModerate={canModerate}
          reported={reported.has(reportKey("THREAD", thread.id))}
          onReported={() => markReported(reportKey("THREAD", thread.id))}
          onDeleted={() => router.push("/community")}
        />
      </GlassCard>

      <div className="space-y-3">
        <h2 className="font-display text-sm font-medium text-white">{thread.replies.length} réponse(s)</h2>
        {thread.replies.map((r) => (
          <GlassCard key={r.id} id={`reponse-${r.id}`} className="scroll-mt-24">
            <p className="whitespace-pre-wrap text-sm text-slate-200">{r.body}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                <CommunityAuthor author={r.author} /> · {new Date(r.createdAt).toLocaleString("fr-FR")}
              </p>
              <ContentActions
                type="REPLY"
                id={r.id}
                threadId={thread.id}
                mine={userId === r.author?.id}
                canModerate={canModerate}
                reported={reported.has(reportKey("REPLY", r.id))}
                onReported={() => markReported(reportKey("REPLY", r.id))}
                onDeleted={() => void load()}
              />
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Écrire une réponse..."
          rows={3}
          maxLength={3000}
          className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
        />
        <div className="mt-2 flex justify-end">
          <Button onClick={sendReply} disabled={sending || !reply.trim()}>{sending ? "Envoi..." : "Répondre"}</Button>
        </div>
      </GlassCard>
    </div>
  );
}
