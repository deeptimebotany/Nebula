"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { PremiumName } from "@/components/ui/premium-name";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { useSession } from "next-auth/react";
import { clsx } from "@/lib/clsx";
import { computePremiumInfo } from "@/lib/premium";

const CATEGORY_LABEL: Record<string, string> = {
  GENERAL: "Général",
  AIDE: "Aide",
  SUGGESTIONS: "Suggestions",
  SHOWCASE: "Vitrine"
};

interface AuthorInfo {
  id: string;
  name: string;
  subscription: { plan: string; status: string; createdAt: string } | null;
}

interface Reply {
  id: string;
  body: string;
  createdAt: string;
  author: AuthorInfo;
}

interface Thread {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  author: AuthorInfo;
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

  if (!thread) return <p className="text-sm text-slate-500">Chargement...</p>;

  const userId = (session?.user as { id?: string } | undefined)?.id;
  const authorPremium = computePremiumInfo(thread.author?.subscription);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/community" className="text-xs text-slate-500 hover:text-slate-300">← Retour à la communauté</Link>

      <GlassCard className={clsx(authorPremium.isPremium && "glow-border-gold")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-400">
              {CATEGORY_LABEL[thread.category] ?? thread.category}
            </span>
            <h1 className="mt-2 font-display text-xl font-semibold text-white">{thread.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              par <PremiumName name={thread.author?.name ?? "utilisateur"} isPremium={authorPremium.isPremium} />
              {authorPremium.tenureTier && authorPremium.tenureLabel && (
                <PremiumBadge tier={authorPremium.tenureTier} label={authorPremium.tenureLabel} />
              )}
              · {new Date(thread.createdAt).toLocaleString("fr-FR")}
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
        {thread.replies.map((r) => {
          const replyPremium = computePremiumInfo(r.author?.subscription);
          return (
          <GlassCard key={r.id} className={clsx(replyPremium.isPremium && "glow-border-gold")}>
            <p className="whitespace-pre-wrap text-sm text-slate-200">{r.body}</p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <PremiumName name={r.author?.name ?? "utilisateur"} isPremium={replyPremium.isPremium} />
              {replyPremium.tenureTier && replyPremium.tenureLabel && (
                <PremiumBadge tier={replyPremium.tenureTier} label={replyPremium.tenureLabel} />
              )}
              · {new Date(r.createdAt).toLocaleString("fr-FR")}
            </p>
          </GlassCard>
          );
        })}
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
