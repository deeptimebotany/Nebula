// État vide partagé : icône, titre, explication courte et UNE action
// principale (plus une secondaire optionnelle). À utiliser chaque fois
// qu'une page n'a encore rien à montrer (aucun compte connecté, aucune
// publication, aucun rapport...) plutôt qu'une simple phrase grise.
import type { ReactNode } from "react";
import { clsx } from "@/lib/clsx";
import { GlassCard } from "./glass-card";

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Sans carte (quand l'état vide est déjà dans une GlassCard). */
  bare?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, action, secondaryAction, bare, className }: EmptyStateProps) {
  const body = (
    <div className={clsx("flex flex-col items-center px-4 py-10 text-center", bare && className)}>
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-aurora-300">
          {icon}
        </div>
      )}
      <h3 className="font-display text-base font-semibold text-white">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-slate-400">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
  if (bare) return body;
  return (
    <GlassCard hover={false} className={clsx("p-0", className)}>
      {body}
    </GlassCard>
  );
}
