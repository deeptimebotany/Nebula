"use client";

// Cartes du lot C des Réussites (v2) :
//  - LaunchCard : Premier décollage, 5 étapes des 7 premiers jours ;
//  - CollectiveCard : défi collectif du mois (total de la communauté, part
//    du créateur, jamais celle des autres) et badge de saison ;
//  - SeasonShelf : badges de saison, collectifs et du mois, avec leur ruban daté ;
//  - RarityMark : forme selon la rareté réelle (rond, hexagone, étoile à 8
//    branches, étoile et halo) et part des créateurs.
import Link from "next/link";
import type { CollectiveDTO, LaunchDTO, RarityDTO, SeasonsDTO } from "@/lib/reussites/types";
import { clsx } from "@/lib/clsx";

const fmt = (n: number) => n.toLocaleString("fr-FR");

function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path d="M3 8.5 L6.5 11.5 L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LaunchCard({ launch, onShowMissions }: { launch: LaunchDTO; onShowMissions: () => void }) {
  const next = launch.steps.find((s) => !s.done) ?? null;
  const daysLeft = Math.max(1, Math.ceil((new Date(launch.endsAt).getTime() - Date.now()) / 86_400_000));
  return (
    <div className="rounded-2xl border border-accent-cyan/30 bg-accent-cyan/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-cyan">Premier décollage</p>
          <p className="mt-1 font-display text-lg font-semibold text-white">5 étapes pour bien démarrer</p>
          <p className="text-xs text-slate-400">
            Votre compte compte déjà : départ à 20 %. Encore {daysLeft} jour{daysLeft > 1 ? "s" : ""} pour ce parcours ; les étapes restent comptées ensuite.
          </p>
        </div>
        <p className="font-display text-3xl font-semibold tabular-nums text-white">{launch.pct} %</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={launch.pct} aria-label="Premier décollage">
        <div className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-aurora-400 transition-all duration-700" style={{ width: `${launch.pct}%` }} />
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {launch.steps.map((s, i) => (
          <li key={s.key} className={clsx("flex flex-col gap-1.5 rounded-xl border p-3", s.done ? "border-emerald-400/30 bg-emerald-400/[0.05]" : next?.key === s.key ? "border-accent-cyan/40 bg-white/[0.02]" : "border-white/[0.07] bg-white/[0.015]")}>
            <p className="flex items-center gap-1.5 text-sm font-medium text-white">
              {s.done ? <IconCheck className="h-4 w-4 shrink-0 text-emerald-300" /> : <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/25 text-[9px] text-slate-400">{i + 1}</span>}
              {s.title}
            </p>
            <p className="text-[11px] leading-snug text-slate-400">{s.description}</p>
            {!s.done && (
              <Link href={s.href} className="mt-auto inline-flex min-h-[32px] items-center text-xs font-medium text-aurora-300 transition hover:text-white">
                {s.action} <span aria-hidden="true">&nbsp;→</span>
              </Link>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>Les 5 étapes faites : accomplissement « Décollage réussi » (+100 XP).</span>
        <button type="button" onClick={onShowMissions} className="font-medium text-aurora-300 transition hover:text-white">
          Voir quand même mes missions de la semaine
        </button>
      </div>
    </div>
  );
}

export function CollectiveCard({ collective, seasons }: { collective: CollectiveDTO; seasons: SeasonsDTO }) {
  const pct = collective.target > 0 ? Math.min(100, Math.round((collective.total / collective.target) * 100)) : 0;
  const cur = seasons.current;
  const doneInSeason = cur.months.filter((m) => m.done).length;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div id="collectif" className={clsx("scroll-mt-24 rounded-2xl border p-4", collective.reached ? "border-emerald-400/30 bg-emerald-400/[0.05]" : "border-white/[0.07] bg-white/[0.02]")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aurora-300">Défi collectif · {collective.label}</p>
        <p className="mt-1 font-display text-sm font-semibold text-white">
          Tous ensemble : {fmt(collective.target)} vidéos mises en ligne ce mois-ci
        </p>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={collective.target} aria-valuenow={Math.min(collective.total, collective.target)} aria-label="Défi collectif">
          <div className={clsx("h-full rounded-full transition-all duration-700", collective.reached ? "bg-emerald-400" : "bg-gradient-to-r from-nebula-500 to-accent-cyan")} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-xs tabular-nums text-slate-400">
          {fmt(collective.total)} / {fmt(collective.target)} vidéos · {fmt(collective.participants)} créateur{collective.participants > 1 ? "s" : ""}
        </p>
        <p className="mt-2 text-xs text-slate-300">
          {collective.earned
            ? `Objectif atteint : badge collectif ${collective.label.toLowerCase()} gagné (+${collective.xp} XP).`
            : collective.reached
              ? collective.mine > 0
                ? "Objectif atteint : votre badge arrive."
                : "Objectif atteint ! Publiez une vidéo ce mois-ci pour recevoir aussi le badge collectif."
              : collective.mine > 0
                ? `Votre part : ${fmt(collective.mine)} vidéo${collective.mine > 1 ? "s" : ""}. Si l'objectif est atteint, badge collectif et +${collective.xp} XP pour chaque participant.`
                : `Une vidéo suffit pour participer : si l'objectif est atteint, badge collectif et +${collective.xp} XP pour chaque participant.`}
        </p>
      </div>
      <div id="saisons" className={clsx("scroll-mt-24 rounded-2xl border p-4", cur.earned ? "border-amber-300/40 bg-amber-300/[0.06]" : "border-white/[0.07] bg-white/[0.02]")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
          <span aria-hidden="true">{cur.emoji} </span>Badge de saison · {cur.label}
        </p>
        <p className="mt-1 text-xs text-slate-300">
          {cur.earned ? `Gagné (+${cur.xp} XP). Il ne se gagne que pendant la saison.` : `Réussir le défi du mois ${cur.target} fois cette saison (+${cur.xp} XP). Il ne se gagne que pendant la saison.`}
        </p>
        <ul className="mt-2.5 flex gap-1.5" aria-label={`${doneInSeason} défi${doneInSeason > 1 ? "s" : ""} du mois réussi${doneInSeason > 1 ? "s" : ""} cette saison`}>
          {cur.months.map((m) => (
            <li key={m.id} className={clsx("flex-1 rounded-lg border px-2 py-1.5 text-center text-[11px]", m.done ? "border-amber-300/50 bg-amber-300/[0.12] text-amber-100" : "border-white/[0.08] text-slate-400")}>
              {m.label.split(" ")[0]}
              {m.done && <IconCheck className="ml-1 inline h-3 w-3" />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SeasonShelf({ seasons, monthly }: { seasons: SeasonsDTO; monthly: { period: string; label: string }[] }) {
  const items = [
    ...seasons.badges.map((b) => ({ key: `s-${b.id}`, emoji: b.emoji, title: b.label, ribbon: "Saison", tone: "amber" as const })),
    ...seasons.collective.map((c) => ({ key: `c-${c.month}`, emoji: "🤝", title: `Défi collectif`, ribbon: c.label, tone: "cyan" as const })),
    ...monthly.map((m) => ({ key: `m-${m.period}`, emoji: "🌙", title: "Défi du mois", ribbon: m.label, tone: "violet" as const }))
  ];
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Badges datés</p>
      <div className="flex flex-wrap gap-2">
        {items.map((b) => (
          <div
            key={b.key}
            className={clsx(
              "flex items-center gap-2 rounded-xl border px-3 py-2",
              b.tone === "amber" ? "border-amber-300/40 bg-amber-300/[0.06]" : b.tone === "cyan" ? "border-accent-cyan/35 bg-accent-cyan/[0.05]" : "border-aurora-400/30 bg-aurora-500/[0.06]"
            )}
          >
            <span className="text-lg leading-none" aria-hidden="true">
              {b.emoji}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-white">{b.title}</span>
              <span className="block text-[10px] uppercase tracking-[0.1em] text-slate-400">{b.ribbon}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const RARITY_NAME: Record<RarityDTO["tier"], string> = { commun: "Commun", rare: "Rare", epique: "Épique", legendaire: "Légendaire" };

/** Forme de la rareté (rond, hexagone, étoile à 8 branches, étoile et halo).
 *  Couleur par classe (.nb-rarity-*, globals.css) : plus soutenue en mode clair. */
export function RarityShape({ tier, className }: { tier: RarityDTO["tier"]; className?: string }) {
  const c = "currentColor";
  return (
    <svg viewBox="0 0 20 20" className={clsx(`nb-rarity-${tier}`, className)} aria-hidden="true">
      {tier === "legendaire" && <circle cx="10" cy="10" r="9.2" fill="none" stroke={c} strokeOpacity="0.45" strokeWidth="1.2" className="nb-rarity-halo" />}
      {tier === "commun" && <circle cx="10" cy="10" r="6.5" fill={c} fillOpacity="0.25" stroke={c} strokeWidth="1.5" />}
      {tier === "rare" && <path d="M10 3 L16 6.5 L16 13.5 L10 17 L4 13.5 L4 6.5 Z" fill={c} fillOpacity="0.25" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />}
      {tier === "epique" && (
        <path d="M10 2.5 L11.6 7 L15.8 4.2 L13 8.4 L17.5 10 L13 11.6 L15.8 15.8 L11.6 13 L10 17.5 L8.4 13 L4.2 15.8 L7 11.6 L2.5 10 L7 8.4 L4.2 4.2 L8.4 7 Z" fill={c} fillOpacity="0.25" stroke={c} strokeWidth="1.2" strokeLinejoin="round" />
      )}
      {tier === "legendaire" && <path d="M10 4 L11.8 8.2 L16 8.5 L12.8 11.3 L13.8 15.6 L10 13.3 L6.2 15.6 L7.2 11.3 L4 8.5 L8.2 8.2 Z" fill={c} fillOpacity="0.35" stroke={c} strokeWidth="1.2" strokeLinejoin="round" />}
    </svg>
  );
}

/** « Rare · 12 % des créateurs ». */
export function RarityMark({ rarity, className }: { rarity: RarityDTO | null; className?: string }) {
  if (!rarity) return null;
  const label = `${RARITY_NAME[rarity.tier]} · ${rarity.pct.toLocaleString("fr-FR")} % des créateurs`;
  return (
    <span className={clsx("inline-flex items-center gap-1 text-[10.5px] text-slate-400", className)} title={label}>
      <RarityShape tier={rarity.tier} className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}
