"use client";

// Page « Réussites » — v2 du 26/09/2026 (maquette « Réussites v2 » validée
// par Lucas, lots A et B). De haut en bas :
//  1. le rang de créateur et UNE prochaine action conseillée (et, si les
//     XP sont là mais pas les compétences, le « rang en attente ») ;
//  2. les 3 missions de la semaine (Habitude, Progression au choix,
//     Mystère), le coffre, la série et ses boucliers, le défi du mois ;
//  3. le bilan de la semaine (lot B) ;
//  4. la constellation de compétences et ses mini-leçons (lot B) ;
//  5. « Presque là » : les accomplissements à 70 % ou plus ;
//  6. la vitrine, les récompenses et la carte de créateur (lot B), la
//     vidéo à la une (lot C) ;
//  7. les badges datés (saison, collectif, mois), l'album des
//     accomplissements (replié, rareté réelle) et les Succès (easter eggs).
// Lot C : les 7 premiers jours, le Premier décollage remplace l'affichage
// des missions ; défi collectif et badge de saison sous le défi du mois.
//
// ?focus=… (liens des notifications et des cartes de célébration) : la page
// défile jusqu'à l'élément et le met en surbrillance quelques secondes —
// clé d'un palier ou d'une étoile, « level », « missions », « defis »,
// « bilan », « constellation », « vitrine », « collectif », « saisons » ou
// « succes ».
//
// Tout est calculé côté serveur à partir de l'activité réelle (voir
// src/lib/reussites/engine.ts et weekly.ts) : ouvrir la page réévalue.

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LevelsModal } from "@/components/reussites/levels-modal";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { FilterChip } from "@/components/ui/filter-chip";
import { IconTrophy } from "@/components/dashboard/icons";
import { CosmeticDecorOverlay } from "@/components/cosmetics/decor-overlay";
import { useBootstrap } from "@/components/bootstrap-provider";
import { LevelRing } from "@/components/reussites/level-ring";
import { SuccesSection } from "@/components/reussites/succes-section";
import { ConstellationSection } from "@/components/reussites/constellation";
import { LessonDialog } from "@/components/reussites/lesson-dialog";
import { WeeklyReview } from "@/components/reussites/weekly-review";
import { ShowcaseSection } from "@/components/reussites/showcase-section";
import { CollectiveCard, LaunchCard, RarityMark, SeasonShelf } from "@/components/reussites/social-cards";
import { FeaturedPanel } from "@/components/reussites/featured-panel";
import type { ReviewFocus } from "@/lib/reussites/review";
import { CATEGORIES, monthOfLabel, type ReussiteCategory } from "@/lib/reussites/catalog";
import { SLOT_LABEL } from "@/lib/reussites/missions";
import { daysLeft, timeLeftLabel } from "@/lib/reussites/periods";
import type { ChestDTO, MissionDTO, NearDTO, NextActionDTO, ProgressChoiceDTO, ReussitesPageDTO, SeriesDTO, SkillDTO, StarDTO, StreakDTO } from "@/lib/reussites/types";
import { clsx } from "@/lib/clsx";

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function XpChip({ xp, done, label }: { xp: number; done?: boolean; label?: string }) {
  return (
    <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", done ? "bg-emerald-400/15 text-emerald-300" : "bg-nebula-500/20 text-aurora-200")}>
      {label ?? `+${xp} XP`}
    </span>
  );
}

function Bar({ value, target, done, className }: { value: number; target: number; done?: boolean; className?: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className={clsx("h-1.5 overflow-hidden rounded-full bg-white/[0.07]", className)} role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(value, target)}>
      <div className={clsx("h-full rounded-full transition-all duration-700", done ? "bg-emerald-400" : "bg-gradient-to-r from-nebula-500 to-aurora-400")} style={{ width: `${done ? 100 : pct}%` }} />
    </div>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path d="M3 8.5 L6.5 11.5 L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFlame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
      <path
        d="M7 1.5 C 9 4, 11.5 5.5, 11.5 8.5 A 4.5 4.5 0 0 1 2.5 8.5 C 2.5 6.5, 4 5.5, 4.5 4 C 5.5 5, 6 5.5, 6.5 6 C 7 4.5, 7 3, 7 1.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 14 14" className={className} aria-hidden="true">
      <path d="M7 1.5 L12 3.5 V7 C12 10 9.5 11.8 7 12.5 C4.5 11.8 2 10 2 7 V3.5 Z" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.25 : 0} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function ChestIcon({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 104 84" className={className} aria-hidden="true">
      <rect x="10" y="34" width="84" height="44" rx="8" fill="rgb(242 207 107 / 0.12)" stroke="#f2cf6b" strokeWidth="3" />
      {open ? (
        <path d="M14 30 C 20 8, 92 4, 96 22 L 90 30 Z" fill="rgb(242 207 107 / 0.2)" stroke="#f2cf6b" strokeWidth="3" strokeLinejoin="round" />
      ) : (
        <path d="M10 40 C 10 16, 94 16, 94 40 Z" fill="rgb(242 207 107 / 0.2)" stroke="#f2cf6b" strokeWidth="3" strokeLinejoin="round" />
      )}
      <rect x="44" y="36" width="16" height="18" rx="4" fill="#f2cf6b" />
    </svg>
  );
}

// --- Rang et prochaine action ---------------------------------------------------------

function NextActionCard({ action, onChest }: { action: NextActionDTO | null; onChest: () => void }) {
  if (!action) {
    return (
      <div className="reussites-reward-box flex flex-col justify-center gap-2 rounded-2xl border p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Semaine bouclée</p>
        <p className="font-display text-base font-semibold text-white">Tout est fait cette semaine, bravo.</p>
        <p className="text-xs text-slate-400">Vos prochaines missions arrivent lundi.</p>
      </div>
    );
  }
  const inPage = action.href.startsWith("#");
  const cls = "flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-nebula-500 px-4 text-sm font-semibold text-white transition hover:bg-nebula-400";
  return (
    <div className="reussites-reward-box flex flex-col gap-2.5 rounded-2xl border p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aurora-300">Prochaine action conseillée</p>
      <p className="font-display text-base font-semibold leading-snug text-white">{action.title}</p>
      <p className="text-xs leading-relaxed text-slate-400">{action.meta}</p>
      {inPage ? (
        <button type="button" onClick={action.href === "#coffre" ? onChest : () => document.getElementById(action.href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" })} className={cls}>
          {action.action}
        </button>
      ) : (
        <Link href={action.href} className={cls}>
          {action.action} <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

// --- Missions -------------------------------------------------------------------------------

function MissionCard({
  m,
  choices,
  swapsLeft,
  busyKey,
  onChoose,
  revealAt
}: {
  m: MissionDTO;
  choices?: ProgressChoiceDTO[];
  swapsLeft?: number;
  busyKey?: string | null;
  onChoose?: (key: string) => void;
  revealAt: string;
}) {
  const slotTone = m.slot === "habit" ? "text-emerald-300" : m.slot === "progress" ? "text-aurora-300" : "text-amber-300";
  if (!m.revealed) {
    const day = new Date(revealAt).toLocaleDateString("fr-FR", { weekday: "long" });
    return (
      <article className="flex h-full flex-col gap-3 rounded-2xl border border-dashed border-white/[0.16] bg-white/[0.015] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">{SLOT_LABEL.mystery}</p>
        <div className="flex h-20 items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-amber-300/50 bg-amber-300/[0.06] font-display text-3xl font-bold text-amber-300" aria-hidden="true">
            ?
          </span>
        </div>
        <p className="font-display text-sm font-semibold text-white">Se révèle quand les deux autres sont réussies</p>
        <p className="text-xs text-slate-400">Ou {day} au plus tard. Souvent une fonction à découvrir, ou un coup de main dans la Communauté.</p>
      </article>
    );
  }
  const canChoose = m.slot === "progress" && choices && choices.length > 1 && !m.done;
  return (
    <article className={clsx("flex h-full flex-col gap-2.5 rounded-2xl border p-4 transition", m.done ? "border-emerald-400/35 bg-emerald-400/[0.05]" : m.slot === "progress" ? "border-aurora-400/35 bg-white/[0.02]" : "border-white/[0.08] bg-white/[0.02]")}>
      <p className={clsx("text-[11px] font-semibold uppercase tracking-[0.14em]", slotTone)}>
        {SLOT_LABEL[m.slot]}
        {m.slot === "progress" && !m.done ? " · au choix" : ""}
      </p>
      <p className="flex items-start gap-1.5 font-display text-sm font-semibold leading-snug text-white">
        {m.done && <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />}
        {m.title}
      </p>
      <p className="text-xs leading-relaxed text-slate-400">{m.description}</p>
      {m.skill && <p className="text-[11px] text-slate-500">Compétence : {m.skill}</p>}
      {canChoose && (
        <div className="space-y-1.5" role="group" aria-label="Choisir la mission de progression">
          {choices!.map((c) => {
            const locked = !c.chosen && (swapsLeft ?? 0) <= 0;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={c.chosen}
                disabled={c.chosen || locked || Boolean(busyKey)}
                onClick={() => onChoose?.(c.key)}
                className={clsx(
                  "flex min-h-[36px] w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition",
                  c.chosen ? "border-aurora-400/60 bg-aurora-400/[0.12] font-semibold text-white" : locked ? "cursor-not-allowed border-white/[0.06] text-slate-500" : "border-white/[0.1] text-slate-300 hover:border-aurora-400/40 hover:text-white"
                )}
              >
                <span className="min-w-0">{busyKey === c.key ? "Changement…" : c.title}</span>
                <span className="shrink-0 tabular-nums text-slate-400">+{c.xp}</span>
              </button>
            );
          })}
          <p className="text-[11px] text-slate-500">{(swapsLeft ?? 0) > 0 ? "Vous pouvez changer une fois cette semaine." : "Choix fixé pour cette semaine."}</p>
        </div>
      )}
      <div className="mt-auto space-y-2 pt-1">
        <Bar value={m.value} target={m.target} done={m.done} />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={m.done ? "text-emerald-300" : "tabular-nums text-slate-400"}>{m.done ? "Réussie" : `${fmt(m.value)} / ${fmt(m.target)}`}</span>
          <XpChip xp={m.xp} done={m.done} />
        </div>
        {!m.done && m.href && m.action && (
          <Link href={m.href} className="inline-flex min-h-[36px] items-center text-xs font-medium text-aurora-300 transition hover:text-white">
            {m.action} <span aria-hidden="true">&nbsp;→</span>
          </Link>
        )}
      </div>
    </article>
  );
}

function ChestCard({
  chest,
  doneCount,
  pending,
  opening,
  revealed,
  onOpen
}: {
  chest: ChestDTO;
  doneCount: number;
  pending: string[];
  opening: string | null;
  revealed: { label: string; xp: number } | null;
  onOpen: (week: string) => void;
}) {
  const [showChances, setShowChances] = useState(false);
  const ready = chest.ready && !chest.opened;
  return (
    <article id="coffre" className={clsx("flex h-full scroll-mt-24 flex-col gap-3 rounded-2xl border p-4", ready ? "nb-chest-ready border-amber-300/60 bg-amber-300/[0.07]" : "border-amber-300/25 bg-amber-300/[0.03]")}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">Coffre de la semaine</p>
      {revealed || chest.opened ? (
        <div className={clsx("flex flex-col items-center justify-center gap-1 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-3 text-center", revealed && "nb-chest-reveal")} role="status">
          <ChestIcon open className="h-12 w-14" />
          <p className="text-sm font-semibold text-white">{revealed?.label ?? chest.itemLabel ?? "Coffre ouvert"}</p>
          <p className="text-xs text-amber-300">+{revealed?.xp ?? chest.xp} XP</p>
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center">
          <ChestIcon className={clsx("h-16 w-20", opening === chest.week && "nb-chest-shake")} />
        </div>
      )}
      <div className="flex gap-1.5" aria-label={`${doneCount} mission${doneCount > 1 ? "s" : ""} sur 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={clsx("h-2 flex-1 rounded-full", i < doneCount ? "bg-amber-300" : "bg-white/[0.08]")} />
        ))}
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        {chest.opened ? "Ouvert : à la semaine prochaine." : ready ? "3 missions sur 3 : il est à vous." : `${doneCount} / 3 missions.`} Toujours {chest.xp} XP, plus un objet tiré au sort. Il n&apos;expire jamais.
      </p>
      <button type="button" onClick={() => setShowChances((v) => !v)} aria-expanded={showChances} className="self-start text-[11px] font-medium text-aurora-300 hover:text-white">
        {showChances ? "Masquer les chances" : "Voir les chances"}
      </button>
      {showChances && (
        <ul className="space-y-1 text-[11px] text-slate-300">
          {chest.chances.map((c) => (
            <li key={c.label} className="flex justify-between gap-2">
              <span>{c.label}</span>
              <span className="tabular-nums text-slate-400">{c.chance} %</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto space-y-2">
        {ready && !revealed && (
          <button
            type="button"
            onClick={() => onOpen(chest.week)}
            disabled={Boolean(opening)}
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-amber-300/60 bg-amber-300/[0.12] text-sm font-semibold text-amber-200 transition hover:bg-amber-300/[0.2] disabled:opacity-60"
          >
            {opening === chest.week ? "Ouverture…" : "Ouvrir le coffre"}
          </button>
        )}
        {pending.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onOpen(w)}
            disabled={Boolean(opening)}
            className="flex min-h-[40px] w-full items-center justify-center rounded-xl border border-amber-300/35 text-xs font-semibold text-amber-200 transition hover:bg-amber-300/[0.08] disabled:opacity-60"
          >
            {opening === w ? "Ouverture…" : `Ouvrir le coffre de la semaine ${w.split("-W")[1]}`}
          </button>
        ))}
      </div>
    </article>
  );
}

function StreakChips({ streak }: { streak: StreakDTO }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-xs text-orange-300"
        title={`Semaines d'affilée avec au moins une publication en ligne. Meilleure série : ${streak.best}.`}
      >
        <IconFlame className="h-3.5 w-3.5" />
        Série : {streak.current} semaine{streak.current > 1 ? "s" : ""}
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-aurora-400/30 bg-aurora-400/10 px-2.5 py-1 text-xs text-aurora-200"
        title="Un bouclier protège automatiquement votre série si une semaine vous échappe. Un bouclier gagné toutes les 4 semaines de série, 2 au maximum."
      >
        {Array.from({ length: streak.maxShields }).map((_, i) => (
          <IconShield key={i} className="h-3.5 w-3.5" filled={i < streak.shields} />
        ))}
        {streak.shields} bouclier{streak.shields > 1 ? "s" : ""}
      </span>
    </div>
  );
}

// --- Presque là et album ---------------------------------------------------------------------

function NearCard({ n, onOpen }: { n: NearDTO; onOpen: () => void }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <button type="button" onClick={onOpen} className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition hover:border-aurora-400/40">
      <span className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/[0.08]" />
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(var(--c-aurora-400))" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(n.pct / 100) * c} ${c}`} />
        </svg>
        <span className="text-2xl" aria-hidden="true">
          {n.emoji}
        </span>
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="block font-display text-sm font-semibold text-white">{n.name}</span>
        <span className="block text-xs tabular-nums text-slate-400">
          {fmt(n.value)} / {fmt(n.target)} {n.unit} · {n.pct} %
        </span>
        {n.reward && <span className="block text-[11px] text-slate-500">Récompense : {n.reward}</span>}
      </span>
    </button>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function AccomplishmentCard({ s }: { s: SeriesDTO }) {
  const next = s.tiers.find((t) => !t.unlockedAt);
  const shown = next ?? s.tiers[s.tiers.length - 1];
  const unlocked = !next;
  const multi = s.tiers.length > 1;
  const title = multi ? `${s.name} · palier ${shown.rank}` : s.name;
  const doneCount = s.tiers.filter((t) => t.unlockedAt).length;
  return (
    <div id={`ach-${s.id}`} className={clsx("flex h-full scroll-mt-24 flex-col rounded-2xl border p-4", unlocked ? "border-amber-400/40 bg-amber-400/[0.05]" : "border-white/[0.07] bg-white/[0.02]")}>
      <div className="flex items-start gap-3">
        <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl", unlocked ? "bg-amber-400/15" : "bg-white/[0.05]")} aria-hidden="true">
          {s.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{shown.description}</p>
          {multi && (
            <p className="mt-1.5 flex items-center gap-1" aria-label={`${doneCount} palier(s) débloqué(s) sur ${s.tiers.length}`}>
              {s.tiers.map((t) => (
                <span
                  key={t.key}
                  className={clsx("h-1.5 w-1.5 rounded-full", t.unlockedAt ? "bg-amber-300" : t.key === shown.key ? "bg-aurora-400" : "bg-white/15")}
                  title={`${fmt(t.target)} ${s.unit}${t.unlockedAt ? " — débloqué" : ""}`}
                />
              ))}
              <span className="ml-1 text-[10px] text-slate-500">
                {doneCount}/{s.tiers.length}
              </span>
            </p>
          )}
        </div>
      </div>
      <div className="mt-auto pt-3">
        {unlocked ? (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-amber-200">{shown.unlockedAt ? `Débloqué le ${formatDay(shown.unlockedAt)}` : "Débloqué"}</span>
            <XpChip xp={shown.xp} done />
          </div>
        ) : (
          <>
            <Bar value={s.value} target={shown.target} />
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="tabular-nums text-slate-400">
                {fmt(Math.min(s.value, shown.target))} / {fmt(shown.target)} {s.unit}
              </span>
              <XpChip xp={shown.xp} />
            </div>
          </>
        )}
        {shown.reward && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-300">
            <span className="h-2 w-2 shrink-0 rounded-[3px] bg-gradient-to-br from-aurora-300 to-accent-cyan" aria-hidden="true" />
            {unlocked ? "Gagné : " : ""}
            {shown.reward}
          </p>
        )}
        {s.note && !unlocked && <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{s.note}</p>}
        <RarityMark rarity={shown.rarity} className="mt-1.5" />
      </div>
    </div>
  );
}

// Objectifs « Pour bien démarrer » : les premiers pas, montrés en tête de
// l'album tant qu'ils ne sont pas tous faits (rangs Étincelle et Comète I).
const STARTER_SERIES = ["first-post", "bio-live", "first-thread", "posts", "envol"];

/** Lit ?focus=… (dans une frontière Suspense, exigée par useSearchParams). */
function FocusParam({ onFocus }: { onFocus: (value: string | null) => void }) {
  const params = useSearchParams();
  const focus = params.get("focus");
  useEffect(() => {
    onFocus(focus);
  }, [focus, onFocus]);
  return null;
}

/** Fait défiler jusqu'à l'élément et le met en surbrillance ~3 s. */
function flash(id: string) {
  window.setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("nb-focus-flash");
    void el.offsetWidth; // relance l'animation
    el.classList.add("nb-focus-flash");
    window.setTimeout(() => el.classList.remove("nb-focus-flash"), 3200);
  }, 180);
}

export default function ReussitesPage() {
  const { refresh: refreshBootstrap } = useBootstrap();
  const [data, setData] = useState<ReussitesPageDTO | null>(null);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState<ReussiteCategory | "all">("all");
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [openSucces, setOpenSucces] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ week: string; label: string; xp: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Lot B : compétence affichée, leçon ouverte, bilan et vitrine en cours d'envoi.
  const [skillIndex, setSkillIndex] = useState<number | null>(null);
  const [lesson, setLesson] = useState<{ star: StarDTO; skill: SkillDTO } | null>(null);
  const [starFocus, setStarFocus] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [showcaseBusy, setShowcaseBusy] = useState(false);
  const [lotBError, setLotBError] = useState<string | null>(null);
  const [featureError, setFeatureError] = useState<string | null>(null);
  // Lot C : missions visibles pendant le Premier décollage, action « à la une » en cours.
  const [showMissions, setShowMissions] = useState(false);
  const [featureBusy, setFeatureBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reussites", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()) as ReussitesPageDTO);
      // Compteur du menu remis à zéro, rang à jour, et célébration des
      // déblocages que cette visite vient de valider.
      refreshBootstrap?.();
      window.dispatchEvent(new Event("nebula:reussites-check"));
    } catch {
      setFailed(true);
    }
  }, [refreshBootstrap]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>, onError: (message: string) => void = setActionError) => {
      setActionError(null);
      setLotBError(null);
      const res = await fetch("/api/reussites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string; label?: string; xp?: number };
      if (!res.ok) {
        onError(json.error ?? "Action impossible pour le moment. Réessayez dans un instant.");
        return null;
      }
      return json;
    },
    []
  );

  const chooseFocus = useCallback(
    async (focus: ReviewFocus) => {
      setReviewBusy(true);
      if (await act({ action: "review", focus }, setLotBError)) await load();
      setReviewBusy(false);
    },
    [act, load]
  );

  const featureAction = useCallback(
    async (body: Record<string, unknown>) => {
      setFeatureBusy(true);
      setFeatureError(null);
      if (await act(body, setFeatureError)) await load();
      setFeatureBusy(false);
    },
    [act, load]
  );

  const saveShowcase = useCallback(
    async (keys: string[]) => {
      setShowcaseBusy(true);
      const ok = Boolean(await act({ action: "showcase", keys }, setLotBError));
      if (ok) await load();
      setShowcaseBusy(false);
      return ok;
    },
    [act, load]
  );

  const choose = useCallback(
    async (key: string) => {
      setChoosing(key);
      if (await act({ action: "choose", key })) await load();
      setChoosing(null);
    },
    [act, load]
  );

  const openChest = useCallback(
    async (week: string) => {
      setOpening(week);
      const [json] = await Promise.all([act({ action: "open-chest", week }), new Promise((r) => window.setTimeout(r, 450))]);
      if (json) {
        setRevealed({ week, label: json.label ?? "Objet", xp: json.xp ?? 0 });
        await load();
      }
      setOpening(null);
    },
    [act, load]
  );

  // Surbrillance de l'élément ciblé par ?focus=…, une fois les données là.
  useEffect(() => {
    if (!focus || !data) return;
    if (focus === "level") return flash("reussites-level");
    if (focus === "missions") return flash("missions-section");
    if (focus === "defis") return flash("defi-mois");
    if (focus === "succes") {
      setOpenSucces(true);
      return flash("succes");
    }
    if (focus === "bilan" || focus === "constellation" || focus === "vitrine" || focus === "collectif" || focus === "saisons") return flash(focus);
    const skillAt = data.constellation.skills.findIndex((sk) => sk.stars.some((st) => st.key === focus));
    if (skillAt >= 0) {
      setSkillIndex(skillAt);
      setStarFocus(focus);
      window.setTimeout(() => setStarFocus(null), 3200);
      return flash(`star-${focus}`);
    }
    const target = data.series.find((x) => x.id === focus || x.tiers.some((t) => t.key === focus));
    if (target) {
      setCategory("all");
      setAlbumOpen(true);
      flash(`ach-${target.id}`);
    }
  }, [focus, data]);

  const series = useMemo(() => (data ? data.series.filter((s) => category === "all" || s.category === category) : []), [data, category]);
  const countByCategory = useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const s of data?.series ?? []) {
      const c = (out[s.category] ??= { done: 0, total: 0 });
      c.total += s.tiers.length;
      c.done += s.tiers.filter((t) => t.unlockedAt).length;
    }
    return out;
  }, [data]);

  const level = data?.level;
  const toNext = level && level.nextXp !== null ? level.nextXp - level.xp : null;
  // Compétence affichée par défaut : celle dont la prochaine étoile est la plus proche.
  const defaultSkill = useMemo(() => {
    const skills = data?.constellation.skills ?? [];
    let best = 0;
    let bestPct = -1;
    skills.forEach((sk, i) => {
      const next = sk.stars.find((st) => !st.unlockedAt);
      if (next && next.pct > bestPct) {
        best = i;
        bestPct = next.pct;
      }
    });
    return best;
  }, [data]);
  const selectedSkill = skillIndex ?? defaultSkill;
  const doneCount = data?.missions.filter((m) => m.done).length ?? 0;
  const openAlbumAt = (seriesId: string) => {
    setCategory("all");
    setAlbumOpen(true);
    flash(`ach-${seriesId}`);
  };

  return (
    // « isolate » : le -z-10 de CosmeticDecorOverlay (Voûte céleste) reste
    // dans cette page (voir decor-overlay.tsx).
    <div className="relative isolate space-y-8">
      <CosmeticDecorOverlay cosmeticKey="papier-peint-succes" />
      <PageHeader
        icon={<IconTrophy className="h-6 w-6 text-amber-300" />}
        title="Réussites"
        description="Votre rang de créateur monte à chaque publication, mission ou accomplissement. Rien ne se perd : pas de rang qui baisse, et des boucliers pour votre série."
      />

      {failed && !data ? (
        <GlassCard>
          <p className="text-sm text-slate-400">Vos réussites ne sont pas disponibles pour le moment. Réessayez dans un instant.</p>
        </GlassCard>
      ) : !data || !level ? (
        <div className="space-y-4" aria-busy="true">
          <SkeletonCard lines={3} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
          <span className="sr-only">Chargement de vos réussites</span>
        </div>
      ) : (
        <>
          {/* Rang de créateur et prochaine action */}
          <section id="reussites-level" aria-label="Rang de créateur" className="reussites-banner relative scroll-mt-24 overflow-hidden rounded-3xl border p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,300px)] lg:items-center">
              <button type="button" onClick={() => setLevelsOpen(true)} className="mx-auto shrink-0 rounded-full transition hover:scale-[1.03] lg:mx-0" aria-label="Voir tous les rangs">
                <LevelRing level={level.level} pct={level.pct} size={124} stroke={8} animated />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-aurora-300">Rang {level.rank} sur 5</p>
                <h2 className="mt-1 font-display text-3xl font-semibold text-white">
                  <button type="button" onClick={() => setLevelsOpen(true)} className="text-left hover:underline hover:decoration-aurora-400/60 hover:underline-offset-4">
                    {level.name}
                  </button>
                </h2>
                <p className="mt-1 text-sm text-slate-300">{level.tagline}</p>
                <div className="relative mt-4 h-2.5 rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent-cyan via-nebula-400 to-aurora-400 transition-all duration-700" style={{ width: `${level.pct}%` }} />
                  {level.nextXp !== null && (
                    <span
                      className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_rgb(var(--c-aurora-400)/0.9)]"
                      style={{ left: `${Math.max(2, level.pct)}%` }}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className="mt-2 text-xs tabular-nums text-slate-400">
                  {level.pending ? (
                    <>
                      {fmt(level.xp)} XP · assez pour « {level.pending.name} »
                    </>
                  ) : level.nextXp !== null ? (
                    <>
                      {fmt(level.xp)} XP · encore {fmt(toNext ?? 0)} XP pour « {level.nextName} »
                    </>
                  ) : (
                    <>{fmt(level.xp)} XP · dernier palier atteint, bravo !</>
                  )}
                </p>
                {level.pending && (
                  <div className="mt-3 rounded-xl border border-amber-300/35 bg-amber-300/[0.07] px-3 py-2 text-xs text-amber-100">
                    <p>
                      <strong className="font-semibold">Rang {level.pending.name} en attente.</strong> Pour y entrer : {level.pending.condition}. Il vous manque{" "}
                      {level.pending.missing[0]}
                      {level.pending.missing.length > 1 && <> (les plus proches : {level.pending.missing.slice(1).join(", ")})</>}.
                    </p>
                    <button type="button" onClick={() => flash("constellation")} className="mt-1 font-medium text-amber-200 underline-offset-2 hover:underline">
                      Voir ma constellation →
                    </button>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {level.nextReward && <p className="text-xs text-slate-300">Prochaine récompense : {level.nextReward}</p>}
                  <button type="button" onClick={() => setLevelsOpen(true)} className="text-xs font-medium text-aurora-300 transition hover:text-white">
                    Voir tous les rangs →
                  </button>
                </div>
              </div>
              <NextActionCard action={data.nextAction} onChest={() => flash("coffre")} />
            </div>
          </section>
          <LevelsModal open={levelsOpen} onClose={() => setLevelsOpen(false)} xp={level.xp} level={level.level} conditions={data.constellation.conditions} />

          {/* Missions de la semaine */}
          <section id="missions-section" aria-labelledby="missions-title" className="scroll-mt-24 space-y-3 rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="missions-title" className="font-display text-lg font-semibold text-white">
                Missions de la semaine
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">Se termine dans {timeLeftLabel(new Date(data.week.endsAt))}</span>
                <StreakChips streak={data.streak} />
              </div>
            </div>
            {actionError && (
              <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">
                {actionError}
              </p>
            )}
            {data.launch.active && !showMissions ? (
              <LaunchCard launch={data.launch} onShowMissions={() => setShowMissions(true)} />
            ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.missions.map((m) => (
                <MissionCard
                  key={m.slot}
                  m={m}
                  revealAt={data.week.revealAt}
                  choices={m.slot === "progress" ? data.choices : undefined}
                  swapsLeft={data.swapsLeft}
                  busyKey={choosing}
                  onChoose={choose}
                />
              ))}
              <ChestCard
                chest={data.chest}
                doneCount={doneCount}
                pending={data.pendingChests}
                opening={opening}
                revealed={revealed && revealed.week === data.chest.week ? revealed : null}
                onOpen={openChest}
              />
            </div>
            )}
            {revealed && revealed.week !== data.chest.week && (
              <p role="status" className="nb-chest-reveal rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-200">
                Coffre de la semaine {revealed.week.split("-W")[1]} : {revealed.label} (+{revealed.xp} XP).
              </p>
            )}

            {/* Défi du mois */}
            <div
              id="defi-mois"
              className={clsx("flex scroll-mt-24 flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center", data.monthly.done ? "border-emerald-400/30 bg-emerald-400/[0.05]" : "border-white/[0.07] bg-white/[0.02]")}
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-white">
                  Défi du mois {monthOfLabel(data.month.id)} : {data.monthly.title.toLowerCase()}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {data.monthly.description}. Réussi = badge « {data.month.label} » dans votre profil, disponible ce mois-ci seulement.
                </p>
              </div>
              <div className="w-full shrink-0 sm:w-64">
                <Bar value={data.monthly.value} target={data.monthly.target} done={data.monthly.done} />
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={data.monthly.done ? "text-emerald-300" : "tabular-nums text-slate-400"}>
                    {data.monthly.done ? "Réussi" : `${fmt(data.monthly.value)} / ${fmt(data.monthly.target)} · ${daysLeft(new Date(data.month.endsAt))} jours restants`}
                  </span>
                  <XpChip xp={data.monthly.xp} done={data.monthly.done} />
                </div>
              </div>
            </div>
            {/* Défi collectif et badge de saison (lot C) */}
            <CollectiveCard collective={data.collective} seasons={data.seasons} />

            {(data.monthlyBadges.length > 0 || data.challengesDone > 0) && (
              <p className="text-xs text-slate-500">
                {data.challengesDone} mission{data.challengesDone > 1 ? "s" : ""} de la semaine réussie{data.challengesDone > 1 ? "s" : ""} · meilleure série : {data.streak.best} semaine{data.streak.best > 1 ? "s" : ""}
                {data.monthlyBadges.length > 0 && <> · badges du mois : {data.monthlyBadges.map((b) => b.label).join(", ")}</>}
              </p>
            )}
          </section>

          {lotBError && (
            <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">
              {lotBError}
            </p>
          )}

          {/* Bilan de la semaine (lot B) */}
          <WeeklyReview review={data.review} busy={reviewBusy} onChoose={chooseFocus} highlight={false} />

          {/* Constellation de compétences (lot B) */}
          <ConstellationSection
            data={data.constellation}
            selected={selectedSkill}
            onSelect={setSkillIndex}
            onLesson={(star, skill) => setLesson({ star, skill })}
            highlight={starFocus}
          />
          <LessonDialog star={lesson?.star ?? null} skill={lesson?.skill ?? null} onClose={() => setLesson(null)} />

          {/* Presque là */}
          {data.near.length > 0 && (
            <section aria-labelledby="near-title" className="space-y-3">
              <h2 id="near-title" className="font-display text-lg font-semibold text-white">
                Presque là
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {data.near.map((n) => (
                  <NearCard key={n.key} n={n} onOpen={() => openAlbumAt(n.seriesId)} />
                ))}
              </div>
            </section>
          )}

          {/* Vitrine, récompenses, carte de créateur (lot B) */}
          <ShowcaseSection showcase={data.showcase} rewards={data.rewards} busy={showcaseBusy} onSave={saveShowcase} highlight={false} />
          <FeaturedPanel
            featured={data.featured}
            busy={featureBusy}
            error={featureError}
            onConsent={(consent) => featureAction({ action: "feature-consent", consent })}
            onUse={(sharedVideoId) => featureAction({ action: "feature-use", sharedVideoId })}
            onRemove={(id) => featureAction({ action: "feature-remove", id })}
          />

          {/* Album des accomplissements */}
          <section id="album" aria-labelledby="accomplissements-title" className="scroll-mt-24 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="accomplissements-title" className="font-display text-lg font-semibold text-white">
                Album des accomplissements
              </h2>
              <button type="button" onClick={() => setAlbumOpen((v) => !v)} aria-expanded={albumOpen} className="text-xs font-medium text-aurora-300 transition hover:text-white">
                {data.unlockedCount} / {data.total} débloqués · {albumOpen ? "Replier" : "Ouvrir l'album"}
              </button>
            </div>
            {(() => {
              const starters = STARTER_SERIES.map((id) => data.series.find((x) => x.id === id)).filter((x): x is SeriesDTO => Boolean(x && x.tiers.some((t) => !t.unlockedAt)));
              if (starters.length === 0 || level.level > 4) return null;
              return (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aurora-300">Pour bien démarrer</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {starters.slice(0, 3).map((x) => {
                      const next = x.tiers.find((t) => !t.unlockedAt)!;
                      return (
                        <button
                          key={x.id}
                          type="button"
                          onClick={() => openAlbumAt(x.id)}
                          className="flex min-w-0 items-center gap-3 rounded-2xl border border-aurora-400/20 bg-aurora-500/[0.06] p-3 text-left transition hover:border-aurora-400/45"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-lg" aria-hidden="true">
                            {x.emoji}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-white">{next.description}</span>
                            <Bar value={x.value} target={next.target} className="mt-1.5" />
                            <span className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-slate-400">
                              {fmt(Math.min(x.value, next.target))} / {fmt(next.target)} {x.unit}
                              <XpChip xp={next.xp} />
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <SeasonShelf seasons={data.seasons} monthly={data.monthlyBadges} />
            {albumOpen && (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par catégorie">
                  <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
                    Tout
                  </FilterChip>
                  {CATEGORIES.map((c) => (
                    <FilterChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                      {c.label}
                      <span className="text-[10px] tabular-nums text-slate-500">
                        {countByCategory[c.id]?.done ?? 0}/{countByCategory[c.id]?.total ?? 0}
                      </span>
                    </FilterChip>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {series.map((s) => (
                    <AccomplishmentCard key={s.id} s={s} />
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  Seules les publications vraiment en ligne comptent (pas les brouillons ni les échecs), les réponses trop courtes du forum ne comptent pas, et les chiffres
                  d&apos;audience viennent de vos comptes connectés (Analytics et Engagements).
                </p>
              </>
            )}
          </section>
        </>
      )}

      {/* Succès (easter eggs), repliables, tout en bas */}
      <SuccesSection forceOpen={openSucces} />
      <Suspense fallback={null}>
        <FocusParam onFocus={setFocus} />
      </Suspense>
    </div>
  );
}
