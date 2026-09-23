"use client";

import { useEffect, useState, useCallback } from "react";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { useSession } from "next-auth/react";

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
  author: { id: string; name: string };
}

interface Thread {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  author: { id: string; name: string };
  replies: Reply[];
}

export default function ThreadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { data: session } = useSession();

  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/community/threads/${params.id}`);
    const data = await res.json();
    if (res.ok) setThread(data.thread);
  }, [params.id]);

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

  async function remove() {
    const ok = await confirmDialog({
      title: "Supprimer cette discussion ?",
      message: "Elle sera retirée du forum ainsi que toutes ses réponses. Action définitive.",
      confirmLabel: "Supprimer",
      danger: true
    });
    if (!ok) return;
    const res = await fetch(`/api/community/threads/${params.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors de la suppression.");
      return;
    }
    toast.success("Discussion supprimée.");
    router.push("/community");
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-400">
              {CATEGORY_LABEL[thread.category] ?? thread.category}
            </span>
            <h1 className="mt-2 font-display text-xl font-semibold text-white">{thread.title}</h1>
            <p className="mt-1 text-xs text-slate-500">
              par {thread.author?.name ?? "utilisateur"} · {new Date(thread.createdAt).toLocaleString("fr-FR")}
            </p>
          </div>
          {userId === thread.author?.id && (
            <Button variant="danger" onClick={remove}>Supprimer</Button>
          )}
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-200">{thread.body}</p>
      </GlassCard>

      <div className="space-y-3">
        <h2 className="font-display text-sm font-medium text-white">{thread.replies.length} réponse(s)</h2>
        {thread.replies.map((r) => (
          <GlassCard key={r.id}>
            <p className="whitespace-pre-wrap text-sm text-slate-200">{r.body}</p>
            <p className="mt-2 text-xs text-slate-500">
              {r.author?.name ?? "utilisateur"} · {new Date(r.createdAt).toLocaleString("fr-FR")}
            </p>
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
