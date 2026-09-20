"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/ui/network-badge";
import { useToast } from "@/components/dashboard/toast";
import { clsx } from "@/lib/clsx";
import { IconUsers, IconMessage, IconHeart, IconTrophy } from "@/components/dashboard/icons";
import type { Network } from "@/lib/types";
import type { EarnedBadge } from "@/lib/badges";

type Tab = "forum" | "guides" | "videos";

const CATEGORY_LABEL: Record<string, string> = {
  GENERAL: "Général",
  AIDE: "Aide",
  SUGGESTIONS: "Suggestions",
  SHOWCASE: "Vitrine"
};

interface Thread {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  createdAt: string;
  author: { id: string; name: string };
  _count: { replies: number };
}

interface Guide {
  id: string;
  slug: string;
  title: string;
  summary: string;
}

interface SharedVideo {
  id: string;
  title: string;
  network: Network;
  externalUrl: string;
  thumbnailUrl: string | null;
  note: string | null;
  createdAt: string;
  author: { id: string; name: string };
}

export default function CommunityPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("forum");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [videos, setVideos] = useState<SharedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<EarnedBadge[] | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState("GENERAL");
  const [posting, setPosting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [tRes, gRes, vRes] = await Promise.all([
      fetch("/api/community/threads"),
      fetch("/api/community/guides"),
      fetch("/api/community/videos")
    ]);
    const [tData, gData, vData] = await Promise.all([tRes.json(), gRes.json(), vRes.json()]);
    if (tRes.ok) setThreads(tData.threads ?? []);
    if (gRes.ok) setGuides(gData.guides ?? []);
    if (vRes.ok) setVideos(vData.videos ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    fetch("/api/community/badges")
      .then((r) => r.json())
      .then((d) => setBadges(d.badges ?? []))
      .catch(() => undefined);
  }, []);

  async function createThread() {
    if (!newTitle.trim() || !newBody.trim()) {
      toast.error("Ajoutez un titre et un message.");
      return;
    }
    setPosting(true);
    const res = await fetch("/api/community/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, body: newBody, category: newCategory })
    });
    const data = await res.json();
    setPosting(false);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors de la publication.");
      return;
    }
    setNewTitle("");
    setNewBody("");
    setComposerOpen(false);
    toast.success("Discussion publiée.");
    loadAll();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-nebula-500 to-accent-cyan text-white shadow-glow">
            <IconUsers className="h-4 w-4" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-white">Communauté</h1>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Un espace public, ouvert à tous les utilisateurs de Nebula : entraide, guides et partage de vidéos déjà publiées.
        </p>
      </div>

      {badges && badges.some((b) => b.count > 0 || b.nextThreshold !== null) && (
        <GlassCard>
          <div className="mb-3 flex items-center gap-2">
            <IconTrophy className="h-4 w-4 text-amber-300" />
            <h2 className="font-display text-base font-medium text-white">Vos badges</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {badges.map((b) => (
              <div key={b.category} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{b.label}</p>
                  {b.tier && (
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        b.tier === "or"
                          ? "bg-amber-400/15 text-amber-300"
                          : b.tier === "argent"
                            ? "bg-slate-300/15 text-slate-200"
                            : "bg-orange-700/20 text-orange-300"
                      )}
                    >
                      {b.tier}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {b.nextThreshold !== null
                    ? `${b.count} / ${b.nextThreshold} pour le palier ${b.nextTier}`
                    : `${b.count} — palier maximum atteint`}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.015] p-1">
        {(
          [
            ["forum", "Forum"],
            ["guides", "Guides"],
            ["videos", "Vidéos du jour"]
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === id ? "bg-gradient-to-r from-nebula-700/60 to-nebula-600/20 text-white shadow-glow" : "text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-500">Chargement...</p>}

      {!loading && tab === "forum" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setComposerOpen((v) => !v)} variant={composerOpen ? "outline" : "glow"}>
              {composerOpen ? "Annuler" : "Nouvelle discussion"}
            </Button>
          </div>

          {composerOpen && (
            <GlassCard>
              <div className="space-y-3">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Titre de votre discussion"
                  maxLength={160}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
                />
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Votre message..."
                  rows={4}
                  maxLength={5000}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
                />
                <div className="flex items-center justify-between">
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs text-white outline-none focus:border-aurora-400/60"
                  >
                    {Object.entries(CATEGORY_LABEL).map(([id, label]) => (
                      <option key={id} value={id} className="bg-void-900">{label}</option>
                    ))}
                  </select>
                  <Button onClick={createThread} disabled={posting}>{posting ? "Publication..." : "Publier"}</Button>
                </div>
              </div>
            </GlassCard>
          )}

          <div className="space-y-2">
            {threads.map((t) => (
              <Link key={t.id} href={`/community/${t.id}`}>
                <GlassCard className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {t.pinned && <span className="text-xs">📌</span>}
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-400">
                        {CATEGORY_LABEL[t.category] ?? t.category}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-display text-sm font-medium text-white">{t.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      par {t.author?.name ?? "utilisateur"} · {new Date(t.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                    <IconMessage className="h-4 w-4" /> {t._count.replies}
                  </div>
                </GlassCard>
              </Link>
            ))}
            {threads.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">Aucune discussion pour l&apos;instant — lancez la première !</p>
            )}
          </div>
        </div>
      )}

      {!loading && tab === "guides" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {guides.map((g) => (
            <Link key={g.id} href={`/community/guides/${g.slug}`}>
              <GlassCard className="h-full">
                <h3 className="font-display text-base font-medium text-white">{g.title}</h3>
                <p className="mt-1.5 text-sm text-slate-400">{g.summary}</p>
              </GlassCard>
            </Link>
          ))}
          {guides.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-slate-500">
              Aucun guide disponible encore sur cette instance.
            </p>
          )}
        </div>
      )}

      {!loading && tab === "videos" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <a key={v.id} href={v.externalUrl} target="_blank" rel="noreferrer">
              <GlassCard className="h-full overflow-hidden p-0">
                <div className="aspect-video w-full bg-black/40">
                  {v.thumbnailUrl ? (
                    <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-600">
                      <IconHeart className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 p-3.5">
                  <NetworkBadge network={v.network} size="sm" />
                  <p className="truncate text-sm font-medium text-white">{v.title}</p>
                  {v.note && <p className="text-xs text-slate-400">{v.note}</p>}
                  <p className="text-xs text-slate-500">
                    partagé par {v.author?.name ?? "utilisateur"} · {new Date(v.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </GlassCard>
            </a>
          ))}
          {videos.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-slate-500">
              Aucune vidéo partagée pour l&apos;instant — depuis une publication déjà en ligne, utilisez le bouton
              &laquo; Partager avec la communauté &raquo;.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
