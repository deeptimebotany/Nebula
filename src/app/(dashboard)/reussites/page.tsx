"use client";

// Page « Réussites » (25/09/2026, maquette validée par Lucas) : en haut le
// niveau de créateur, puis les défis de la semaine et du mois, la section
// principale « Accomplissements » (objectifs concrets, par catégorie), et
// les « Succès » (easter eggs) repliables tout en bas.
//
// Tout est calculé côté serveur à partir de l'activité réelle (voir
// src/lib/reussites/engine.ts) : ouvrir la page réévalue les réussites.

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { FilterChip } from "@/components/ui/filter-chip";
import { IconTrophy } from "@/components/dashboard/icons";
import { CosmeticDecorOverlay } from "@/components/cosmetics/decor-overlay";
import { useBootstrap } from "@/components/bootstrap-provider";
import { LevelRing } from "@/components/reussites/level-ring";
import { SuccesSection } from "@/components/reussites/succes-section";
import { CATEGORIES, monthOfLabel, type ReussiteCategory } from "@/lib/reussites/catalog";
import { daysLeft, timeLeftLabel } from "@/lib/reussites/periods";
import type { ChallengeDTO, ReussitesPageDTO, SeriesDTO } from "@/lib/reussites/types";
import { clsx } from "@/lib/clsx";

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function XpChip({ xp, done }: { xp: number; done?: boolean }) {
  return (
    <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", done ? "bg-emerald-400/15 text-emerald-300" : "bg-nebula-500/20 text-aurora-200")}>
      +{xp} XP
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

function ChallengeCard({ c }: { c: ChallengeDTO }) {
  return (
    <div className={clsx("flex h-full flex-col rounded-2xl border p-4 transition", c.done ? "border-emerald-400/30 bg-emerald-400/[0.05]" : "border-white/[0.07] bg-white/[0.02]")}>
      <p className="font-display text-sm font-semibold text-white">
        {c.done && (
          <span className="mr-1 text-emerald-300" aria-hidden="true">
            ✓
          </span>
        )}
        {c.title}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">{c.description}</p>
      <div className="mt-auto pt-3">
        <Bar value={c.value} target={c.target} done={c.done} />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={c.done ? "text-emerald-300" : "tabular-nums text-slate-400"}>{c.done ? "Réussi" : `${fmt(c.value)} / ${fmt(c.target)}`}</span>
          <XpChip xp={c.xp} done={c.done} />
        </div>
      </div>
    </div>
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
    <div className={clsx("flex h-full flex-col rounded-2xl border p-4", unlocked ? "border-amber-400/40 bg-amber-400/[0.05]" : "border-white/[0.07] bg-white/[0.02]")}>
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
      </div>
    </div>
  );
}

export default function ReussitesPage() {
  const { refresh: refreshBootstrap } = useBootstrap();
  const [data, setData] = useState<ReussitesPageDTO | null>(null);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState<ReussiteCategory | "all">("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reussites", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData((await res.json()) as ReussitesPageDTO);
      // Compteur du menu remis à zéro, niveau à jour, et célébration des
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

  return (
    // « isolate » : le -z-10 de CosmeticDecorOverlay (Voûte céleste) reste
    // dans cette page (voir decor-overlay.tsx).
    <div className="relative isolate space-y-8">
      <CosmeticDecorOverlay cosmeticKey="papier-peint-succes" />
      <PageHeader
        icon={<IconTrophy className="h-6 w-6 text-amber-300" />}
        title="Réussites"
        description="Votre niveau de créateur monte à chaque publication, défi ou accomplissement. Rien ne se perd : pas de niveau qui baisse, pas de série punitive."
      />

      {failed && !data ? (
        <GlassCard>
          <p className="text-sm text-slate-400">Vos réussites ne sont pas disponibles pour le moment. Réessayez dans un instant.</p>
        </GlassCard>
      ) : !data || !level ? (
        <div className="space-y-4" aria-busy="true">
          <SkeletonCard lines={3} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
          <span className="sr-only">Chargement de vos réussites</span>
        </div>
      ) : (
        <>
          {/* Niveau de créateur */}
          <section aria-label="Niveau de créateur" className="reussites-banner relative overflow-hidden rounded-3xl border p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <LevelRing level={level.level} pct={level.pct} size={92} />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-2xl font-semibold text-white">{level.name}</h2>
                <p className="mt-0.5 text-sm text-slate-300">{level.tagline}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-gradient-to-r from-nebula-500 via-aurora-400 to-accent-cyan transition-all duration-700" style={{ width: `${level.pct}%` }} />
                </div>
                <p className="mt-2 text-xs tabular-nums text-slate-400">
                  {level.nextXp !== null ? (
                    <>
                      {fmt(level.xp)} / {fmt(level.nextXp)} XP · encore {fmt(toNext ?? 0)} XP pour le niveau {level.level + 1} « {level.nextName} »
                    </>
                  ) : (
                    <>{fmt(level.xp)} XP · niveau maximum atteint, bravo !</>
                  )}
                </p>
              </div>
              {level.nextReward && (
                <div className="reussites-reward-box shrink-0 rounded-2xl border px-4 py-3 sm:max-w-[220px]">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Récompense du niveau {level.level + 1}</p>
                  <p className="mt-1 text-sm font-medium text-white">{level.nextReward}</p>
                </div>
              )}
            </div>
            {level.title && <p className="mt-4 text-xs text-aurora-200">Votre titre dans la Communauté : « {level.title} »</p>}
          </section>

          {/* Défis */}
          <section aria-labelledby="defis-title" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="defis-title" className="font-display text-lg font-semibold text-white">
                <span aria-hidden="true">⚡ </span>Défis de la semaine
              </h2>
              <span className="text-xs text-slate-400">Se termine dans {timeLeftLabel(new Date(data.week.endsAt))} · les mêmes pour tout le monde</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {data.weekly.map((c) => (
                <ChallengeCard key={c.key} c={c} />
              ))}
            </div>
            <div className={clsx("flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center", data.monthly.done ? "border-emerald-400/30 bg-emerald-400/[0.05]" : "border-white/[0.07] bg-white/[0.02]")}>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-white">
                  <span aria-hidden="true">🌙 </span>
                  Défi du mois {monthOfLabel(data.month.id)} : {data.monthly.title.toLowerCase()}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {data.monthly.description}. Réussi = badge du mois « {data.month.label} » dans votre profil.
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
            {(data.monthlyBadges.length > 0 || data.challengesDone > 0) && (
              <p className="text-xs text-slate-500">
                {data.challengesDone} défi{data.challengesDone > 1 ? "s" : ""} de la semaine réussi{data.challengesDone > 1 ? "s" : ""}
                {data.monthlyBadges.length > 0 && <> · badges du mois : {data.monthlyBadges.map((b) => b.label).join(", ")}</>}
              </p>
            )}
          </section>

          {/* Accomplissements (section principale) */}
          <section aria-labelledby="accomplissements-title" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="accomplissements-title" className="font-display text-lg font-semibold text-white">
                <span aria-hidden="true">🎯 </span>Accomplissements
              </h2>
              <span className="text-xs tabular-nums text-slate-400">
                {data.unlockedCount} / {data.total} débloqués
              </span>
            </div>
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
          </section>
        </>
      )}

      {/* Succès (easter eggs), repliables, sous les accomplissements */}
      <SuccesSection />
    </div>
  );
}
