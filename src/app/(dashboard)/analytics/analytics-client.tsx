"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { MonthlySummaryPromo } from "@/components/monthly-summary/summary-settings";
import { PageSkeleton, SkeletonGrid } from "@/components/ui/skeleton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { m as motion, AnimatePresence } from "framer-motion";
import { useBrand } from "@/components/brand-context";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { NetworkBadge } from "@/components/ui/network-badge";
import { NETWORK_META, type ChartPoint, type Network } from "@/lib/types";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { useToast } from "@/components/dashboard/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { IconLink } from "@/components/dashboard/icons";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { ReferralPrompt, type ReferralPromptKey } from "@/components/dashboard/referral-prompt";
import { clsx } from "@/lib/clsx";
import { useCosmetics } from "@/components/cosmetics-provider";
import dynamic from "next/dynamic";
import { analyticsKey, refreshConnections, useAnalytics } from "@/lib/data/hooks";
import { useSeedIsFresh } from "@/lib/data/swr-config";
import { MotionRoot } from "@/components/motion/motion-root";
import { getPref, setPref } from "@/lib/ui-prefs-client";
import { useOptionalAiAssistant } from "@/components/dashboard/ai-assistant-context";
import { limitsOf } from "@/lib/plans";

// Onglet Rétention IA (09/10/2026, demande de Lucas : l'ancienne page
// /retention devient un onglet d'Analytics) : téléchargé à l'ouverture.
const RetentionTool = dynamic(() => import("@/components/retention/retention-tool").then((m) => m.RetentionTool), {
  ssr: false,
  loading: () => <SkeletonGrid count={2} />
});

// Onglet « Concurrence » retiré le 10/10/2026 (demande de Lucas) : un ancien
// lien `?tab=competitors` ouvre la Vue d'ensemble.
type AnalyticsTab = "overview" | "retention" | "ads";
const ANALYTICS_TABS: readonly AnalyticsTab[] = ["overview", "retention", "ads"];
const isAnalyticsTab = (v: string | null): v is AnalyticsTab => (ANALYTICS_TABS as readonly string[]).includes(v ?? "");

// Onglet Publicité : module à part (tableaux, graphique des dépenses),
// téléchargé seulement quand on ouvre l'onglet (audit performance, lot 4).
const AdsTab = dynamic(() => import("@/components/dashboard/ads/ads-tab").then((m) => m.AdsTab), {
  ssr: false,
  loading: () => <SkeletonGrid count={4} />
});

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
    return getPref(milestoneFlagKey(connectionId, threshold)) === "1";
  } catch {
    return false;
  }
}
function markFiredFollowerMilestone(connectionId: string, threshold: number = MILESTONE_FOLLOWERS) {
  try {
    setPref(milestoneFlagKey(connectionId, threshold), "1");
  } catch {
    // stockage indisponible — tant pis, la célébration pourra se redéclencher
  }
}
function hasFiredSupernova(brandId: string): boolean {
  try {
    return getPref(`nebula:supernova-impressions:${brandId}`) === "1";
  } catch {
    return false;
  }
}
function markFiredSupernova(brandId: string) {
  try {
    setPref(`nebula:supernova-impressions:${brandId}`, "1");
  } catch {
    // stockage indisponible — tant pis, la célébration pourra se redéclencher
  }
}

/** Données préparées par le serveur pour le premier affichage (lot 10, voir page.tsx). */
export interface AnalyticsInitial {
  brandId: string;
  /** Une régie publicitaire est configurée : l'onglet Publicité s'affiche. */
  adsEnabled: boolean;
  plan: string;
}

// useSearchParams() impose un <Suspense> autour du composant qui l'appelle
// (voir accounts/page.tsx pour le même besoin, déjà en place ailleurs).
export function AnalyticsClient({ initial }: { initial: AnalyticsInitial | null }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AnalyticsPageInner initial={initial} />
    </Suspense>
  );
}

function AnalyticsPageInner({ initial }: { initial: AnalyticsInitial | null }) {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const cosmetics = useCosmetics();
  const searchParams = useSearchParams();
  // Depuis le menu déroulant d'un compte sur la page Comptes (voir
  // accounts/page.tsx) : n'affiche que ce compte-là plutôt que tous les
  // comptes de la marque active.
  const filterConnectionId = searchParams.get("connectionId");
  // Statistiques de la marque : cache partagé avec la Vue d'ensemble (lot 6).
  const { connections: cachedAnalytics, error: analyticsError, revalidate: revalidateAnalytics } = useAnalytics<AnalyticsConnection>(activeBrand?.id);
  const connections = useMemo(() => cachedAnalytics ?? [], [cachedAnalytics]);
  const [syncing, setSyncing] = useState(false);
  const loading = cachedAnalytics === null && !analyticsError;
  const [tab, setTabState] = useState<AnalyticsTab>(() => {
    const t = searchParams.get("tab");
    return isAnalyticsTab(t) ? t : "overview";
  });
  // L'onglet est gardé dans l'adresse (?tab=…) : un rechargement ou un lien
  // partagé rouvre le même onglet (09/10/2026).
  function setTab(next: AnalyticsTab) {
    setTabState(next);
    try {
      const url = new URL(window.location.href);
      if (next === "overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      url.searchParams.delete("recharge");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    } catch {
      // Adresse non modifiable : l'onglet change quand même.
    }
  }
  // Assistant : l'onglet Rétention IA garde son propre contexte.
  const assistant = useOptionalAiAssistant();
  const setAssistantOverride = assistant?.setContextOverride;
  useEffect(() => {
    setAssistantOverride?.(tab === "retention" ? "retention" : null);
  }, [tab, setAssistantOverride]);
  // Onglet Publicité (lot 5) : affiché dès qu'une régie est configurée sur
  // le serveur (les formules gratuites y voient l'offre Pro).
  const [adsEnabled, setAdsEnabled] = useState(searchParams.get("tab") === "ads" || Boolean(initial?.adsEnabled));
  const [plan, setPlan] = useState<string>(initial?.plan ?? "FREE");
  // Premier affichage : régies et palier fournis par le serveur (lot 10).
  const seedUsed = useRef(false);
  // Faux si la page est resservie par le cache du routeur (voir swr-config.tsx).
  const seedFresh = useRef(useSeedIsFresh(initial ? analyticsKey(initial.brandId) : null)).current;
  const [pdfLoading, setPdfLoading] = useState(false);
  // Invitation de parrainage aux 1 000 / 10 000 abonnés (lot G7) : calculée
  // à la synchronisation (dernier relevé), affichée une seule fois par
  // compte — le composant vérifie referralPromptsSeen.
  const [referralTrigger, setReferralTrigger] = useState<ReferralPromptKey | null>(null);

  useEffect(() => {
    if (!activeBrand) return;
    const seededBrand = !seedUsed.current && initial?.brandId === activeBrand.id;
    seedUsed.current = true;
    if (seededBrand && seedFresh) return;
    fetch(`/api/ads?brandId=${activeBrand.id}&probe=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAdsEnabled(Boolean(d?.enabled)))
      .catch(() => undefined);
    fetch(`/api/billing/plan?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => d?.plan && setPlan(d.plan))
      .catch(() => undefined);
    // `initial` ne sert qu'au premier affichage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand]);

  // Célébrations et invitations selon les derniers relevés, à chaque
  // nouvelle version des données.
  function onAnalyticsLoaded(loaded: AnalyticsConnection[]) {

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
        // Easter egg "Éclat mérité" : même seuil, débloque en plus le
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
    if (cachedAnalytics) onAnalyticsLoaded(cachedAnalytics);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedAnalytics]);

  async function onSync() {
    if (!activeBrand) return;
    setSyncing(true);
    await fetch("/api/analytics/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id })
    });
    // Nouveaux relevés et état des comptes (erreurs, à reconnecter) partout.
    await Promise.all([revalidateAnalytics(), refreshConnections(activeBrand.id)]);
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
    <MotionRoot>
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
              {/* Bilan du mois (03/10/2026) : la page et l'e-mail du 3 du mois. */}
              <Link href="/analytics/bilan" className="inline-flex">
                <Button variant="outline">Bilan du mois</Button>
              </Link>
              <Button variant="outline" onClick={exportCsv} disabled={!hasRealData}>
                Exporter (CSV)
              </Button>
              {limitsOf(plan).pdfReportEnabled && (
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

        {/* V2 (07/10/2026) : onglets soulignés, sur le fond de la page. */}
        <div className="nb-tabrow gap-1">
          {(
            [
              ["overview", "Vue d'ensemble"],
              ["retention", "Rétention IA"],
              ...(adsEnabled ? [["ads", "Publicité"]] : [])
            ] as [AnalyticsTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                "shrink-0 border-b-2 px-3 py-2.5 text-[14px] transition",
                tab === id ? "border-current font-semibold text-white" : "border-transparent text-slate-400 hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && connections.length > 0 && <MonthlySummaryPromo />}

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
        {tab === "ads" ? (
          activeBrand ? <AdsTab key={activeBrand.id} brandId={activeBrand.id} /> : null
        ) : tab === "retention" ? (
          <RetentionTool embedded />
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
            {/* Immobile au survol (03/10/2026) : on lit la courbe et son infobulle. */}
            <MotionGlassCard glow still>
              {/* flex-wrap (30/09/2026) : les pastilles débordaient sur mobile
                  (page de 466 px de large sur un écran de 390). */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-medium text-white">Évolution des abonnés</h2>
                <div className="flex flex-wrap gap-2">
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
                  description="Cliquez sur « Actualiser depuis les réseaux » pour récupérer vos vraies statistiques tout de suite. Ensuite, Nebula fait un relevé par jour tout seul : chaque relevé ajoute un point à la courbe."
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
    </MotionRoot>
  );
}
