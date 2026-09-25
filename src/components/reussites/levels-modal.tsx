"use client";

// Fenêtre des rangs (24/09/2026, rangs de la v2 le 26/09/2026) : un clic sur
// son rang (page Réussites, carte du tableau de bord) ouvre une fenêtre sur
// fond flouté avec les 5 rangs et leurs 3 paliers, la progression actuelle
// et les récompenses. La liste s'ouvre centrée sur le rang en cours.
// Lot B : condition de variété des rangs Étoile, Constellation, Nébuleuse.
import { useEffect, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { RANKS, STEPS } from "@/lib/reussites/catalog";
import { RankEmblem } from "@/components/reussites/rank-emblem";
import { clsx } from "@/lib/clsx";

const fmt = (n: number) => n.toLocaleString("fr-FR");

export function LevelsModal({
  open,
  onClose,
  xp,
  level,
  conditions
}: {
  open: boolean;
  onClose: () => void;
  xp: number;
  level: number;
  /** Condition de variété de chaque rang (page Réussites) : texte et remplie ou non. */
  conditions?: { rank: number; text: string; met: boolean }[];
}) {
  const currentRef = useRef<HTMLLIElement>(null);
  const currentRank = STEPS.find((s) => s.step === level)?.rank ?? 1;

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => currentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Les rangs de créateur" maxWidthClassName="max-w-xl">
      <p className="-mt-2 mb-4 text-sm text-slate-400">
        Chaque publication, mission, étoile ou accomplissement rapporte de l&apos;XP. Vous en avez <strong className="text-white">{fmt(xp)}</strong> : un rang atteint ne se perd jamais.
        Les trois derniers rangs demandent aussi des compétences variées (constellation).
      </p>
      <ol className="nb-thin-scroll -mr-2 max-h-[60vh] space-y-2 overflow-y-auto scroll-smooth pr-2">
        {RANKS.map((r) => {
          const steps = STEPS.filter((s) => s.rank === r.rank);
          const reached = r.rank < currentRank;
          const current = r.rank === currentRank;
          const rewards = steps.filter((s) => s.reward);
          return (
            <li
              key={r.id}
              ref={current ? currentRef : undefined}
              aria-current={current ? "step" : undefined}
              className={clsx(
                "flex items-start gap-4 rounded-2xl border p-3.5 transition",
                current ? "border-aurora-400/60 bg-aurora-500/[0.1] shadow-[0_0_24px_-8px_rgb(var(--c-aurora-400)/0.6)]" : reached ? "border-emerald-400/25 bg-emerald-400/[0.04]" : "border-white/[0.07] bg-white/[0.02]"
              )}
            >
              <RankEmblem rankId={r.id} size={48} className={clsx(!reached && !current && "opacity-60")} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 font-display text-sm font-semibold text-white">
                  {r.name}
                  <span className="text-[11px] font-normal tabular-nums text-slate-500">dès {fmt(r.tiers[0])} XP</span>
                  {current && <span className="rounded-full bg-aurora-400/20 px-2 py-0.5 text-[10px] font-semibold text-aurora-200">Votre rang</span>}
                  {reached && <span className="text-[11px] text-emerald-300">✓ atteint</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{r.tagline}</p>
                {(() => {
                  const cond = conditions?.find((c) => c.rank === r.rank);
                  if (!cond) return null;
                  return (
                    <p className="mt-1 text-[11px] text-slate-300">
                      Pour y entrer : {cond.text}
                      {cond.met && <span className="ml-1.5 text-emerald-300">✓ remplie</span>}
                    </p>
                  );
                })()}
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Paliers du rang ${r.name}`}>
                  {steps.map((s) => {
                    const got = s.step <= level;
                    const here = s.step === level;
                    return (
                      <span
                        key={s.step}
                        className={clsx(
                          "rounded-full border px-2 py-0.5 text-[10.5px] tabular-nums",
                          here ? "border-aurora-400/60 text-white" : got ? "border-emerald-400/30 text-emerald-300" : "border-white/10 text-slate-400"
                        )}
                      >
                        {s.name.replace(`${r.name} `, "")} · {fmt(s.minXp)} XP
                      </span>
                    );
                  })}
                </div>
                {rewards.map((s) => (
                  <p key={s.step} className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-300">
                    <span className="h-2 w-2 shrink-0 rounded-[3px] bg-gradient-to-br from-aurora-300 to-accent-cyan" aria-hidden="true" />
                    {s.step <= level ? "Gagné : " : `${s.name} : `}
                    {s.reward}
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
