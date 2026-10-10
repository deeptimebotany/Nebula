"use client";

// Onglet « Mentions » de la Communauté (10/10/2026, demande de Lucas) : tous
// les endroits où quelqu'un vous a mentionné (@pseudo) — sujet, réponse du
// forum, demande d'avis, avis écrit — du plus récent au plus ancien. Ouvrir
// l'onglet les marque comme vues.
import Link from "next/link";
import { useEffect, useState } from "react";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CommunityAuthor } from "@/components/reussites/community-author";
import { MemberAvatar } from "@/components/community/member-avatar";
import { MentionText } from "@/components/community/mention-text";
import { clsx } from "@/lib/clsx";
import type { MentionDTO } from "@/lib/community/mentions";

const KIND_LABEL: Record<MentionDTO["kind"], string> = {
  thread: "dans un sujet",
  reply: "dans une réponse",
  request: "dans une demande d'avis",
  comment: "dans un avis"
};

function ago(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d < 30 ? `il y a ${d} j` : new Date(iso).toLocaleDateString("fr-FR");
}

export function MentionsTab({ onRead }: { onRead: () => void }) {
  const [mentions, setMentions] = useState<MentionDTO[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/community/mentions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { mentions?: MentionDTO[]; unread?: number } | null) => {
        if (!alive) return;
        setMentions(d?.mentions ?? []);
        if ((d?.unread ?? 0) > 0) {
          void fetch("/api/community/mentions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read" }) }).catch(() => undefined);
        }
        onRead();
      })
      .catch(() => alive && setMentions([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mentions === null) {
    return (
      <div className="space-y-3" aria-busy="true">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <span className="sr-only">Chargement des mentions</span>
      </div>
    );
  }

  if (mentions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center" data-testid="mentions-empty">
        <p className="text-sm font-medium text-white">Personne ne vous a encore mentionné</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
          Quand un membre écrit votre @pseudo dans un sujet, une réponse ou un avis, vous recevez une notification et le message apparaît ici. Vous aussi : tapez « @ » dans un message pour
          mentionner quelqu&apos;un.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/[0.06]" aria-label="Vos mentions" data-testid="mentions-list">
      {mentions.map((m) => (
        <li key={m.id} className="relative flex items-start gap-3 py-3.5">
          {!m.read && <span className="absolute -left-2 top-6 h-1.5 w-1.5 rounded-full bg-aurora-400" aria-label="Nouvelle" role="img" />}
          <MemberAvatar author={m.author} size={36} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
              <CommunityAuthor author={m.author} />
              <span>vous a mentionné {KIND_LABEL[m.kind]}</span>
              <span className="text-slate-500">· {ago(m.createdAt)}</span>
            </p>
            <Link href={m.href} className="mt-0.5 block truncate text-sm font-medium text-white hover:underline">
              {m.context}
            </Link>
            <p className={clsx("mt-1 line-clamp-3 whitespace-pre-line break-words text-sm", m.read ? "text-slate-400" : "text-slate-200")}>
              <MentionText text={m.excerpt} />
            </p>
            <Link href={m.href} className="mt-1.5 inline-block text-xs font-medium text-aurora-300 hover:text-white">
              Voir le message →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
