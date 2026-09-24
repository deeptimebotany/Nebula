"use client";

// Fenêtre des grades (24/09/2026) : un clic sur son niveau (page Réussites,
// carte du tableau de bord) ouvre, au lieu d'une nouvelle page, une fenêtre
// élégante sur fond flouté avec les 8 grades, sa progression actuelle et les
// récompenses associées. La liste défile en douceur et s'ouvre centrée sur
// le grade en cours.
import { useEffect, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { LEVELS } from "@/lib/reussites/catalog";
import { LevelRing } from "@/components/reussites/level-ring";
import { clsx } from "@/lib/clsx";

const fmt = (n: number) => n.toLocaleString("fr-FR");

export function LevelsModal({ open, onClose, xp, level }: { open: boolean; onClose: () => void; xp: number; level: number }) {
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => currentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Les grades de créateur" maxWidthClassName="max-w-xl">
      <p className="-mt-2 mb-4 text-sm text-slate-400">
        Chaque publication, défi ou accomplissement rapporte de l&apos;XP. Vous en avez <strong className="text-white">{fmt(xp)}</strong> : un grade atteint ne se perd jamais.
      </p>
      <ol className="nb-thin-scroll -mr-2 max-h-[60vh] space-y-2 overflow-y-auto scroll-smooth pr-2">
        {LEVELS.map((l, i) => {
          const next = LEVELS[i + 1];
          const reached = l.level < level;
          const current = l.level === level;
          const span = next ? next.minXp - l.minXp : 0;
          const pct = current ? (next ? Math.min(99, Math.floor(((xp - l.minXp) / span) * 100)) : 100) : reached ? 100 : 0;
          return (
            <li
              key={l.level}
              ref={current ? currentRef : undefined}
              aria-current={current ? "step" : undefined}
              className={clsx(
                "flex items-center gap-4 rounded-2xl border p-3.5 transition",
                current ? "border-aurora-400/60 bg-aurora-500/[0.1] shadow-[0_0_24px_-8px_rgb(var(--c-aurora-400)/0.6)]" : reached ? "border-emerald-400/25 bg-emerald-400/[0.04]" : "border-white/[0.07] bg-white/[0.02]"
              )}
            >
              <LevelRing level={l.level} pct={pct} size={52} stroke={5} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 font-display text-sm font-semibold text-white">
                  {l.name}
                  <span className="text-[11px] font-normal tabular-nums text-slate-500">dès {fmt(l.minXp)} XP</span>
                  {current && <span className="rounded-full bg-aurora-400/20 px-2 py-0.5 text-[10px] font-semibold text-aurora-200">Votre grade</span>}
                  {reached && <span className="text-[11px] text-emerald-300">✓ atteint</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{l.tagline}</p>
                {l.reward && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-300">
                    <span className="h-2 w-2 shrink-0 rounded-[3px] bg-gradient-to-br from-aurora-300 to-accent-cyan" aria-hidden="true" />
                    {reached || current ? "Gagné : " : "Récompense : "}
                    {l.reward}
                  </p>
                )}
                {current && next && (
                  <p className="mt-1 text-[11px] tabular-nums text-aurora-200">
                    {fmt(xp - l.minXp)} / {fmt(span)} XP · encore {fmt(next.minXp - xp)} XP pour « {next.name} »
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
