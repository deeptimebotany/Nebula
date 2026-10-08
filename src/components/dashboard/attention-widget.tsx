"use client";

// Widget « À traiter » de la Vue d'ensemble (Lot 4) : ce qui demande une
// action — publications en échec, comptes à reconnecter, brouillons en
// attente. Chaque ligne mène directement à l'endroit où agir. Ne s'affiche
// pas quand tout va bien (une ligne « rien à signaler » à la place).
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { GlassCard } from "@/components/ui/glass-card";
import { IconAlert, IconCheck, IconLink, IconList } from "@/components/dashboard/icons";

export interface AttentionItem {
  key: string;
  tone: "danger" | "warning" | "neutral";
  label: string;
  description: string;
  href: string;
}

// V2 (08/10/2026) : des lignes, plus des encadrés — la couleur reste sur
// l'icône et le titre (rouge échec, ambre à reconnecter).
const TONE_CLASS: Record<AttentionItem["tone"], string> = {
  danger: "text-red-300",
  warning: "text-amber-300",
  neutral: "text-slate-200"
};

const TONE_ICON: Record<AttentionItem["tone"], (p: { className?: string }) => JSX.Element> = {
  danger: IconAlert,
  warning: IconLink,
  neutral: IconList
};

export function AttentionWidget({ items, loading }: { items: AttentionItem[]; loading: boolean }) {
  return (
    <GlassCard hover={false}>
      <h2 className="mb-3 font-display text-base font-medium text-white">À traiter</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Vérification en cours…</p>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
          Rien à signaler : aucun échec, aucun compte à reconnecter.
        </p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {items.map((item) => {
            const Icon = TONE_ICON[item.tone];
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={clsx("flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-[color:var(--nb-hover)]", TONE_CLASS[item.tone])}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.label}</span>
                    <span className="block text-xs text-slate-500">{item.description}</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-500">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
