"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useBrand } from "@/components/brand-context";
import { GlassCard } from "@/components/ui/glass-card";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { NetworkBadge, networkInkStyle } from "@/components/ui/network-badge";
import { NETWORK_META, NETWORKS, type ChartPoint, type Network } from "@/lib/types";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { IconLink, IconUsers } from "@/components/dashboard/icons";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { ReferralPrompt, type ReferralPromptKey } from "@/components/dashboard/referral-prompt";
import { clsx } from "@/lib/clsx";
import { useCosmetics } from "@/components/cosmetics-provider";

interface AnalyticsConnection {
  id: string;
  network: Network;
  displayName: string;
  handle?: string | null;
  snapshots: { capturedAt: string; followers: number; reach: number; impressions: number }[];
}

// Easter egg : franchissement des 1000 abonnés sur un compte connecté —
// célébré une seule fois par compte (voir hasFiredFollowerMilestone), au
// moment détecté (le dernier relevé dépasse le seuil, pas le précédent).
// Un petit insigne "🎖 1000+" reste ensuite affiché en permanence sur ce
// compte (voir StatCard ci-dessous), sans dépendre du localStorage.
const MILESTONE_FOLLOWERS = 1000;
// Cap supérieur (easter egg "followers-10k") — même mécanique de
// franchissement que MILESTONE_FOLLOWERS, juste un seuil dix fois plus haut,
// suivi séparément (voir milestoneFlagKey, préfixé par le seuil concerné).
const MILESTONE_FOLLOWERS_10K = 10_000;
// Seuil "cumulé" (toutes plateformes confondues) pour l'easter egg à
// récompense "Supernova analytique" — calculé sur le dernier relevé de
// chaque compte connecté, pas un historique complet (voir load() plus bas).
const SUPERNOVA_IMPRESSIONS_THRESHOLD = 1_000_000;

function milestoneFlagKey(connectionId: string, threshold: number = MILESTONE_FOLLOWERS): string {
  return `nebula:milestone-followers-${threshold}:${connectionId}`;
}
function hasFiredFollowerMilestone(connectionId: string, threshold: number = MILESTONE_FOLLOWERS): boolean {
  try {
    return localStorage.getItem(milestoneFlagKey(connectionId, threshold)) === "1";
  } catch {
    return false;
  }
}
function markFiredFollowerMilestone(connectionId: string, threshold: number = MILESTONE_FOLLOWERS) {
  try {
    localStorage.setItem(milestoneFlagKey(connectionId, threshold), "1");
  } catch {
    // stockage indisponible — tant pis, la célébration pourra se redéclencher
  }
}
function hasFiredSupernova(brandId: string): boolean {
  try {
    return localStorage.getItem(`nebula:supernova-impressions:${brandId}`) === "1";
  } catch {
    return false;
  }
}
function markFiredSupernova(brandId: string) {
  try {
    localStorage.setItem(`nebula:supernova-impressions:${brandId}`, "1");
  } catch {
    // stockage indisponible — tant pis, la célébration pourra se redéclencher
  }
}

interface CompetitorSnapshotRow {
  id: string;
  followers: number;
  postsCount: number | null;
  capturedAt: string;
}

interface CompetitorTrackRow {
  id: string;
  network: Network;
  handle: string;
  label: string | null;
  snapshots: CompetitorSnapshotRow[];
}

// Sous-onglet "Concurrence" : suivi manuel de jusqu'à 3 concurrents. Aucune
// API publique ne permet de récupérer légalement et automatiquement les
// stats d'un compte tiers arbitraire sur ces réseaux — chaque relevé est
// donc un chiffre que VOUS avez constaté (visible publiquement sur son
// profil) et saisi vous-même, jamais une valeur inventée par Nebula.
function CompetitorTab({ brandId }: { brandId: string }) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [tracks, setTracks] = useState<CompetitorTrackRow[] | null>(null);
  const [network, setNetwork] = useState<Network>("INSTAGRAM");
  const [handle, setHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [snapshotDrafts, setSnapshotDrafts] = useState<Record<string, string>>({});

  function load() {
    fetch(`/api/competitors?brandId=${brandId}`)
      .then((r) => r.json())
      .then((d) => setTracks(d.tracks ?? []));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  async function addCompetitor() {
    if (!handle.trim()) return;
    setAdding(true);
    const res = await fetch("/api/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, network, handle: handle.trim() })
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur lors de l'ajout.");
      return;
    }
    setHandle("");
    load();
  }

  async function removeCompetitor(id: string, handle: string) {
    const ok = await confirmDialog({
      title: "Retirer ce concurrent ?",
      message: `Le suivi de @${handle} et tous ses relevés seront supprimés. Cette action est définitive.`,
      confirmLabel: "Retirer",
      danger: true
    });
    if (!ok) return;
    const res = await fetch(`/api/competitors/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      toast.error("Impossible de retirer ce concurrent pour le moment.");
      return;
    }
    toast.success(`@${handle} retiré du suivi.`);
    load();
  }

  async function addSnapshot(trackId: string) {
    const raw = snapshotDrafts[trackId];
    const followers = Number(raw);
    if (!raw || Number.isNaN(followers) || followers < 0) {
      toast.error("Entrez un nombre d'abonnés valide.");
      return;
    }
    await fetch(`/api/competitors/${trackId}/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followers: Math.round(followers) })
    });
    setSnapshotDrafts((prev) => ({ ...prev, [trackId]: "" }));
    load();
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <p className="text-sm text-slate-400">
          Suivez jusqu&apos;à 3 comptes concurrents en relevant vous-même leur nombre d&apos;abonnés (visible
          publiquement sur leur profil) : Nebula ne dispose d&apos;aucun accès officiel aux statistiques d&apos;un
          compte tiers, donc chaque relevé reste une donnée que vous avez constatée, jamais une estimation.
        </p>
        {(!tracks || tracks.length < 3) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value as Network)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
            >
              {NETWORKS.map((n) => (
                <option key={n} value={n} className="bg-void-900">{NETWORK_META[n].label}</option>
              ))}
            </select>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@identifiant du concurrent"
              className="min-w-[180px] flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
            />
            <Button onClick={addCompetitor} disabled={adding}>
              {adding ? "Ajout..." : "Ajouter"}
            </Button>
          </div>
        )}
      </GlassCard>

      {!tracks ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : tracks.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-5 w-5" />}
          title="Aucun concurrent suivi"
          description="Ajoutez jusqu'à trois comptes à surveiller (leur @) : vous relèverez leurs abonnés quand vous le souhaitez et verrez la tendance à côté de la vôtre."
        />
      ) : (
        <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((t) => {
            const latest = t.snapshots.at(-1);
            const previous = t.snapshots.at(-2);
            const delta = latest && previous ? latest.followers - previous.followers : null;
            return (
              <RevealItem key={t.id}>
              <MotionGlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{t.label || t.handle}</p>
                    <p className="network-ink text-xs" style={networkInkStyle(t.network)}>
                      {NETWORK_META[t.network].label} · {t.handle}
                    </p>
                  </div>
                  <button onClick={() => removeCompetitor(t.id, t.handle)} className="text-xs text-slate-500 hover:text-red-300">
                    ✕
                  </button>
                </div>
                <div className="mt-3">
                  <p className="font-display text-2xl text-white">
                    {latest ? latest.followers.toLocaleString("fr-FR") : "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {latest
                      ? `abonnés constatés le ${new Date(latest.capturedAt).toLocaleDateString("fr-FR")}`
                      : "aucun relevé encore"}
                    {delta !== null && (
                      <span className={delta >= 0 ? "ml-1.5 text-emerald-400" : "ml-1.5 text-red-400"}>
                        ({delta >= 0 ? "+" : ""}{delta})
                      </span>
                    )}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={snapshotDrafts[t.id] ?? ""}
                    onChange={(e) => setSnapshotDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    placeholder="Nouveau relevé (abonnés)"
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white outline-none focus:border-aurora-400/60"
                  />
                  <Button variant="outline" onClick={() => addSnapshot(t.id)}>
                    Ajouter
                  </Button>
                </div>
              </MotionGlassCard>
              </RevealItem>
            );
          })}
        </RevealGroup>
      )}
    </div>
  );
}

// useSearchParams() impose un <Suspense> autour du composant qui l'appelle
// (voir accounts/page.tsx pour le même besoin, déjà en place ailleurs).
export default function AnalyticsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AnalyticsPageInner />
    </Suspense>
  );
}

function AnalyticsPageInner() {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const cosmetics = useCosmetics();
  const searchParams = useSearchParams();
  // Depuis le menu déroulant d'un compte sur la page Comptes (voir
  // accounts/page.tsx) : n'affiche que ce compte-là plutôt que tous les
  // comptes de la marque active.
  const filterConnectionId = searchParams.get("connectionId");
  const [connections, setConnections] = useState<AnalyticsConnection[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "competitors">("overview");
  const [plan, setPlan] = useState<string>("FREE");
  const [pdfLoading, setPdfLoading] = useState(false);
  // Invitation de parrainage aux 1 000 / 10 000 abonnés (lot G7) : calculée
  // à la synchronisation (dernier relevé), affichée une seule fois par
  // compte — le composant vérifie referralPromptsSeen.
  const [referralTrigger, setReferralTrigger] = useState<ReferralPromptKey | null>(null);

  useEffect(() => {
    if (!activeBrand) return;
    fetch(`/api/billing/plan?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => d?.plan && setPlan(d.plan))
      .catch(() => undefined);
  }, [activeBrand]);

  async function load() {
    if (!activeBrand) return;
    setLoading(true);
    const res = await fetch(`/api/analytics?brandId=${activeBrand.id}`);
    const data = await res.json();
    const loaded: AnalyticsConnection[] = data.connections ?? [];
    setConnections(loaded);
    setLoading(false);

    let cumulativeImpressions = 0;
    const maxFollowers = Math.max(0, ...loaded.map((c) => c.snapshots.at(-1)?.followers ?? 0));
    setReferralTrigger(maxFollowers >= MILESTONE_FOLLOWERS_10K ? "followers_10000" : maxFollowers >= MILESTONE_FOLLOWERS ? "followers_1000" : null);
    for (const c of loaded) {
      const latest = c.snapshots.at(-1);
      const previous = c.snapshots.at(-2);
      cumulativeImpressions += latest?.impressions ?? 0;

      if (
        latest &&
        latest.followers >= MILESTONE_FOLLOWERS &&
        (!previous || previous.followers < MILESTONE_FOLLOWERS) &&
        !hasFiredFollowerMilestone(c.id)
      ) {
        markFiredFollowerMilestone(c.id);
        toast.success(`🎉 ${c.displayName} vient de franchir les ${MILESTONE_FOLLOWERS.toLocaleString("fr-FR")} abonnés !`);
        reportEasterEggFound("followers-1000");
      }
      if (
        latest &&
        latest.followers >= MILESTONE_FOLLOWERS_10K &&
        (!previous || previous.followers < MILESTONE_FOLLOWERS_10K) &&
        !hasFiredFollowerMilestone(c.id, MILESTONE_FOLLOWERS_10K)
      ) {
        markFiredFollowerMilestone(c.id, MILESTONE_FOLLOWERS_10K);
        toast.success(`🥇 ${c.displayName} vient de franchir les ${MILESTONE_FOLLOWERS_10K.toLocaleString("fr-FR")} abonnés !`);
        reportEasterEggFound("followers-10k");
        // Easter egg "Éclat mérité" (#48) : même seuil, débloque en plus le
        // cosmétique "Éclat doré" (voir src/lib/cosmetics.ts) — deux clés
        // distinctes pour deux récompenses distinctes au même franchissement.
        reportEasterEggFound("golden-glow-unlock");
      }
    }

    // Easter egg à récompense "Supernova analytique" : somme des impressions
    // du DERNIER relevé de chaque compte connecté à cette marque (pas un
    // cumul historique complet, qui demanderait de sommer tout
    // AnalyticsSnapshot — approximation documentée volontairement).
    if (activeBrand && cumulativeImpressions >= SUPERNOVA_IMPRESSIONS_THRESHOLD && !hasFiredSupernova(activeBrand.id)) {
      markFiredSupernova(activeBrand.id);
      reportEasterEggFound("supernova-impressions");
    }
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

  // Filtrée sur un seul compte quand ?connectionId= est présent (voir plus
  // haut) — tout ce qui suit (stats, graphique, exports) travaille sur cette
  // liste plutôt que sur `connections` directement.
  const visibleConnections = useMemo(
    () => (filterConnectionId ? connections.filter((c) => c.id === filterConnectionId) : connections),
    [connections, filterConnectionId]
  );
  const filteredConnection = filterConnectionId ? connections.find((c) => c.id === filterConnectionId) ?? null : null;

  const hasRealData = visibleConnections.some((c) => c.snapshots.length > 0);
  const networksToShow: Network[] = visibleConnections.map((c) => c.network);

  // Export CSV côté navigateur (aucune dépendance ajoutée) : d'abord un
  // résumé par réseau (dernière synchro), puis le détail jour par jour tel
  // qu'affiché sur le graphique — assez pour un tableur ou un partage rapide.
  function exportCsv() {
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push("Résumé par réseau");
    lines.push(["Réseau", "Compte", "Abonnés", "Portée", "Impressions"].map(escape).join(","));
    for (const c of visibleConnections) {
      const latest = c.snapshots.at(-1);
      lines.push(
        [
          NETWORK_META[c.network].label,
          c.displayName,
          latest?.followers ?? 0,
          latest?.reach ?? 0,
          latest?.impressions ?? 0
        ]
          .map(escape)
          .join(",")
      );
    }
    lines.push("");
    lines.push("Évolution des abonnés par jour");
    lines.push(["Date", ...networksToShow.map((n) => NETWORK_META[n].label)].map(escape).join(","));
    for (const point of chartData) {
      lines.push([point.date, ...networksToShow.map((n) => point[n] ?? "")].map(escape).join(","));
    }

    const csv = "﻿" + lines.join("\n"); // BOM pour un affichage correct des accents dans Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nebula-analytics-${activeBrand?.slug ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Rapports PDF personnalisés (palier Agence) : génération 100% côté
  // navigateur (jsPDF, pas de rendu serveur) à partir des VRAIES données déjà
  // chargées ci-dessus, pré-rempli avec le logo/nom de marque blanche
  // configurés dans Paramètres.
  async function exportPdf() {
    if (!activeBrand) return;
    setPdfLoading(true);
    try {
      const [{ jsPDF }, wl] = await Promise.all([
        import("jspdf"),
        fetch("/api/settings/white-label").then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ]);

      const doc = new jsPDF();
      const brandLabel = wl?.brandName || activeBrand.name;
      let y = 20;

      doc.setFontSize(18);
      doc.text(`Rapport mensuel — ${brandLabel}`, 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`, 14, y);
      y += 12;

      doc.setTextColor(20);
      doc.setFontSize(13);
      doc.text("Résumé par réseau", 14, y);
      y += 8;
      doc.setFontSize(10);
      for (const c of visibleConnections) {
        const latest = c.snapshots.at(-1);
        doc.text(
          `${NETWORK_META[c.network].label} (${c.displayName}) — ${latest ? `${latest.followers.toLocaleString("fr-FR")} abonnés, ${latest.reach.toLocaleString("fr-FR")} portée, ${latest.impressions.toLocaleString("fr-FR")} impressions` : "pas encore synchronisé"}`,
          14,
          y
        );
        y += 7;
      }

      y += 5;
      doc.setFontSize(13);
      doc.text("Évolution des abonnés", 14, y);
      y += 8;
      doc.setFontSize(9);
      for (const point of chartData.slice(-15)) {
        const row = networksToShow.map((n) => `${NETWORK_META[n].label}: ${point[n] ?? "—"}`).join("   ");
        doc.text(`${point.date}   ${row}`, 14, y);
        y += 6;
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      }

      if (!hasRealData) {
        y += 6;
        doc.setTextColor(150);
        doc.text("Pas encore assez de données synchronisées pour ce rapport — synchronisez vos comptes.", 14, y);
      }

      doc.save(`rapport-${activeBrand.slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      toast.error("Échec de la génération du PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  const chartData = useMemo(() => {
    const byDate = new Map<string, ChartPoint>();
    for (const c of visibleConnections) {
      for (const s of c.snapshots) {
        const key = s.capturedAt.slice(5, 10);
        const point: ChartPoint = byDate.get(key) ?? { date: key };
        point[c.network] = s.followers;
        byDate.set(key, point);
      }
    }
    return Array.from(byDate.values());
  }, [visibleConnections]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={
          hasRealData
            ? "Basé sur les dernières synchronisations réelles de vos comptes."
            : "Connectez puis synchronisez un compte pour voir vos vraies statistiques ici."
        }
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!hasRealData}>
              Exporter (CSV)
            </Button>
            {plan === "AGENCY" && (
              <Button variant="outline" onClick={exportPdf} disabled={pdfLoading}>
                {pdfLoading ? "Génération..." : "Rapport PDF"}
              </Button>
            )}
            <Button onClick={onSync} disabled={syncing || connections.length === 0}>
              {syncing ? "Synchronisation..." : "Actualiser depuis les réseaux"}
            </Button>
          </>
        }
      />

      {referralTrigger && <ReferralPrompt trigger={referralTrigger} />}

      {filterConnectionId && (
        <div className="flex items-center gap-2 rounded-lg border border-aurora-400/30 bg-aurora-400/[0.06] px-3 py-2 text-sm text-aurora-200">
          <span>
            Filtré sur {filteredConnection ? filteredConnection.displayName : "un compte"} — les autres comptes ne
            sont pas affichés.
          </span>
          <Link href="/analytics" className="ml-auto shrink-0 text-xs underline hover:text-white">
            Voir tous les comptes
          </Link>
        </div>
      )}

      <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.015] p-1">
        {(
          [
            ["overview", "Vue d'ensemble"],
            ["competitors", "Concurrence"]
          ] as [typeof tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition",
              tab === id ? "bg-gradient-to-r from-nebula-700/60 to-nebula-600/20 text-white shadow-glow" : "text-slate-400 hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
      {tab === "competitors" ? (
        activeBrand ? <CompetitorTab brandId={activeBrand.id} /> : null
      ) : connections.length === 0 && !loading ? (
        <Reveal>
          <EmptyState
            icon={<IconLink className="h-5 w-5" />}
            title="Aucun compte connecté"
            description="Connectez un compte Instagram, Facebook, TikTok ou YouTube, puis synchronisez-le : vos abonnés, votre portée et votre engagement apparaîtront ici, avec leur évolution."
            action={
              <Link href="/accounts" className="inline-block">
                <Button>Connecter un compte</Button>
              </Link>
            }
          />
        </Reveal>
      ) : (
        <div className="space-y-6">
          <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {networksToShow.map((n) => {
              const real = visibleConnections.find((c) => c.network === n);
              const latest = real?.snapshots.at(-1);
              const previous = real?.snapshots.at(-2);
              return (
                <RevealItem key={n}>
                  <StatCard
                    label={NETWORK_META[n].label}
                    value={latest ? latest.followers.toLocaleString("fr-FR") : "—"}
                    suffix={latest ? "abonnés" : "pas encore synchronisé"}
                    delta={latest && previous ? latest.followers - previous.followers : 0}
                    glow={Boolean(latest && latest.followers >= MILESTONE_FOLLOWERS_10K && cosmetics.has("eclat-dore-statcard"))}
                  />
                </RevealItem>
              );
            })}
          </RevealGroup>

          <Reveal delay={0.1}>
          <MotionGlassCard glow>
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
              <EmptyState
                bare
                title="Pas encore de synchronisation"
                description="Cliquez sur « Actualiser depuis les réseaux » pour récupérer vos vraies statistiques. Chaque synchronisation ajoute un point à la courbe : revenez régulièrement pour voir la tendance."
                action={
                  <Button onClick={onSync} disabled={syncing || connections.length === 0}>
                    {syncing ? "Synchronisation..." : "Actualiser depuis les réseaux"}
                  </Button>
                }
              />
            )}
          </MotionGlassCard>
          </Reveal>
        </div>
      )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
