import { GlassCard } from "./glass-card";
import { clsx } from "@/lib/clsx";

export function StatCard({
  label,
  value,
  delta,
  suffix,
  icon,
  badge
}: {
  label: string;
  value: string;
  delta?: number;
  suffix?: string;
  icon?: React.ReactNode;
  // Petit insigne optionnel (ex : franchissement d'un palier d'abonnés) —
  // distinct de `icon`, affiché comme une puce à côté du libellé.
  badge?: React.ReactNode;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-slate-400">
          {label}
          {badge && (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-amber-300">
              {badge}
            </span>
          )}
        </span>
        {icon && <div className="text-aurora-400">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-medium text-white">{value}</span>
        {suffix && <span className="text-sm text-slate-400">{suffix}</span>}
      </div>
      {delta !== undefined && (
        <span
          className={clsx(
            "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            positive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
          )}
        >
          {positive ? "▲" : "▼"} {Math.abs(delta).toLocaleString("fr-FR")}
          <span className="text-slate-400">vs 30j</span>
        </span>
      )}
    </GlassCard>
  );
}
