"use client";

// Page de profil d'un membre (10/10/2026, demande de Lucas) : ouverte en
// cliquant sur un @pseudo. Rang, badges, vitrine, réussites, activité du
// forum, et la bio et les liens de sa Page bio si elle est publiée.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MemberAvatar } from "@/components/community/member-avatar";
import { fetchMemberProfile } from "@/components/community/profile-bubble";
import { RankEmblem } from "@/components/reussites/rank-emblem";
import { FounderBadge } from "@/components/reussites/founder-badge";
import { NetworkLogo } from "@/components/ui/network-badge";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { useBootstrap } from "@/components/bootstrap-provider";
import { openSettings } from "@/components/settings/settings-events";
import type { MemberProfileDTO } from "@/lib/community/member-profile";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export default function MemberProfilePage() {
  const params = useParams<{ handle: string }>();
  const { data: me } = useBootstrap();
  const [profile, setProfile] = useState<MemberProfileDTO | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setProfile(undefined);
    void fetchMemberProfile(decodeURIComponent(params.handle)).then((p) => !cancelled && setProfile(p));
    return () => {
      cancelled = true;
    };
  }, [params.handle]);

  if (profile === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-4" aria-busy="true">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <SkeletonCard lines={3} />
      </div>
    );
  }
  if (profile === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-10 text-center">
        <p className="text-sm text-slate-300">Ce membre est introuvable : il a peut-être changé de pseudo.</p>
        <Link href="/community" className="text-sm text-aurora-300 hover:text-white">
          ← Retour à la communauté
        </Link>
      </div>
    );
  }

  const mine = me?.user?.id === profile.id;
  const author = { id: profile.id, name: profile.name, handle: profile.handle, avatarUrl: profile.avatarUrl, ring: profile.ring };

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="member-profile">
      <Link href="/community" className="text-xs text-slate-500 hover:text-slate-300">
        ← Retour à la communauté
      </Link>

      <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
        <div className="h-28 bg-gradient-to-r from-nebula-600/60 via-aurora-500/40 to-accent-cyan/40 sm:h-36" aria-hidden="true" />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="-mt-12 flex items-end gap-4">
            <span className="rounded-full ring-4 ring-[color:var(--nb-bg,#0f0f0f)]">
              <MemberAvatar author={author} size={96} interactive={false} />
            </span>
            <div className="min-w-0 pb-1">
              <h1 className="truncate font-display text-2xl font-semibold text-white">{profile.name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-400">
                <span>{profile.levelName}</span>
                {profile.founder && <FounderBadge />}
                {profile.mentor && <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-1.5 py-px text-[10px] font-semibold text-amber-200">Mentor</span>}
                <span className="text-slate-500">· membre depuis {profile.memberSince}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <RankEmblem rankId={profile.rankId} size={64} animated title={`Rang ${profile.levelName}`} />
            {mine && (
              <div className="flex flex-col gap-1.5">
                <button type="button" onClick={() => openSettings("compte")} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.14]">
                  Changer mon pseudo
                </button>
                <Link href="/reussites" className="rounded-full bg-white/[0.08] px-3 py-1.5 text-center text-xs font-medium text-white transition hover:bg-white/[0.14]">
                  Ma vitrine
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {profile.showcase.length > 0 && (
        <section aria-labelledby="vitrine-titre" className="space-y-2">
          <h2 id="vitrine-titre" className="font-display text-base font-semibold text-white">
            Vitrine
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {profile.showcase.map((b) => (
              <li key={b.key} className="flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-xl" aria-hidden="true">
                  {b.emoji}
                </span>
                <span className="min-w-0 text-sm font-medium text-white">{b.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="reussites-titre" className="space-y-2">
        <h2 id="reussites-titre" className="font-display text-base font-semibold text-white">
          Réussites
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Rang" value={profile.rankName} hint={profile.levelName} />
          <Stat label="Accomplissements" value={`${profile.stats.accomplishments}`} hint={`sur ${profile.stats.accomplishmentsTotal}`} />
          <Stat label="Étoiles" value={`${profile.stats.stars}`} hint={`sur ${profile.stats.starsTotal}`} />
          <Stat label="Easter eggs" value={`${profile.stats.eggs}`} />
          <Stat label="Forum" value={`${profile.stats.threads + profile.stats.replies}`} hint={`${profile.stats.threads} sujet${profile.stats.threads > 1 ? "s" : ""}, ${profile.stats.replies} réponse${profile.stats.replies > 1 ? "s" : ""}`} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard hover={false} className="p-5">
          <h2 className="font-display text-base font-semibold text-white">Ses liens</h2>
          {profile.bio ? (
            <>
              {profile.bio.text && <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{profile.bio.text}</p>}
              {profile.bio.links.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {profile.bio.links.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] px-3 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:text-white">
                        {l.network ? <NetworkLogo network={l.network} className="h-5 w-5 shrink-0" /> : <span className="w-5 shrink-0 text-center text-slate-500" aria-hidden="true">↗</span>}
                        <span className="truncate">{l.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Pas encore de lien.</p>
              )}
              <a href={profile.bio.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs text-aurora-300 hover:text-white">
                Voir sa page bio ↗
              </a>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              {mine ? (
                <>
                  Publiez votre{" "}
                  <Link href="/link-in-bio" className="text-aurora-300 underline underline-offset-2 hover:text-white">
                    Page bio
                  </Link>{" "}
                  : sa bio et ses liens s&apos;afficheront ici.
                </>
              ) : (
                "Pas de page bio publiée pour l'instant."
              )}
            </p>
          )}
        </GlassCard>

        <GlassCard hover={false} className="p-5">
          <h2 className="font-display text-base font-semibold text-white">Derniers sujets</h2>
          {profile.recentThreads.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Aucun sujet pour l&apos;instant.</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/[0.06]">
              {profile.recentThreads.map((t) => (
                <li key={t.id}>
                  <Link href={`/community/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm text-slate-200 transition hover:text-white">
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {t.replies} réponse{t.replies > 1 ? "s" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
