"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useBrand } from "@/components/brand-context";
import { StatCard } from "@/components/ui/stat-card";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { NetworkBadge, NetworkDot } from "@/components/ui/network-badge";
import { NETWORK_META, type ChartPoint, type Network } from "@/lib/types";
import { IconPlus } from "@/components/dashboard/icons";

interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
  handle?: string | null;
  status: string;
}

interface AnalyticsConnection {
  id: string;
  network: Network;
  snapshots: { capturedAt: string; followers: number; reach: number; impressions: number; engagementRate: number }[];
}

interface ApiPost {
  id: string;
  title: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  targets: { network: Network }[];
}

export default function DashboardPage() {
  const { activeBrand } = useBrand();
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [analyticsConnections, setAnalyticsConnections] = useState<AnalyticsConnection[]>([]);
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBrand) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/connections?brandId=${activeBrand.id}`).then((r) => r.json()),
      fetch(`/api/analytics?brandId=${activeBrand.id}`).then((r) => r.json()),
      fetch(`/api/posts?brandId=${activeBrand.id}`).then((r) => r.json())
    ])
      .then(([conn, analytics, postsData]) => {
        setConnections(conn.connections ?? []);
        setAnalyticsConnections(analytics.connections ?? []);
        setPosts(postsData.posts ?? []);
      })
      .finally(() => setLoading(false));
  }, [activeBrand]);

  const chartNetworks: Network[] = connections.map((c) => c.network);

  const chartData = useMemo(() => {
    const byDate = new Map<string, ChartPoint>();
    for (const c of analyticsConnections) {
      for (const s of c.snapshots) {
        const key = s.capturedAt.slice(5, 10);
        const point: ChartPoint = byDate.get(key) ?? { date: key };
        point[c.network] = s.followers;
        byDate.set(key, point);
      }
    }
    return Array.from(byDate.values());
  }, [analyticsConnections]);

  const hasAnalytics = analyticsConnections.some((c) => c.snapshots.length > 0);
  const totalFollowers = analyticsConnections.reduce((sum, c) => sum + (c.snapshots.at(-1)?.followers ?? 0), 0);
  const totalReach = analyticsConnections.reduce((sum, c) => sum + (c.snapshots.at(-1)?.reach ?? 0), 0);
  const avgEngagement =
    analyticsConnections.length > 0
      ? analyticsConnections.reduce((sum, c) => sum + (c.snapshots.at(-1)?.engagementRate ?? 0), 0) / analyticsConnections.length
      : 0;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const postsThisMonth = posts.filter((p) => new Date(p.createdAt) >= startOfMonth).length;

  const upcoming = posts
    .filter((p) => p.status === "SCHEDULED" && p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt as string).getTime() - new Date(b.scheduledAt as string).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">
            Vue d&apos;ensemble {activeBrand ? `— ${activeBrand.name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {hasAnalytics
              ? "Données réelles synchronisées depuis vos comptes connectés."
              : "Connectez un compte puis synchronisez-le (page Analytics) pour remplir ce tableau de bord."}
          </p>
        </div>
        <Link href="/composer">
          <Button>
            <IconPlus className="h-4 w-4" /> Nouveau post
          </Button>
        </Link>
      </div>

      {!loading && connections.length === 0 && (
        <GlassCard className="border-aurora-400/25 bg-nebula-700/[0.12]">
          <p className="mb-3 text-sm font-medium text-white">Pour démarrer, trois étapes rapides :</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href="/accounts"
              className="flex flex-1 items-center gap-2 rounded-xl border border-aurora-400/40 bg-aurora-400/[0.08] px-3.5 py-2.5 text-sm text-white transition hover:bg-aurora-400/[0.14]"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aurora-400/20 text-xs font-semibold text-aurora-200">1</span>
              Connecter un réseau
            </Link>
            <span className="hidden text-slate-600 sm:inline">→</span>
            <Link
              href="/analytics"
              className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-sm text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-slate-300">2</span>
              Synchroniser
            </Link>
            <span className="hidden text-slate-600 sm:inline">→</span>
            <span className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-sm text-slate-500">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-slate-400">3</span>
              Voir vos stats ici
            </span>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Abonnés (total)" value={hasAnalytics ? totalFollowers.toLocaleString("fr-FR") : "—"} />
        <StatCard label="Portée (dernière sync.)" value={hasAnalytics ? totalReach.toLocaleString("fr-FR") : "—"} suffix={hasAnalytics ? "vues" : undefined} />
        <StatCard label="Taux d'engagement" value={hasAnalytics ? avgEngagement.toFixed(1) : "—"} suffix={hasAnalytics ? "%" : undefined} />
        <StatCard label="Posts ce mois-ci" value={String(postsThisMonth)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-medium text-white">Croissance des abonnés</h2>
            <div className="flex gap-2">
              {chartNetworks.map((n) => (
                <NetworkBadge key={n} network={n} size="sm" />
              ))}
            </div>
          </div>
          {hasAnalytics ? (
            <GrowthChart data={chartData} seriesKeys={chartNetworks} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-slate-500">
                Pas encore de données — connectez un compte puis synchronisez-le pour remplir ce graphique.
              </p>
              <Link href={connections.length === 0 ? "/accounts" : "/analytics"}>
                <Button variant="outline">
                  {connections.length === 0 ? "Connecter un compte" : "Synchroniser vos comptes"}
                </Button>
              </Link>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="mb-4 font-display text-base font-medium text-white">Comptes connectés</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Chargement...</p>
          ) : connections.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">Aucun compte connecté pour l&apos;instant.</p>
              <Link href="/accounts">
                <Button variant="outline" className="w-full">
                  Connecter un réseau
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <NetworkDot network={c.network} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{c.displayName}</p>
                    <p className="truncate text-xs text-slate-500">{c.handle ?? NETWORK_META[c.network].label}</p>
                  </div>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${c.status === "CONNECTED" ? "bg-emerald-400" : "bg-amber-400"}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <GlassCard>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-medium text-white">Prochaines publications</h2>
          <Link href="/calendar" className="text-sm text-aurora-300 hover:underline">
            Voir le calendrier →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune publication programmée.{" "}
            <Link href="/composer" className="text-aurora-300 hover:underline">Créez la première</Link>.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {upcoming.map((p) => {
              const scheduled = new Date(p.scheduledAt as string);
              const days = Math.round((scheduled.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <Link key={p.id} href={`/posts/${p.id}`} className="glass-panel glass-panel-hover block rounded-xl p-4">
                  <p className="text-xs text-slate-500">
                    {days <= 0 ? "Aujourd'hui" : `J+${days}`} · {scheduled.getHours()}h{String(scheduled.getMinutes()).padStart(2, "0")}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-sm font-medium text-white">{p.title || p.caption || "(sans titre)"}</p>
                  <div className="mt-3 flex gap-1.5">
                    {p.targets.map((t, i) => (
                      <NetworkDot key={i} network={t.network} />
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
