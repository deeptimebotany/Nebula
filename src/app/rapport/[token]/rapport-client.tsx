"use client";

// Page publique de rapport client (produit n°6 de la feuille de route :
// "rapports clients automatiques") — aucune authentification : le token
// (déjà unique, voir BrandReport dans prisma/schema.prisma) sert
// d'identifiant public, exactement comme /approve/[token] et /l/[slug].
// Les chiffres sont recalculés à la volée par /api/public/reports/[token] à
// chaque chargement — jamais un instantané figé au moment de l'envoi email.

import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { GlassCard } from "@/components/ui/glass-card";

const NETWORK_LABELS: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube"
};

interface ReportData {
  periodDays: number;
  generatedAt: string;
  totals: {
    followers: number;
    followersDelta: number;
    avgEngagementRate: number;
    impressions: number;
    reach: number;
  };
  byNetwork: { network: string; followers: number; followersDelta: number }[];
  growthSeries: { date: string; followers: number }[];
  postsPublished: { id: string; title: string; network: string; publishedAt: string; url: string | null }[];
}

interface PublicReport {
  brandName: string;
  data: ReportData;
}

export function RapportClient({ token }: { token: string }) {
  const [report, setReport] = useState<PublicReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/reports/${token}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setError(d.error ?? "Ce rapport n'existe pas.");
          return;
        }
        setReport(d);
      })
      .catch(() => setError("Impossible de charger ce rapport."));
  }, [token]);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="noise-grid grain-overlay pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        {error && <p className="mt-20 text-center text-sm text-slate-400">{error}</p>}

        {!error && !report && <p className="mt-20 text-center text-sm text-slate-500">Chargement...</p>}

        {report && (
          <>
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">{report.brandName}</h1>
              <p className="mt-2 text-sm text-slate-400">
                Rapport des {report.data.periodDays} derniers jours — généré le{" "}
                {new Date(report.data.generatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <GlassCard hover={false} className="text-center">
                <p className="text-xs text-slate-500">Abonnés</p>
                <p className="mt-1 font-display text-xl font-semibold text-white">
                  {report.data.totals.followers.toLocaleString("fr-FR")}
                </p>
              </GlassCard>
              <GlassCard hover={false} className="text-center">
                <p className="text-xs text-slate-500">Évolution</p>
                <p
                  className={`mt-1 font-display text-xl font-semibold ${
                    report.data.totals.followersDelta >= 0 ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {report.data.totals.followersDelta >= 0 ? "+" : ""}
                  {report.data.totals.followersDelta.toLocaleString("fr-FR")}
                </p>
              </GlassCard>
              <GlassCard hover={false} className="text-center">
                <p className="text-xs text-slate-500">Engagement moyen</p>
                <p className="mt-1 font-display text-xl font-semibold text-white">
                  {report.data.totals.avgEngagementRate.toFixed(1)}%
                </p>
              </GlassCard>
              <GlassCard hover={false} className="text-center">
                <p className="text-xs text-slate-500">Impressions</p>
                <p className="mt-1 font-display text-xl font-semibold text-white">
                  {report.data.totals.impressions.toLocaleString("fr-FR")}
                </p>
              </GlassCard>
            </div>

            {report.data.byNetwork.length > 0 && (
              <GlassCard hover={false} className="mt-6">
                <h2 className="font-display text-base font-medium text-white">Par réseau</h2>
                <ul className="mt-3 space-y-2">
                  {report.data.byNetwork.map((n) => (
                    <li key={n.network} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{NETWORK_LABELS[n.network] ?? n.network}</span>
                      <span className="text-slate-400">
                        {n.followers.toLocaleString("fr-FR")} abonnés ({n.followersDelta >= 0 ? "+" : ""}
                        {n.followersDelta.toLocaleString("fr-FR")})
                      </span>
                    </li>
                  ))}
                </ul>
              </GlassCard>
            )}

            <GlassCard hover={false} className="mt-6">
              <h2 className="font-display text-base font-medium text-white">Croissance des abonnés</h2>
              {report.data.growthSeries.length >= 2 ? (
                <div className="mt-4 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={report.data.growthSeries}>
                      <defs>
                        <linearGradient id="growthFillPublic" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgb(129 140 248)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="rgb(129 140 248)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={40} />
                      <Tooltip contentStyle={{ background: "#0b1120", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                      <Area type="monotone" dataKey="followers" stroke="rgb(129 140 248)" fill="url(#growthFillPublic)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Pas encore assez de données collectées pour tracer une courbe.</p>
              )}
            </GlassCard>

            <GlassCard hover={false} className="mt-6">
              <h2 className="font-display text-base font-medium text-white">Publications de la période</h2>
              {report.data.postsPublished.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Aucune publication publiée sur cette période.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {report.data.postsPublished.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="truncate text-slate-300 hover:text-aurora-300 hover:underline">
                          {p.title}
                        </a>
                      ) : (
                        <span className="truncate text-slate-300">{p.title}</span>
                      )}
                      <span className="shrink-0 text-xs text-slate-500">{NETWORK_LABELS[p.network] ?? p.network}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            <p className="mt-10 text-center text-xs text-slate-600">Propulsé par Nebula</p>
          </>
        )}
      </div>
    </main>
  );
}
