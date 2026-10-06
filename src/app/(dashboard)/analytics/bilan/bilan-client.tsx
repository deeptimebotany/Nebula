"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useBrand } from "@/components/brand-context";
import { MonthlySummaryView } from "@/components/monthly-summary/summary-view";
import { MonthlySummarySettings } from "@/components/monthly-summary/summary-settings";
import { monthTitle } from "@/lib/monthly-summary/period";
import type { MonthlySummaryData } from "@/lib/monthly-summary/types";

interface Response {
  data: MonthlySummaryData;
  months: string[];
  current: string;
  inProgress: boolean;
}

function Inner() {
  const params = useSearchParams();
  const { activeBrand, brands, setActiveBrandId } = useBrand();
  const [month, setMonth] = useState<string | null>(params.get("month"));
  const [res, setRes] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lien de l'e-mail : ouvre la marque du bilan si on en est membre.
  useEffect(() => {
    const wanted = params.get("brand");
    if (wanted && wanted !== activeBrand?.id && brands.some((b) => b.id === wanted)) setActiveBrandId(wanted);
    // Une seule fois, à l'arrivée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brandId = activeBrand?.id;
  useEffect(() => {
    if (!brandId) return;
    setError(null);
    const q = new URLSearchParams({ brandId, ...(month ? { month } : {}) });
    fetch(`/api/monthly-summary?${q.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((d as { error?: string }).error ?? "Bilan indisponible.");
        setRes(d as Response);
        if (!month) setMonth((d as Response).data.month);
      })
      .catch((e: Error) => setError(e.message));
  }, [brandId, month]);

  const data = res?.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bilan du mois"
        description={activeBrand ? `Les chiffres de ${activeBrand.name}, mois par mois : ce que contient l'e-mail du 3 du mois.` : "Choisissez une marque."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {res && res.months.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <span className="sr-only">Mois</span>
                <select
                  value={month ?? res.data.month}
                  onChange={(e) => {
                    setRes(null);
                    setMonth(e.target.value);
                  }}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"
                  aria-label="Mois du bilan"
                >
                  {res.months.map((m) => (
                    <option key={m} value={m}>
                      {monthTitle(m)}
                      {m === res.current ? " (en cours)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Link href="/analytics" className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:text-white">
              Analytics
            </Link>
          </div>
        }
      />

      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-sm text-red-300">{error}</p>}
      {!data && !error && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
      {data && !data.hasData && (
        <GlassCard hover={false}>
          <EmptyState
            bare
            title={`Pas encore de chiffres pour ${monthTitle(data.month).toLowerCase()}`}
            description={
              data.accounts.length === 0
                ? "Connectez un compte puis actualisez vos statistiques : Nebula relève ensuite vos chiffres chaque jour, tout seul, et votre bilan se remplit."
                : res?.inProgress
                  ? "Le mois vient de commencer : vos chiffres arrivent avec le prochain relevé quotidien de vos comptes."
                  : "Aucun relevé de vos comptes ce mois-là : Nebula ne relève vos chiffres que depuis leur connexion."
            }
            action={
              data.accounts.length === 0 ? (
                <Link href="/accounts" className="text-sm font-medium text-aurora-300 hover:text-white">
                  Connecter un compte →
                </Link>
              ) : undefined
            }
          />
        </GlassCard>
      )}
      {data && data.hasData && <MonthlySummaryView data={data} inProgress={Boolean(res?.inProgress)} />}

      <GlassCard hover={false}>
        <MonthlySummarySettings compact />
      </GlassCard>
    </div>
  );
}

export function BilanClient() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
