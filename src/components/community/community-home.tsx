"use client";

// Accueil de la Communauté, façon accueil YouTube (10/10/2026, demande de
// Lucas : « une vraie page d'accueil qui donne envie de voir ») :
//  1. les vidéos à la une, en grand ;
//  2. « Aidez-les à choisir » : les miniatures et titres que les créateurs
//     font départager, dans une rangée qui défile ; on met des cœurs
//     directement, sur toutes celles qu'on aime ;
//  3. les vidéos que les créateurs proposent d'aller voir (liens) ;
//  4. les discussions du moment.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MemberAvatar, type MemberLike } from "@/components/community/member-avatar";
import { HeartBadge, HeartGlyph } from "@/components/community/heart";
import { NetworkLogo } from "@/components/ui/network-badge";
import { RemoteImage } from "@/components/ui/remote-image";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/dashboard/toast";
import { clsx } from "@/lib/clsx";
import { optionLetter, timeLeftLabel, votePercent, type FeedbackRequestDTO } from "@/lib/community/feedback-rules";
import type { Network } from "@/lib/types";

export interface HomeVideo {
  id: string;
  title: string;
  network: Network;
  externalUrl: string;
  thumbnailUrl: string | null;
  note: string | null;
  createdAt: string;
  author: (MemberLike & { handle?: string | null }) | null;
}

export interface HomeThread {
  id: string;
  title: string;
  createdAt: string;
  author: MemberLike | null;
  _count: { replies: number };
}

interface FeaturedItem {
  id: string;
  title: string;
  network: Network;
  externalUrl: string;
  thumbnailUrl: string | null;
  author: MemberLike;
  source: "reward" | "admin" | "auto";
}

const SOURCE_LABEL: Record<FeaturedItem["source"], string> = { reward: "Gagnée dans Réussites", admin: "Choix de Nebula", auto: "Sélection du moment" };

function ago(iso: string): string {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function SectionTitle({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      {action && (
        <button type="button" onClick={action.onClick} className="shrink-0 text-xs font-medium text-aurora-300 transition hover:text-white">
          {action.label} →
        </button>
      )}
    </div>
  );
}

function Thumb({ src, network, className }: { src: string | null; network: Network; className?: string }) {
  return (
    <span className={clsx("relative block aspect-video w-full overflow-hidden rounded-xl bg-white/[0.04]", className)}>
      <RemoteImage src={src ?? ""} className="h-full w-full transition duration-300 group-hover:scale-[1.03]" sizes="(max-width: 640px) 100vw, 360px" />
      <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/70">
        <NetworkLogo network={network} className="h-3.5 w-3.5" />
      </span>
    </span>
  );
}

/** Une demande d'avis en petit, pour la rangée qui défile : cœurs directement sur les miniatures. */
function FeedbackMini({ request, onChange }: { request: FeedbackRequestDTO; onChange: (next: FeedbackRequestDTO) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const r = request;
  const visible = r.totalVotes !== null;

  async function heart(optionId: string) {
    if (busy || r.mine || r.closed) return;
    setBusy(true);
    const was = r.myHearts.includes(optionId);
    onChange({ ...r, myHearts: was ? r.myHearts.filter((id) => id !== optionId) : [...r.myHearts, optionId] });
    const res = await fetch(`/api/community/feedback/${r.id}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionId }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { request?: FeedbackRequestDTO; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !data?.request) {
      onChange(r);
      toast.error(data?.error ?? "Cœur impossible pour le moment.");
      return;
    }
    const { comments: _drop, ...rest } = data.request;
    void _drop;
    onChange(rest);
  }

  return (
    <article className="w-[300px] shrink-0 snap-start rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:w-[340px]" data-testid="home-feedback">
      <header className="flex items-start gap-2.5">
        <MemberAvatar author={r.author} size={30} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-medium text-white">
            {r.context || (r.kind === "TITLE" ? "Quel titre vous donne envie de cliquer ?" : "Quelle miniature vous donne envie de cliquer ?")}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {r.author?.name} · <span className="text-emerald-300">{timeLeftLabel(r.closesAt)}</span>
          </p>
        </div>
      </header>
      <div className={clsx("mt-2.5", r.kind === "THUMBNAIL" ? "grid gap-1.5" : "space-y-1.5", r.kind === "THUMBNAIL" && (r.options.length > 2 ? "grid-cols-3" : "grid-cols-2"))}>
        {r.options.map((o) => {
          const on = r.myHearts.includes(o.id);
          const hearts = o.votes ?? 0;
          const label = r.kind === "TITLE" ? o.label : `Miniature ${optionLetter(o.position)}`;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => void heart(o.id)}
              disabled={busy}
              aria-pressed={on}
              aria-label={`${on ? "Retirer le cœur de" : "Mettre un cœur à"} ${label}`}
              className={clsx("group relative w-full overflow-hidden rounded-lg border text-left transition", on ? "border-rose-400/80" : "border-white/10 hover:border-white/30")}
            >
              {r.kind === "THUMBNAIL" ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.imageUrl ?? ""} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                  <HeartBadge on={on} className="absolute right-1 top-1 !h-6 !w-6" />
                  {visible && (
                    <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      <HeartGlyph on className="h-3 w-3 text-rose-400" /> {hearts}
                    </span>
                  )}
                </>
              ) : (
                <span className="flex items-center gap-2 px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-white">{o.label}</span>
                  {visible && <span className="text-[10px] tabular-nums text-slate-400">{votePercent(o.votes, r.totalVotes)} %</span>}
                  <HeartBadge on={on} className="!h-6 !w-6 shrink-0" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </article>
  );
}

export function CommunityHome({
  videos,
  threads,
  loading,
  onOpenTab,
  onAskFeedback
}: {
  videos: HomeVideo[];
  threads: HomeThread[];
  loading: boolean;
  onOpenTab: (tab: "forum" | "avis" | "videos") => void;
  onAskFeedback: () => void;
}) {
  const [featured, setFeatured] = useState<FeaturedItem[] | null>(null);
  const [requests, setRequests] = useState<FeedbackRequestDTO[] | null>(null);
  const row = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/community/featured", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFeatured((d?.featured ?? []) as FeaturedItem[]))
      .catch(() => setFeatured([]));
    fetch("/api/community/feedback?scope=open", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRequests((d?.requests ?? []) as FeedbackRequestDTO[]))
      .catch(() => setRequests([]));
  }, []);

  const update = useCallback((next: FeedbackRequestDTO) => setRequests((prev) => (prev ?? []).map((x) => (x.id === next.id ? { ...x, ...next } : x))), []);
  const scroll = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * 360, behavior: "smooth" });

  const hero = featured?.[0] ?? null;
  const side = featured?.slice(1, 3) ?? [];
  const latest = videos.slice(0, 8);

  return (
    <div className="space-y-9" data-testid="community-home">
      {/* 1. À la une */}
      {featured === null ? (
        <Skeleton className="aspect-[21/9] w-full rounded-3xl" />
      ) : hero ? (
        <section aria-labelledby="une-titre">
          <h2 id="une-titre" className="sr-only">
            À la une
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Miniature entière (jamais rognée), le titre dessous dans la carte. */}
            <a href={hero.externalUrl} target="_blank" rel="noopener noreferrer" className="group flex flex-col overflow-hidden rounded-3xl border border-amber-300/25 bg-gradient-to-b from-amber-300/[0.05] to-white/[0.02] lg:col-span-2 lg:h-full">
              <span className="relative block aspect-video w-full overflow-hidden">
                <RemoteImage src={hero.thumbnailUrl ?? ""} className="h-full w-full transition duration-500 group-hover:scale-[1.02]" sizes="(max-width: 1024px) 100vw, 66vw" priority />
                <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-amber-300/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-black">★ À la une</span>
              </span>
              <span className="flex flex-1 flex-col justify-center px-5 py-4">
                <span className="line-clamp-2 font-display text-xl font-semibold text-white sm:text-2xl">{hero.title}</span>
                <span className="mt-1.5 flex items-center gap-2 text-sm text-slate-300">
                  <NetworkLogo network={hero.network} className="h-4 w-4" />
                  {hero.author.name} · {SOURCE_LABEL[hero.source]}
                  <span className="ml-auto hidden text-xs text-amber-200/80 transition group-hover:text-amber-100 sm:inline">Regarder ↗</span>
                </span>
              </span>
            </a>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {side.map((v) => (
                <a key={v.id} href={v.externalUrl} target="_blank" rel="noopener noreferrer" className="group block">
                  <span className="relative block">
                    <Thumb src={v.thumbnailUrl} network={v.network} className="rounded-2xl border border-amber-300/20" />
                    <span className="absolute left-2 top-2 rounded-full bg-amber-300/90 px-2 py-0.5 text-[10px] font-bold uppercase text-black">★ À la une</span>
                  </span>
                  <span className="mt-2 line-clamp-2 block text-sm font-medium text-white">{v.title}</span>
                  <span className="block text-xs text-slate-400">{v.author.name}</span>
                </a>
              ))}
              {side.length === 0 && (
                <Link href="/reussites?focus=une#recompenses" className="flex flex-col justify-center rounded-2xl border border-dashed border-white/15 p-5 text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white">
                  <span className="font-medium text-white">Votre vidéo ici ?</span>
                  Gagnez une place à la une en montant de rang dans Réussites.
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* 2. Aidez-les à choisir */}
      <section aria-labelledby="choisir-titre">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 id="choisir-titre" className="font-display text-lg font-semibold text-white">
              Aidez-les à choisir
            </h2>
            <p className="text-xs text-slate-400">Touchez les miniatures et les titres qui vous donnent envie de cliquer : un cœur sur toutes celles que vous aimez.</p>
          </div>
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            <button type="button" onClick={() => scroll(-1)} aria-label="Demandes précédentes" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-slate-300 transition hover:bg-white/[0.12] hover:text-white">
              ‹
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label="Demandes suivantes" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-slate-300 transition hover:bg-white/[0.12] hover:text-white">
              ›
            </button>
          </div>
        </div>
        {requests === null ? (
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-[300px] shrink-0 rounded-2xl" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-white/15 p-5">
            <p className="text-sm text-slate-400">Personne n&apos;attend d&apos;avis pour l&apos;instant. Une miniature ou un titre à trancher ?</p>
            <button type="button" onClick={onAskFeedback} className="rounded-full bg-nebula-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-nebula-400">
              Demander un avis
            </button>
          </div>
        ) : (
          <div ref={row} className="nb-scroll-x -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]" role="list" aria-label="Demandes d'avis">
            {requests.map((r) => (
              <div key={r.id} role="listitem">
                <FeedbackMini request={r} onChange={update} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => onOpenTab("avis")}
              className="flex w-40 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-sm text-slate-300 transition hover:text-white"
            >
              <span className="text-2xl" aria-hidden="true">
                →
              </span>
              Toutes les demandes
            </button>
          </div>
        )}
      </section>

      {/* 3. Les vidéos des créateurs */}
      <section>
        <SectionTitle title="Les vidéos des créateurs" action={videos.length > latest.length ? { label: "Tout voir", onClick: () => onOpenTab("videos") } : undefined} />
        {loading ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-video w-full rounded-xl" />
            ))}
          </div>
        ) : latest.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-slate-400">
            Pas encore de vidéo partagée. Depuis une publication en ligne, « Partager dans la Communauté » la fait apparaître ici.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {latest.map((v) => (
              <li key={v.id} className="group" data-testid="home-video">
                <a href={v.externalUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <Thumb src={v.thumbnailUrl} network={v.network} />
                </a>
                <div className="mt-2.5 flex gap-2.5">
                  <MemberAvatar author={v.author} size={32} />
                  <div className="min-w-0 flex-1">
                    <a href={v.externalUrl} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-medium text-white hover:underline">
                      {v.title}
                    </a>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {v.author?.handle ? (
                        <Link href={`/community/membre/${v.author.handle}`} className="hover:text-white">
                          {v.author.name}
                        </Link>
                      ) : (
                        v.author?.name
                      )}{" "}
                      · {ago(v.createdAt)}
                    </p>
                    {v.note && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{v.note}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. Les discussions du moment */}
      {threads.length > 0 && (
        <section>
          <SectionTitle title="Les discussions du moment" action={{ label: "Aller au forum", onClick: () => onOpenTab("forum") }} />
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {threads.slice(0, 6).map((t) => (
              <li key={t.id}>
                <Link href={`/community/${t.id}`} className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-white/20">
                  <MemberAvatar author={t.author} size={30} interactive={false} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium text-white">{t.title}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      {t.author?.name} · {t._count.replies} réponse{t._count.replies > 1 ? "s" : ""} · {ago(t.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
