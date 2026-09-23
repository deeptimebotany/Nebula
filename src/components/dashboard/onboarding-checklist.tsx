"use client";

// Checklist de démarrage de la Vue d'ensemble (Lot 4) : quatre étapes
// RÉELLES, calculées à partir des données de la marque (jamais un
// pourcentage arbitraire), visibles tant qu'elles ne sont pas toutes faites.
// Avant : un bandeau à trois étapes qui disparaissait dès le premier compte
// connecté, même si rien d'autre n'était fait. « Masquer » est mémorisé sur
// l'appareil, par marque ; la checklist réapparaît d'elle-même sur un autre
// appareil tant qu'il reste des étapes.
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { GlassCard } from "@/components/ui/glass-card";
import { IconCheck } from "@/components/dashboard/icons";

export interface ChecklistStep {
  key: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

const DISMISS_PREFIX = "nebula:onboarding-dismissed:";

export function OnboardingChecklist({ brandId, steps }: { brandId: string; steps: ChecklistStep[] }) {
  const [dismissed, setDismissed] = useState(true); // masquée tant qu'on n'a pas lu le stockage (pas de flash)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_PREFIX + brandId) === "1");
    } catch {
      setDismissed(false);
    }
  }, [brandId]);

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  if (dismissed || allDone) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_PREFIX + brandId, "1");
    } catch {
      // ignore
    }
  }

  const next = steps.find((s) => !s.done);
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <GlassCard hover={false} className="border-aurora-400/25 bg-nebula-700/[0.12]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Mise en route</p>
          <p className="text-xs text-slate-400">
            {doneCount} / {steps.length} étapes faites{next ? ` — prochaine : ${next.label.toLowerCase()}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-aurora-300">{percent} %</span>
          <button type="button" onClick={dismiss} className="text-xs text-slate-500 hover:text-white hover:underline">
            Masquer
          </button>
        </div>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progression de la mise en route">
        <div className="h-full rounded-full bg-gradient-to-r from-nebula-500 to-aurora-400 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => {
          const isNext = step.key === next?.key;
          const inner = (
            <>
              <span
                className={clsx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.done ? "bg-emerald-400/20 text-emerald-300" : isNext ? "bg-aurora-400/20 text-aurora-200" : "bg-white/10 text-slate-400"
                )}
                aria-hidden="true"
              >
                {step.done ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={clsx("block text-sm", step.done ? "text-slate-400 line-through decoration-slate-600" : "text-white")}>{step.label}</span>
                <span className="block text-xs text-slate-500">{step.description}</span>
              </span>
            </>
          );
          return (
            <li key={step.key}>
              {step.done ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">{inner}</div>
              ) : (
                <Link
                  href={step.href}
                  className={clsx(
                    "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition",
                    isNext ? "border-aurora-400/40 bg-aurora-400/[0.08] hover:bg-aurora-400/[0.14]" : "border-white/10 bg-white/[0.02] hover:border-white/25"
                  )}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}
