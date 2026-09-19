"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { clsx } from "@/lib/clsx";
import { isUnlimitedPlan, type Plan } from "@/lib/plans";

interface PlanResponse {
  plan: Plan;
  limits: { label: string; maxPostsPerMonth: number };
}

/** Barre de progression "publications programmées ce mois" affichée
 * au-dessus du calendrier — masquée pour le palier Agence (illimité). */
export function QuotaBar({ brandId }: { brandId: string | undefined }) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [used, setUsed] = useState(0);

  useEffect(() => {
    if (!brandId) return;
    fetch(`/api/billing/plan?brandId=${brandId}`)
      .then((r) => r.json())
      .then(setPlan);
    fetch(`/api/posts?brandId=${brandId}`)
      .then((r) => r.json())
      .then((d) => {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const count = (d.posts ?? []).filter((p: { createdAt: string }) => new Date(p.createdAt) >= startOfMonth).length;
        setUsed(count);
      });
  }, [brandId]);

  if (!plan || isUnlimitedPlan(plan.plan)) return null;

  const max = plan.limits.maxPostsPerMonth;
  const pct = Math.min(100, Math.round((used / max) * 100));
  const nearLimit = pct >= 80;

  return (
    <GlassCard hover={false} className="!p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-300">
          Publications programmées ce mois — palier <span className="text-white">{plan.limits.label}</span>
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
