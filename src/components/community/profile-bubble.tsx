"use client";

// Petite bulle de profil (10/10/2026, demande de Lucas) : ouverte en cliquant
// sur la photo d'un membre. Photo, @pseudo, rang, badges, vitrine, et la bio
// et les liens de sa Page bio (seulement si elle est publiée) ; « Voir le
// profil » mène à la page complète. Se ferme avec Échap, un clic à côté ou
// en faisant défiler la page.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { RankEmblem } from "@/components/reussites/rank-emblem";
import { FounderBadge } from "@/components/reussites/founder-badge";
import { NetworkLogo } from "@/components/ui/network-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemberProfileDTO } from "@/lib/community/member-profile";
import type { MemberLike } from "./member-avatar";
import { MemberAvatar } from "./member-avatar";

const cache = new Map<string, MemberProfileDTO>();

/** Profil public d'un membre (gardé le temps de la visite). */
export async function fetchMemberProfile(key: string): Promise<MemberProfileDTO | null> {
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(`/api/community/members/${encodeURIComponent(key)}`).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { profile?: MemberProfileDTO } | null;
  if (!res?.ok || !data?.profile) return null;
  cache.set(key, data.profile);
  return data.profile;
}

const WIDTH = 320;

export function ProfileBubble({ member, anchor, onClose }: { member: MemberLike; anchor: HTMLElement | null; onClose: () => void }) {
  const key = member.handle ?? member.id;
  const [profile, setProfile] = useState<MemberProfileDTO | null | undefined>(cache.get(key));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (profile === undefined) void fetchMemberProfile(key).then((p) => !cancelled && setProfile(p));
    return () => {
      cancelled = true;
    };
  }, [key, profile]);

  // Sous la photo, sans sortir de l'écran (au-dessus s'il manque de place en bas).
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const height = box.current?.offsetHeight ?? 360;
    const left = Math.max(12, Math.min(window.innerWidth - WIDTH - 12, r.left - 8));
    const below = r.bottom + 8;
    const top = below + height > window.innerHeight - 12 && r.top - height - 8 > 12 ? r.top - height - 8 : below;
    setPos({ top, left });
  }, [anchor, profile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={`Profil de ${member.name}`}
      data-testid="profile-bubble"
      className="glass-panel-solid fixed z-[120] overflow-hidden rounded-2xl shadow-2xl animate-fade-in"
      style={{ width: WIDTH, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-14 bg-gradient-to-r from-nebula-600/60 via-aurora-500/40 to-accent-cyan/40" aria-hidden="true" />
      <div className="-mt-8 px-4 pb-4">
        <div className="flex items-end justify-between gap-2">
          <span className="rounded-full ring-4 ring-[color:var(--nb-surface,#141418)]">
            <MemberAvatar author={{ ...member, avatarUrl: profile?.avatarUrl ?? member.avatarUrl, ring: profile?.ring ?? member.ring }} size={64} interactive={false} />
          </span>
          {profile && <RankEmblem rankId={profile.rankId} size={40} title={`Rang ${profile.levelName}`} />}
        </div>
        <p className="mt-2 truncate font-display text-base font-semibold text-white">{profile?.name ?? member.name}</p>
        {profile === undefined ? (
          <div className="mt-2 space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : profile === null ? (
          <p className="mt-2 text-xs text-slate-400">Profil indisponible pour le moment.</p>
        ) : (
          <>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              <span>{profile.levelName}</span>
              {profile.founder && <FounderBadge />}
              {profile.mentor && <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-1.5 py-px text-[10px] font-semibold text-amber-200">Mentor</span>}
              <span>· membre depuis {profile.memberSince}</span>
            </p>
            {profile.showcase.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Vitrine">
                {profile.showcase.map((b) => (
                  <li key={b.key} title={b.label} className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/[0.06] px-2 py-0.5 text-[11px] text-slate-200">
                    <span aria-hidden="true">{b.emoji}</span>
                    <span className="truncate">{b.label}</span>
                  </li>
                ))}
              </ul>
            )}
            {profile.bio && (
              <div className="mt-3">
                {profile.bio.text && <p className="line-clamp-3 whitespace-pre-line text-[13px] text-slate-300">{profile.bio.text}</p>}
                {profile.bio.links.length > 0 && (
                  <ul className="mt-2 space-y-1" aria-label="Liens">
                    {profile.bio.links.slice(0, 5).map((l) => (
                      <li key={l.url}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] text-slate-200 transition hover:bg-white/[0.06] hover:text-white">
                          {l.network ? <NetworkLogo network={l.network} className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0 text-center text-slate-500" aria-hidden="true">↗</span>}
                          <span className="truncate">{l.label}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              {profile.stats.threads} sujet{profile.stats.threads > 1 ? "s" : ""} · {profile.stats.replies} réponse{profile.stats.replies > 1 ? "s" : ""} · {profile.stats.stars} étoile{profile.stats.stars > 1 ? "s" : ""}
            </p>
            {profile.handle && (
              <Link href={`/community/membre/${profile.handle}`} onClick={onClose} className="mt-3 flex h-9 items-center justify-center rounded-xl bg-white/[0.08] text-sm font-medium text-white transition hover:bg-white/[0.14]">
                Voir le profil
              </Link>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
