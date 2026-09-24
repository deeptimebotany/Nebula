"use client";

// Panneau latéral « Mon profil » — la gamification retirée de la page
// Communauté (badges, easter eggs, parrainage et son classement complet)
// vit ici, dans un tiroir rétractable à droite, ouvert à la demande depuis
// la mini-carte profil de la Communauté ou depuis le menu du compte (en-tête).
// Même mécanique que le tiroir de l'assistant (ai-assistant.tsx) ; ouvert par
// un événement window (openProfilePanel), comme la palette Cmd/Ctrl+K, pour
// que n'importe quel composant puisse l'appeler sans provider dédié.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RemoteImage } from "@/components/ui/remote-image";
import { Skeleton } from "@/components/ui/skeleton";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useToast } from "@/components/dashboard/toast";
import { IconAvatar, IconClose, IconGift, IconMessage, IconTrophy, IconUsers } from "./icons";
import type { EarnedBadge } from "@/lib/badges";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { clsx } from "@/lib/clsx";

export type ProfileSection = "activity" | "badges" | "eggs" | "referral";

const OPEN_EVENT = "nebula:open-profile";

/** Ouvre le panneau, éventuellement positionné sur une section. */
export function openProfilePanel(section?: ProfileSection) {
  window.dispatchEvent(new CustomEvent<ProfileSection | undefined>(OPEN_EVENT, { detail: section }));
}

interface LeaderboardRow {
  id: string;
  displayName: string;
  referrals: number;
  isMe: boolean;
}

interface ReferralInfo {
  code: string;
  referredByCode: string | null;
  aiTrialActive: boolean;
  aiTrialUntil: string | null;
}

interface ProfileData {
  badges: EarnedBadge[];
  eggs: { found: number; total: number } | null;
  referral: ReferralInfo | null;
  leaderboard: LeaderboardRow[];
}

const TIER_CLASS: Record<string, string> = {
  or: "bg-amber-400/15 text-amber-300",
  argent: "bg-slate-300/15 text-slate-200",
  bronze: "bg-orange-700/20 text-orange-300"
};

const BADGE_ICON: Record<EarnedBadge["category"], typeof IconMessage> = {
  threads: IconMessage,
  replies: IconUsers,
  videos: IconTrophy
};

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export function ProfilePanel() {
  const { data: me, patch: patchMe } = useBootstrap();
  const toast = useToast();
  // Photo de profil : un clic sur la pastille pour en envoyer une nouvelle.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  async function onPhotoChosen(file: File) {
    if (!me) return;
    setPhotoUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/media/thumbnails/upload", { method: "POST", body: form });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok || !upData.url) throw new Error(upData.error ?? "Échec de l'envoi de la photo.");
      const res = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatarUrl: upData.url }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Échec de l'enregistrement de la photo.");
      // Mise à jour immédiate partout (panneau, sélecteur de compte, Communauté).
      patchMe({ user: { ...me.user, avatarUrl: data.avatarUrl } });
      toast.success("Photo de profil mise à jour.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ProfileData | null>(null);
  const [pendingSection, setPendingSection] = useState<ProfileSection | null>(null);
  const sectionRefs = useRef<Record<ProfileSection, HTMLElement | null>>({ activity: null, badges: null, eggs: null, referral: null });

  const load = useCallback(async () => {
    const [badgesRes, eggsRes, referralRes, boardRes] = await Promise.all([
      fetch("/api/community/badges").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/easter-eggs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/referral").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/referral/leaderboard").then((r) => (r.ok ? r.json() : null)).catch(() => null)
    ]);
    const leaderboard: LeaderboardRow[] = boardRes?.leaderboard ?? [];
    // Easter egg : trouver SA PROPRE couronne, pas seulement en voir une.
    if (leaderboard[0]?.isMe) reportEasterEggFound("referral-crown");
    setData({
      badges: badgesRes?.badges ?? [],
      eggs: eggsRes ? { found: eggsRes.foundCount ?? 0, total: eggsRes.total ?? 20 } : null,
      referral: referralRes && referralRes.code ? referralRes : null,
      leaderboard
    });
  }, []);

  useEffect(() => {
    function onOpen(e: Event) {
      setPendingSection((e as CustomEvent<ProfileSection | undefined>).detail ?? null);
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, load]);

  // Défilement vers la section demandée une fois les données affichées.
  useEffect(() => {
    if (!open || !data || !pendingSection) return;
    const el = sectionRefs.current[pendingSection];
    const t = window.setTimeout(() => el?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    setPendingSection(null);
    return () => window.clearTimeout(t);
  }, [open, data, pendingSection]);

  async function copyReferralLink() {
    if (!data?.referral) return;
    const url = `${window.location.origin}/register?ref=${data.referral.code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien de parrainage copié.");
    } catch {
      toast.error("Impossible de copier — sélectionnez le lien à la main.");
    }
  }

  const user = me?.user;
  const eggsPct = data?.eggs && data.eggs.total > 0 ? Math.round((data.eggs.found / data.eggs.total) * 100) : 0;
  const activity = {
    threads: data?.badges.find((b) => b.category === "threads")?.count ?? 0,
    replies: data?.badges.find((b) => b.category === "replies")?.count ?? 0,
    videos: data?.badges.find((b) => b.category === "videos")?.count ?? 0
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={clsx("fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        role="dialog"
        aria-label="Mon profil"
        aria-hidden={!open}
        className={clsx(
          "glass-panel-solid fixed inset-y-0 right-0 z-50 flex w-full flex-col border-y-0 border-r-0 transition-[transform,visibility] duration-200 ease-out sm:w-[400px] sm:rounded-l-2xl",
          open ? "visible translate-x-0" : "invisible translate-x-full"
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
          <p className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-white">Mon profil</p>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer le profil" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Identité */}
          <section className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={!user || photoUploading}
              title="Changer la photo de profil"
              aria-label="Changer la photo de profil"
              className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full"
            >
              {user?.avatarUrl ? (
                <RemoteImage key={user.avatarUrl} src={user.avatarUrl} className="h-14 w-14 rounded-full" sizes="56px" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-nebula-600/70 to-accent-cyan/40 font-display text-lg font-semibold text-white">
                  {user ? initials(user.name) : <IconAvatar className="h-5 w-5" />}
                </span>
              )}
              <span className={clsx("absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-[10px] font-semibold text-white transition", photoUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
                {photoUploading ? "Envoi…" : "Changer"}
              </span>
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onPhotoChosen(e.target.files[0])} />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold text-white">{user?.name || "Mon compte"}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
              {me?.plan && <span className="mt-1 inline-block rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">Palier {me.plan}</span>}
            </div>
          </section>

          {/* Activité */}
          <section ref={(el) => {
              sectionRefs.current.activity = el;
            }} className="scroll-mt-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Mon activité dans la communauté</h3>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["Discussions", activity.threads],
                  ["Réponses", activity.replies],
                  ["Vidéos", activity.videos]
                ] as [string, number][]
              ).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <div className="text-xl font-semibold text-white">{data ? value : <Skeleton className="h-6 w-8" />}</div>
                  <p className="text-[11px] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Badges */}
          <section ref={(el) => {
              sectionRefs.current.badges = el;
            }} className="scroll-mt-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <IconTrophy className="h-3.5 w-3.5 text-amber-300" /> Badges
            </h3>
            {!data ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <ul className="space-y-2">
                {data.badges.map((b) => {
                  const Icon = BADGE_ICON[b.category] ?? IconTrophy;
                  const pct = b.nextThreshold ? Math.min(100, Math.round((b.count / b.nextThreshold) * 100)) : 100;
                  return (
                    <li key={b.category} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="flex items-center gap-2.5">
                        <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", b.tier ? TIER_CLASS[b.tier] : "bg-white/[0.04] text-slate-500")}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-medium text-white">
                            <span className="truncate">{b.label}</span>
                            {b.tier && <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", TIER_CLASS[b.tier])}>{b.tier}</span>}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {b.nextThreshold !== null ? `${b.count} / ${b.nextThreshold} pour le palier ${b.nextTier}` : `${b.count} — palier maximum atteint`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className={clsx("h-full rounded-full", b.tier === "or" ? "bg-amber-300" : "bg-aurora-400")} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Easter eggs */}
          <section ref={(el) => {
              sectionRefs.current.eggs = el;
            }} className="scroll-mt-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Easter eggs</h3>
            <Link href="/succes" onClick={() => setOpen(false)} className="block rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/20">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-slate-200">
                  <span className="text-lg" aria-hidden="true">🥚</span> Trouvés
                </span>
                <span className="font-display text-sm font-medium text-amber-300">{data?.eggs ? `${data.eggs.found} / ${data.eggs.total}` : "…"}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-amber-300" style={{ width: `${eggsPct}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Voir la page Succès — indices et récompenses débloquées →</p>
            </Link>
          </section>

          {/* Parrainage */}
          <section ref={(el) => {
              sectionRefs.current.referral = el;
            }} className="scroll-mt-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <IconGift className="h-3.5 w-3.5 text-aurora-300" /> Parrainage
            </h3>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              {!data ? (
                <Skeleton className="h-10 w-full" />
              ) : data.referral ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-500">Votre code</p>
                      <p className="font-mono text-base font-semibold tracking-wider text-white">{data.referral.code}</p>
                    </div>
                    <button type="button" onClick={copyReferralLink} className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:border-aurora-400/50 hover:text-white">
                      Copier le lien
                    </button>
                  </div>
                  {(me?.bonusMonths ?? 0) > 0 && (
                    <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-2.5 py-1.5 text-xs text-emerald-200">
                      {me!.bonusMonths} mois de Pro offert{me!.bonusMonths > 1 ? "s" : ""} en attente — déduit{me!.bonusMonths > 1 ? "s" : ""} automatiquement de votre prochaine souscription.
                    </p>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Chaque compte créé avec votre lien reçoit 30 jours de Pro offerts, et vous gagnez un mois de Pro à sa première souscription. Le podium du classement reçoit en plus des mois Pro attribués par l&apos;équipe Nebula.
                    {data.referral.aiTrialActive && data.referral.aiTrialUntil && (
                      <> IA offerte via parrainage jusqu&apos;au {new Date(data.referral.aiTrialUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.</>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-500">Votre code de parrainage apparaît dans Paramètres.</p>
              )}
            </div>

            <h4 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Classement des parrainages</h4>
            {!data ? (
              <div className="space-y-1.5">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : data.leaderboard.length === 0 ? (
              <p className="text-xs text-slate-500">Personne n&apos;a encore parrainé de nouveau compte — soyez le premier.</p>
            ) : (
              <ol className="space-y-1">
                {data.leaderboard.map((r, i) => (
                  <li key={r.id} className={clsx("flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm", r.isMe ? "border border-aurora-400/30 bg-aurora-400/[0.06] text-white" : "text-slate-300")}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-5 shrink-0 text-center text-xs text-slate-500">{i === 0 ? <span title="Premier du classement">👑</span> : i + 1}</span>
                      <span className="truncate">{r.displayName}</span>
                      {r.isMe && <span className="shrink-0 text-[11px] text-aurora-300">(vous)</span>}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-white">
                      {r.referrals} filleul{r.referrals > 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
