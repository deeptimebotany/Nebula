"use client";

// Communauté — refonte « flux central + colonne discrète ». Avant : le
// classement des parrainages, le compteur d'easter eggs et la grille de
// badges s'empilaient AU-DESSUS du forum, qui arrivait en troisième écran.
// Maintenant :
//   - le flux (Forum / Avis / Vidéos) occupe toute la largeur centrale ;
//     (onglet Guides retiré le 10/10/2026, demande de Lucas : les questions
//     passent par « Demander à Nebula » et ses suggestions) ;
//   - une fine colonne à droite porte une mini-carte profil (nom, badges,
//     progression des easter eggs) et le top 3 des parrains — chacune ouvre
//     le panneau « Mon profil » (profile-panel.tsx) pour le détail ;
//   - le parrainage devient une bannière d'une ligne, sous l'en-tête.
// Sur téléphone, la colonne passe sous le flux.

import { CommunityAuthor, type CommunityAuthorInfo } from "@/components/reussites/community-author";
import { FeaturedStrip } from "@/components/reussites/featured-strip";
import type { RingStyle } from "@/lib/reussites/catalog";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/ui/network-badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { useToast } from "@/components/dashboard/toast";
import { useBootstrap } from "@/components/bootstrap-provider";
import { openProfilePanel } from "@/components/dashboard/profile-panel-events";
import { clsx } from "@/lib/clsx";
import { IconUsers, IconMessage, IconHeart, IconTrophy, IconGift, IconChevronRight } from "@/components/dashboard/icons";
import type { Network } from "@/lib/types";
import type { EarnedBadge } from "@/lib/badges";
import { ContentActions } from "@/components/community/content-actions";
import { reportKey } from "@/lib/community/report-reasons";
import { FeedbackTab } from "@/components/community/feedback/feedback-tab";
import { CommunityHome } from "@/components/community/community-home";
import { MentionsTab } from "@/components/community/mentions-tab";
import { MentionTextarea } from "@/components/community/mention-textarea";
import { MemberAvatar, handleInitial } from "@/components/community/member-avatar";

// 10/10/2026 (demande de Lucas) : « Accueil » façon YouTube, ouvert par défaut.
type Tab = "accueil" | "forum" | "avis" | "videos" | "mentions";

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
  author: CommunityAuthorInfo & { ring?: RingStyle | null };
  _count: { replies: number };
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

interface LeaderboardRow {
  id: string;
  displayName: string;
  referrals: number;
  isMe: boolean;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diff / 3600000);
  if (hours < 1) return "à l'instant";
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

const TIER_CLASS: Record<string, string> = {
  or: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  argent: "bg-slate-300/15 text-slate-200 border-slate-300/30",
  bronze: "bg-orange-700/20 text-orange-300 border-orange-500/30"
};

export default function CommunityPage() {
  const toast = useToast();
  const { data: me } = useBootstrap();
  const [tab, setTab] = useState<Tab>("accueil");
  const [category, setCategory] = useState<string | "all">("all");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [videos, setVideos] = useState<SharedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Modération (30/09/2026) : contenus déjà signalés par ce compte, et droit
  // de supprimer ceux des autres (propriétaire du site).
  const [canModerate, setCanModerate] = useState(false);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const markReported = (key: string) => setReported((prev) => new Set(prev).add(key));

  // Colonne de droite + bannière : chargées à part, jamais bloquantes.
  const [badges, setBadges] = useState<EarnedBadge[] | null>(null);
  const [eggCount, setEggCount] = useState<{ found: number; total: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState("GENERAL");
  const [posting, setPosting] = useState(false);
  // Avis de la communauté (02/10/2026) : demandes en attente de mon vote.
  const [feedbackCount, setFeedbackCount] = useState(0);
  // Mentions @pseudo (10/10/2026) : non lues, pastille de l'onglet Mentions.
  const [mentionsUnread, setMentionsUnread] = useState(0);

  // Aucune dépendance : le chargement ne doit se relancer que sur demande
  // (après une publication), jamais parce qu'un contexte a été re-rendu.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [tRes, vRes] = await Promise.all([fetch("/api/community/threads"), fetch("/api/community/videos")]);
      const [tData, vData] = await Promise.all([tRes.json(), vRes.json()]);
      if (tRes.ok) setThreads(tData.threads ?? []);
      if (vRes.ok) setVideos(vData.videos ?? []);
      setCanModerate(Boolean(tData.viewer?.canModerate || vData.viewer?.canModerate));
      setReported(new Set<string>([...(tData.viewer?.reported ?? []), ...(vData.viewer?.reported ?? [])]));
    } catch {
      setLoadError("Impossible de charger la communauté. Réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Lien direct vers l'onglet des vidéos (?onglet=videos#video-…, ex. depuis
  // une alerte de signalement).
  useEffect(() => {
    const onglet = new URLSearchParams(window.location.search).get("onglet");
    if (onglet === "videos" || onglet === "avis" || onglet === "forum" || onglet === "accueil" || onglet === "mentions") setTab(onglet);
  }, []);
  useEffect(() => {
    if (loading || !window.location.hash.startsWith("#video-")) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [loading, tab]);

  // Mentions non lues : pastille de l'onglet Mentions.
  useEffect(() => {
    fetch("/api/community/mentions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => typeof d?.unread === "number" && setMentionsUnread(d.unread))
      .catch(() => undefined);
  }, []);

  // Demandes d'avis en attente de mon vote : pastille de l'onglet Avis.
  useEffect(() => {
    fetch("/api/community/feedback?scope=open", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.requests && setFeedbackCount((d.requests as { myHearts: string[] }[]).filter((x) => x.myHearts.length === 0).length))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/community/badges")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBadges(d?.badges ?? []))
      .catch(() => setBadges([]));
    fetch("/api/easter-eggs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEggCount({ found: d.foundCount ?? 0, total: d.total ?? 20 }))
      .catch(() => undefined);
    fetch("/api/referral/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLeaderboard(d?.leaderboard ?? []))
      .catch(() => setLeaderboard([]));
    fetch("/api/referral")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.code && setReferralCode(d.code))
      .catch(() => undefined);
  }, []);

  async function copyReferralLink() {
    if (!referralCode) {
      openProfilePanel("referral");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/register?ref=${referralCode}`);
      toast.success("Lien de parrainage copié.");
    } catch {
      openProfilePanel("referral");
    }
  }

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
    void loadAll();
  }

  const visibleThreads = useMemo(() => {
    const rows = category === "all" ? threads : threads.filter((t) => t.category === category);
    // Épinglées d'abord, puis les plus récentes.
    return [...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [threads, category]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of threads) c[t.category] = (c[t.category] ?? 0) + 1;
    return c;
  }, [threads]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<IconUsers className="h-5 w-5" />}
        title="Communauté"
        description="Entraide, avis avant de publier et vidéos partagées entre créateurs Nebula — un espace commun à tous."
        actions={
          tab === "forum" && (
            <Button onClick={() => setComposerOpen((v) => !v)} variant={composerOpen ? "outline" : "glow"}>
              {composerOpen ? "Annuler" : "Nouvelle discussion"}
            </Button>
          )
        }
      />

      {/* Bannière parrainage — une ligne, discrète */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-xs text-slate-400">
        <IconGift className="h-4 w-4 shrink-0 text-aurora-300" />
        <p className="min-w-0 flex-1 basis-56">
          <span className="text-slate-200">Parrainez un créateur</span> : il reçoit l&apos;assistant IA offert 14 jours, et chaque filleul abonné vous fait monter au classement.
        </p>
        <button type="button" onClick={copyReferralLink} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-200 transition hover:border-aurora-400/50 hover:text-white">
          Copier mon lien
        </button>
        <button type="button" onClick={() => openProfilePanel("referral")} className="inline-flex items-center gap-0.5 text-xs text-aurora-300 transition hover:text-white">
          Classement <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Accueil plein largeur ; les autres onglets gardent la colonne de droite. */}
      <div className={clsx("grid gap-6", tab !== "accueil" && "lg:grid-cols-[minmax(0,1fr)_272px]")}>
        {/* ---------- Flux central ---------- */}
        <div className="min-w-0 space-y-4">
          <div className="nb-tabrow gap-1" role="tablist" aria-label="Sections de la communauté">
            {(
              [
                ["accueil", "Accueil", 0],
                ["forum", "Forum", threads.length],
                ["avis", "Avis", feedbackCount],
                ["videos", "Vidéos du jour", videos.length],
                ["mentions", "Mentions", mentionsUnread]
              ] as [Tab, string, number][]
            ).map(([id, label, count]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[14px] transition",
                  tab === id ? "border-current font-semibold text-white" : "border-transparent text-slate-400 hover:text-white"
                )}
              >
                {label}
                {id === "mentions"
                  ? count > 0 && (
                      <span className="rounded-full bg-aurora-500 px-1.5 text-[11px] font-semibold tabular-nums text-white" aria-label={`${count} non lue${count > 1 ? "s" : ""}`}>
                        {count}
                      </span>
                    )
                  : !loading && count > 0 && <span className="text-[12px] font-normal tabular-nums text-slate-500">{count}</span>}
              </button>
            ))}
          </div>

          {loadError && (
            <GlassCard hover={false} className="border-red-500/30 bg-red-500/[0.06]">
              <p className="text-sm text-red-300">{loadError}</p>
            </GlassCard>
          )}

          {loading && tab !== "avis" && tab !== "mentions" && (
            <div className="space-y-3" aria-busy="true">
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
              <span className="sr-only">Chargement en cours</span>
            </div>
          )}

          {!loading && tab === "forum" && (
            <div className="space-y-3">
              {composerOpen && (
                <GlassCard hover={false} className="border-aurora-400/30">
                  <div className="space-y-3">
                    <input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Titre de votre discussion"
                      maxLength={160}
                      autoFocus
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
                    />
                    <MentionTextarea
                      value={newBody}
                      onValueChange={setNewBody}
                      placeholder="Votre message — contexte, ce que vous avez déjà essayé, ce que vous attendez…"
                      rows={4}
                      maxLength={5000}
                      className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Catégorie">
                        {Object.entries(CATEGORY_LABEL).map(([id, label]) => (
                          <FilterChip key={id} active={newCategory === id} onClick={() => setNewCategory(id)}>
                            {label}
                          </FilterChip>
                        ))}
                      </div>
                      <Button onClick={createThread} disabled={posting}>
                        {posting ? "Publication…" : "Publier"}
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              )}

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par catégorie">
                <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
                  Toutes
                </FilterChip>
                {Object.entries(CATEGORY_LABEL).map(([id, label]) => (
                  <FilterChip key={id} active={category === id} onClick={() => setCategory(id)}>
                    {label}
                    {counts[id] ? <span className="text-[10px] text-slate-500">{counts[id]}</span> : null}
                  </FilterChip>
                ))}
              </div>

              <div className="space-y-2">
                {visibleThreads.map((t) => (
                  // Titre en « lien étiré » sur toute la carte : les actions
                  // (Signaler, Supprimer) restent des boutons à part.
                  <GlassCard key={t.id} className="relative flex items-start gap-3">
                    <MemberAvatar author={t.author} size={36} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {t.pinned && (
                          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">Épinglé</span>
                        )}
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-400">{CATEGORY_LABEL[t.category] ?? t.category}</span>
                      </div>
                      <Link href={`/community/${t.id}`} className="mt-1 block truncate font-display text-sm font-medium text-white after:absolute after:inset-0 after:rounded-2xl after:content-['']">
                        {t.title}
                      </Link>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{t.body}</p>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="text-[11px] text-slate-500">
                          <CommunityAuthor author={t.author} /> · {relativeDate(t.createdAt)}
                        </p>
                        <ContentActions
                          className="relative z-10"
                          type="THREAD"
                          id={t.id}
                          mine={me?.user?.id === t.author?.id}
                          canModerate={canModerate}
                          reported={reported.has(reportKey("THREAD", t.id))}
                          onReported={() => markReported(reportKey("THREAD", t.id))}
                          onDeleted={() => setThreads((prev) => prev.filter((x) => x.id !== t.id))}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400" title={`${t._count.replies} réponse${t._count.replies > 1 ? "s" : ""}`}>
                      <IconMessage className="h-4 w-4" /> {t._count.replies}
                    </div>
                  </GlassCard>
                ))}
                {visibleThreads.length === 0 && (
                  <p className="py-10 text-center text-sm text-slate-500">
                    {threads.length === 0 ? "Aucune discussion pour l'instant — lancez la première !" : "Aucune discussion dans cette catégorie."}
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === "accueil" && (
            <CommunityHome
              videos={videos}
              threads={[...threads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
              loading={loading}
              onOpenTab={(t) => setTab(t)}
              onAskFeedback={() => setTab("avis")}
            />
          )}

          {tab === "avis" && <FeedbackTab viewerId={me?.user?.id ?? null} onCountChange={setFeedbackCount} />}
          {tab === "mentions" && <MentionsTab onRead={() => setMentionsUnread(0)} />}

          {tab === "videos" && <FeaturedStrip />}
          {!loading && tab === "videos" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {videos.map((v) => (
                <GlassCard key={v.id} id={`video-${v.id}`} className="relative h-full scroll-mt-24 overflow-hidden p-0">
                  <div className="aspect-video w-full bg-black/40">
                    {v.thumbnailUrl ? (
                      <RemoteImage src={v.thumbnailUrl} className="h-full w-full" sizes="(max-width: 640px) 100vw, 320px" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-500">
                        <IconHeart className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 p-3.5">
                    <NetworkBadge network={v.network} size="sm" />
                    {/* Lien étiré : toute la carte ouvre la vidéo, sauf les actions. */}
                    <a href={v.externalUrl} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-white after:absolute after:inset-0 after:content-['']">
                      {v.title}
                    </a>
                    {v.note && <p className="text-xs text-slate-400">{v.note}</p>}
                    <p className="text-xs text-slate-500">
                      partagé par {v.author?.name ?? "utilisateur"} · {relativeDate(v.createdAt)}
                    </p>
                    <ContentActions
                      className="relative z-10 pt-1"
                      type="VIDEO"
                      id={v.id}
                      mine={me?.user?.id === v.author?.id}
                      canModerate={canModerate}
                      reported={reported.has(reportKey("VIDEO", v.id))}
                      onReported={() => markReported(reportKey("VIDEO", v.id))}
                      onDeleted={() => setVideos((prev) => prev.filter((x) => x.id !== v.id))}
                    />
                  </div>
                </GlassCard>
              ))}
              {videos.length === 0 && (
                <p className="col-span-full py-10 text-center text-sm text-slate-500">
                  Aucune vidéo partagée pour l&apos;instant — depuis une publication déjà en ligne, utilisez le bouton &laquo; Partager avec la communauté &raquo;.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ---------- Colonne droite ---------- */}
        {tab !== "accueil" && (
        <aside className="space-y-4 lg:sticky lg:top-[calc(var(--nb-topbar-offset)_+_16px)] lg:self-start">
          {/* Mini-carte profil */}
          <GlassCard hover={false} className="p-4">
            <div className="flex items-center gap-3">
              {me?.user?.avatarUrl ? (
                <RemoteImage src={me.user.avatarUrl} className="h-10 w-10 shrink-0 rounded-full" sizes="40px" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-nebula-600/70 to-accent-cyan/40 text-sm font-semibold text-white">{handleInitial(me?.user?.handle)}</span>
              )}
              <div className="min-w-0 flex-1">
                {/* Pseudo, jamais le nom (10/10/2026) ; lien vers mon profil. */}
                {me?.user?.handle ? (
                  <Link href={`/community/membre/${me.user.handle}`} className="block truncate text-sm font-medium text-white hover:underline">
                    @{me.user.handle}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium text-white">Mon compte</p>
                )}
                <p className="text-[11px] text-slate-500">Membre de la communauté</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Badges">
              {badges === null ? (
                <>
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </>
              ) : (
                badges.map((b) => (
                  <span
                    key={b.category}
                    title={b.tier ? `${b.label} — palier ${b.tier}` : `${b.label} — ${b.count} / ${b.nextThreshold} pour le bronze`}
                    className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", b.tier ? TIER_CLASS[b.tier] : "border-white/10 bg-white/[0.02] text-slate-500")}
                  >
                    <IconTrophy className="h-3 w-3" />
                    {b.label}
                  </span>
                ))
              )}
            </div>

            {eggCount && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">🥚 Easter eggs</span>
                  <span className="font-medium text-amber-300">
                    {eggCount.found} / {eggCount.total}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-amber-300" style={{ width: `${eggCount.total ? Math.round((eggCount.found / eggCount.total) * 100) : 0}%` }} />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => openProfilePanel()}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-white/10 py-1.5 text-xs text-slate-200 transition hover:border-aurora-400/50 hover:text-white"
            >
              Mon profil <IconChevronRight className="h-3.5 w-3.5" />
            </button>
          </GlassCard>

          {/* Top 3 parrains */}
          <GlassCard hover={false} className="p-4">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <IconGift className="h-3.5 w-3.5 text-aurora-300" /> Top parrains
            </h2>
            {leaderboard === null ? (
              <div className="mt-2 space-y-1.5">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">Aucun filleul abonné pour l&apos;instant — soyez le premier.</p>
            ) : (
              <ol className="mt-2 space-y-1">
                {leaderboard.slice(0, 3).map((r, i) => (
                  <li key={r.id} className={clsx("flex items-center justify-between rounded-lg px-2 py-1 text-xs", r.isMe ? "bg-aurora-400/[0.06] text-white" : "text-slate-300")}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 shrink-0 text-center text-slate-500">{i === 0 ? "👑" : i + 1}</span>
                      <span className="truncate">{r.displayName}</span>
                    </span>
                    <span className="shrink-0 font-medium text-white" title={`${r.referrals} filleul${r.referrals > 1 ? "s" : ""} abonné${r.referrals > 1 ? "s" : ""}`}>
                      {r.referrals}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <button type="button" onClick={() => openProfilePanel("referral")} className="mt-2 inline-flex items-center gap-0.5 text-xs text-aurora-300 transition hover:text-white">
              Classement complet <IconChevronRight className="h-3.5 w-3.5" />
            </button>
          </GlassCard>
        </aside>
        )}
      </div>
    </div>
  );
}
