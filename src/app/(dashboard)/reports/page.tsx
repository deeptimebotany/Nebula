"use client";

// Configuration du rapport client automatique de la marque active (produit
// n°6 de la feuille de route : "rapports clients automatiques"). Toute la
// logique serveur (création à la volée, calcul des chiffres, envoi email
// périodique) vit dans /api/reports* et src/lib/reports.ts — voir ces
// fichiers. Réservé aux paliers Pro/Agence (reportsEnabled).

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useChartTheme } from "@/lib/chart-theme";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { IconReport, IconLock, IconSend } from "@/components/dashboard/icons";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";

const NETWORK_LABELS: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  X: "X",
  LINKEDIN: "LinkedIn"
};

interface ReportSettings {
  token: string;
  enabled: boolean;
  periodDays: number;
  recipientEmail: string | null;
  frequency: "OFF" | "WEEKLY" | "MONTHLY";
  lastSentAt: string | null;
}

interface ReportPreview {
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

export default function ReportsPage() {
  const chartTheme = useChartTheme();
  const { activeBrand } = useBrand();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [report, setReport] = useState<ReportSettings | null>(null);
  const [preview, setPreview] = useState<ReportPreview | null>(null);

  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!activeBrand) return;
    setLoading(true);
    const res = await fetch(`/api/reports?brandId=${activeBrand.id}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors du chargement du rapport.");
      return;
    }
    setAllowed(data.allowed);
    if (data.allowed) {
      setReport(data.report);
      setPreview(data.preview);
      setRecipientEmail(data.report.recipientEmail ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(data: Partial<{ enabled: boolean; periodDays: number; recipientEmail: string | null; frequency: string }>) {
    if (!activeBrand) return;
    const res = await fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, ...data })
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Erreur lors de l'enregistrement.");
      return;
    }
    setReport(json.report);
    // Les chiffres eux-mêmes ne changent pas quand on modifie la config
    // (seule la période affichée peut changer le calcul) : on ne recharge le
    // preview que si periodDays a bougé.
    if (data.periodDays !== undefined) load();
  }

  async function togglePublished() {
    if (!report) return;
    await patch({ enabled: !report.enabled });
    toast.success(!report.enabled ? "Rapport publié." : "Rapport dépublié.");
  }

  async function saveRecipient() {
    await patch({ recipientEmail: recipientEmail.trim() || null });
    toast.success("Destinataire enregistré.");
  }

  async function sendTest() {
    if (!activeBrand || !recipientEmail.trim()) {
      toast.error("Renseignez d'abord un email destinataire.");
      return;
    }
    setSendingTest(true);
    const res = await fetch("/api/reports/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, recipientEmail: recipientEmail.trim() })
    });
    const json = await res.json();
    setSendingTest(false);
    if (!res.ok) {
      toast.error(json.error ?? "Échec de l'envoi.");
      return;
    }
    toast.success("Email de test envoyé.");
  }

  const publicUrl = report && typeof window !== "undefined" ? `${window.location.origin}/rapport/${report.token}` : "";

  async function copyPublicUrl() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    toast.success("Lien copié.");
    setTimeout(() => setCopied(false), 2000);
  }

  if (!activeBrand) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Sélectionnez ou créez une marque pour configurer ses rapports.</p>
      </div>
    );
  }

  if (loading || allowed === null) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-7 w-64" />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
        <span className="sr-only">Chargement en cours</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconReport className="h-5 w-5" />}
        title="Rapports clients"
        description="Une page publique de reporting pour cette marque, toujours à jour, que vous pouvez partager avec votre client ou lui envoyer automatiquement par email."
      />

      {!allowed && (
        <GlassCard>
          <div className="flex items-center gap-2">
            <Badge tone="warning" icon={<IconLock className="h-3 w-3" />}>
              Palier Pro/Agence
            </Badge>
          </div>
          <p className="mt-2 text-sm text-slate-400">Les rapports clients automatiques font partie des paliers payants de Nebula.</p>
          <Link
            href="/billing"
            className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
          >
            <UpgradeGem className="h-4 w-4 opacity-70" /> Passer sur un palier supérieur
          </Link>
        </GlassCard>
      )}

      {allowed && report && preview && (
        <>
          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-medium text-white">Lien public</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {report.enabled ? "Visible par toute personne ayant ce lien." : "Dépublié — le lien renvoie une erreur tant qu'il n'est pas activé."}
                </p>
              </div>
              <Button variant={report.enabled ? "outline" : "glow"} onClick={togglePublished}>
                {report.enabled ? "Dépublier" : "Publier"}
              </Button>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
              <p className="flex-1 truncate font-mono text-sm text-white">{publicUrl || "..."}</p>
              <Button variant="outline" onClick={copyPublicUrl} disabled={!publicUrl}>
                {copied ? "Copié !" : "Copier"}
              </Button>
              {report.enabled && publicUrl && (
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <Button variant="ghost">Ouvrir</Button>
                </a>
              )}
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="font-display text-base font-medium text-white">Envoi automatique par email</h2>
            <p className="mt-1 text-sm text-slate-400">
              Un rappel envoyé au destinataire choisi, avec un résumé chiffré et un lien vers le rapport ci-dessus —
              les chiffres restent toujours à jour sur la page, même entre deux envois.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Email du destinataire"
                id="report-recipient"
                type="email"
                inputMode="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                onBlur={saveRecipient}
                placeholder="client@exemple.com"
                hint="Enregistré quand vous quittez le champ."
              />
              <Select label="Fréquence" id="report-frequency" value={report.frequency} onChange={(e) => patch({ frequency: e.target.value })}>
                <option value="OFF">Désactivé</option>
                <option value="WEEKLY">Chaque semaine</option>
                <option value="MONTHLY">Chaque mois</option>
              </Select>
              <Select label="Période affichée" id="report-period" value={report.periodDays} onChange={(e) => patch({ periodDays: Number(e.target.value) })}>
                <option value={7}>7 derniers jours</option>
                <option value={30}>30 derniers jours</option>
                <option value={90}>90 derniers jours</option>
              </Select>
              <div className="flex items-end">
                <Button variant="outline" onClick={sendTest} disabled={sendingTest || !recipientEmail.trim()} className="w-full">
                  <IconSend className="h-4 w-4" /> {sendingTest ? "Envoi..." : "Envoyer un test maintenant"}
                </Button>
              </div>
            </div>
            {report.lastSentAt && (
              <p className="mt-3 text-xs text-slate-500">
                Dernier envoi automatique : {new Date(report.lastSentAt).toLocaleDateString("fr-FR")}
              </p>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="font-display text-base font-medium text-white">Aperçu du rapport</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <p className="text-xs text-slate-500">Abonnés</p>
                <p className="mt-1 font-display text-lg font-semibold text-white">{preview.totals.followers.toLocaleString("fr-FR")}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <p className="text-xs text-slate-500">Évolution</p>
                <p className={`mt-1 font-display text-lg font-semibold ${preview.totals.followersDelta >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {preview.totals.followersDelta >= 0 ? "+" : ""}
                  {preview.totals.followersDelta.toLocaleString("fr-FR")}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <p className="text-xs text-slate-500">Engagement moyen</p>
                <p className="mt-1 font-display text-lg font-semibold text-white">{preview.totals.avgEngagementRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <p className="text-xs text-slate-500">Impressions</p>
                <p className="mt-1 font-display text-lg font-semibold text-white">{preview.totals.impressions.toLocaleString("fr-FR")}</p>
              </div>
            </div>

            {preview.growthSeries.length >= 2 ? (
              <div className="mt-6 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={preview.growthSeries}>
                    <defs>
                      <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartTheme.series[0]} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={chartTheme.series[0]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartTheme.axis }} />
                    <YAxis tick={{ fontSize: 11, fill: chartTheme.axis }} width={40} />
                    <Tooltip contentStyle={chartTheme.tooltip} labelStyle={chartTheme.labelStyle} />
                    <Area type="monotone" dataKey="followers" stroke={chartTheme.series[0]} fill="url(#growthFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">
                Pas encore assez de données collectées sur la période pour tracer une courbe de croissance.
              </p>
            )}

            <h3 className="mt-6 font-display text-sm font-medium text-white">Publications de la période</h3>
            {preview.postsPublished.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aucune publication publiée sur cette période.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {preview.postsPublished.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-sm">
                    <span className="truncate text-slate-300">{p.title}</span>
                    <span className="shrink-0 text-xs text-slate-500">{NETWORK_LABELS[p.network] ?? p.network}</span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
