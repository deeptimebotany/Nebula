"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { clsx } from "@/lib/clsx";
import { isUnlimitedPlan } from "@/lib/plans";

import type { BrandUsage } from "@/lib/billing/usage";

/** Barre de progression « publications ce mois » affichée au-dessus du
 * calendrier — masquée pour les paliers illimités. Depuis le Lot 4, les
 * chiffres viennent de /api/billing/usage (une seule requête, mêmes règles
 * que le quota appliqué côté serveur) au lieu d'être recomptés ici. */
export function QuotaBar({ brandId }: { brandId: string | undefined }) {
  const [usage, setUsage] = useState<BrandUsage | null>(null);

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    fetch(`/api/billing/usage?brandId=${brandId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setUsage(d as BrandUsage);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const plan = usage ? { plan: usage.plan, limits: usage.limits } : null;
  const used = usage?.postsThisMonth ?? 0;
  if (!plan || isUnlimitedPlan(plan.plan)) return null;

  const max = plan.limits.maxPostsPerMonth;
  const pct = Math.min(100, Math.round((used / max) * 100));
  const nearLimit = pct >= 80;

  return (
    <GlassCard hover={false} className="!p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-300">
          Publications créées ce mois — palier <span className="text-white">{plan.limits.label}</span>
        </span>
        <span className={clsx("font-medium", nearLimit ? "text-amber-300" : "text-white")}>
          {used} / {max}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={clsx(
            "h-full rounded-full transition-all",
            nearLimit ? "bg-gradient-to-r from-amber-500 to-red-400" : "bg-gradient-to-r from-nebula-500 to-accent-cyan"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {nearLimit && (
        <p className="mt-2 text-xs text-amber-300">
          Vous approchez de la limite mensuelle.{" "}
          <Link href="/billing" className="underline">
            Passez à un palier supérieur
          </Link>{" "}
          pour ne jamais être bloqué.
        </p>
      )}
    </GlassCard>
  );
}
