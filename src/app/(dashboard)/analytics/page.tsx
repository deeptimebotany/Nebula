"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useBrand } from "@/components/brand-context";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { NetworkBadge } from "@/components/ui/network-badge";
import { NETWORK_META, type ChartPoint, type Network } from "@/lib/types";
import { GrowthChart } from "@/components/dashboard/growth-chart";

interface AnalyticsConnection {
  id: string;
  network: Network;
  displayName: string;
  handle?: string | null;
  snapshots: { capturedAt: string; followers: number; reach: number; impressions: number }[];
}

export default function AnalyticsPage() {
  const { activeBrand } = useBrand();
  const [connections, setConnections] = useState<AnalyticsConnection[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!activeBrand) return;
    setLoading(true);
    const res = await fetch(`/api/analytics?brandId=${activeBrand.id}`);
    const data = await res.json();
    setConnections(data.connections ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand]);

  async function onSync() {
    if (!activeBrand) return;
    setSyncing(true);
    await fetch("/api/analytics/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id })
    });
    await load();
    setSyncing(false);
  }

  const hasRealData = connections.some((c) => c.snapshots.length > 0);
  const networksToShow: Network[] = connections.map((c) => c.network);

  const chartData = useMemo(() => {
    const byDate = new Map<string, ChartPoint>();
    for (const c of connections) {
      for (const s of c.snapshots) {
        const key = s.capturedAt.slice(5, 10);
        const point: ChartPoint = byDate.get(key) ?? { date: key };
        point[c.network] = s.followers;
        byDate.set(key, point);
      }
    }
    return Array.from(byDate.values());
  }, [connections]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">
            {hasRealData
              ? "Basé sur les dernières synchronisations réelles de vos comptes."
              : "Connectez puis synchronisez un compte pour voir vos vraies statistiques ici."}
          </p>
        </div>
        <Button onClick={onSync} disabled={syncing || connections.length === 0}>
          {syncing ? "Synchronisation..." : "Actualiser depuis les réseaux"}
        </Button>
      </div>

      {connections.length === 0 && !loading ? (
        <GlassCard className="text-center">
          <p className="text-sm text-slate-400">Aucun compte connecté pour l&apos;instant.</p>
          <Link href="/accounts" className="mt-3 inline-block">
            <Button variant="outline">Connecter un réseau</Button>
          </Link>
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {networksToShow.map((n) => {
              const real = connections.find((c) => c.network === n);
              const latest = real?.snapshots.at(-1);
              const previous = real?.snapshots.at(-2);
              return (
                <StatCard
                  key={n}
                  label={NETWORK_META[n].label}
                  value={latest ? latest.followers.toLocaleString("fr-FR") : "—"}
                  suffix={latest ? "abonnés" : "pas encore synchronisé"}
                  delta={latest && previous ? latest.followers - previous.followers : 0}
                />
              );
            })}
          </div>

          <GlassCard>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-medium text-white">Évolution des abonnés</h2>
              <div className="flex gap-2">
                {networksToShow.map((n) => (
                  <NetworkBadge key={n} network={n} size="sm" />
                ))}
              </div>
            </div>
            {hasRealData ? (
              <GrowthChart data={chartData} seriesKeys={networksToShow} />
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">
                Pas encore de synchronisation — cliquez sur &laquo; Actualiser depuis les réseaux &raquo; ci-dessus pour
                remplir ce graphique avec vos vraies données.
              </p>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
