"use client";

// Analytics › Rétention IA (09/10/2026, demande de Lucas : la page Rétention
// IA devient un onglet d'Analytics, /analytics?tab=retention ; l'ancienne
// adresse /retention redirige ici). Hors d'Analytics (embedded = false), le
// composant garde son en-tête de page.
//
// Outil autonome d'analyse de rétention vidéo IA (voir /api/ai/analyze-channel-video
// et /api/social/youtube/videos). Contrairement au flux historique (bouton
// "Analyser" sur /posts/[id], réservé aux vidéos publiées via le Composer),
// ceci fonctionne pour N'IMPORTE QUELLE vidéo de la chaîne YouTube connectée
// — voir le produit n°3 de la feuille de route ("outil autonome").
// 30/09/2026 : l'IA regarde la vidéo quand elle est publique ; analyses
// comptées par mois (+ recharges), résultat réutilisé tant qu'on ne demande
// pas « Refaire l'analyse ».

import { Suspense, useEffect, useMemo, useState } from "react";
import { RemoteImage } from "@/components/ui/remote-image";
import { PageHeader } from "@/components/ui/page-header";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { useAiStatus } from "@/components/use-ai-status";
import { IconRetention, IconLock } from "@/components/dashboard/icons";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";
import dynamic from "next/dynamic";
import { useBootstrap, useFocusMode } from "@/components/bootstrap-provider";
import { RetentionInsightView, RetentionQuotaLine, type InsightData } from "@/components/retention/insight-view";
import { useSearchParams } from "next/navigation";
import { useConnections } from "@/lib/data/hooks";
import { AiIcon } from "@/components/ai/ai-icon";

// Mini-jeu d'attente chargé seulement pendant une analyse (lot 5).
const LoadingMiniGame = dynamic(() => import("@/components/mini-game/loading-mini-game").then((m) => m.LoadingMiniGame), { ssr: false });

interface ConnectionRow {
  id: string;
  network: string;
  displayName: string;
  status: string;
}

interface VideoRow {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
}

type Insight = InsightData;

// Accepte une URL YouTube complète (watch?v=, youtu.be/, /shorts/) ou un id brut.
function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const patterns = [/[?&]v=([\w-]{11})/, /youtu\.be\/([\w-]{11})/, /\/shorts\/([\w-]{11})/];
  for (const re of patterns) {
    const match = trimmed.match(re);
    if (match) return match[1];
  }
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

function RetentionToolInner({ embedded }: { embedded: boolean }) {
  // Mini-jeu d'attente (voir loading-mini-game.tsx) : jamais en Mode focus,
  // même règle que dans le Composer (composer/page.tsx).
  const { focusMode } = useFocusMode();
  const { activeBrand } = useBrand();
  const { data: me, patch } = useBootstrap();
  const recharge = useSearchParams().get("recharge");
  const toast = useToast();
  const upgrade = useUpgradeModal();
  const aiStatus = useAiStatus(activeBrand?.id);

  // Chaînes YouTube connectées : cache partagé des comptes (lot 6).
  const cachedConnections = useConnections<ConnectionRow>(activeBrand?.id).connections;
  const connections = useMemo(() => (cachedConnections ?? []).filter((c) => c.network === "YOUTUBE" && c.status === "CONNECTED"), [cachedConnections]);
  const [connectionId, setConnectionId] = useState<string>("");
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [manualInput, setManualInput] = useState("");

  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedTitle, setSelectedTitle] = useState<string>("");
  const [insight, setInsight] = useState<Insight | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingInsight, setLoadingInsight] = useState(false);

  useEffect(() => {
    if (connections.length > 0) setConnectionId((prev) => prev || connections[0].id);
  }, [connections]);

  useEffect(() => {
    if (!connectionId) return;
    setLoadingVideos(true);
    fetch(`/api/social/youtube/videos?connectionId=${connectionId}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        setLoadingVideos(false);
        if (!ok) {
          toast.error(d.error ?? "Erreur lors du chargement des vidéos.");
          return;
        }
        setVideos(d.videos ?? []);
      })
      .catch(() => setLoadingVideos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  async function selectVideo(videoId: string, title: string) {
    setSelectedVideoId(videoId);
    setSelectedTitle(title);
    setInsight(null);
    setLoadingInsight(true);
    const res = await fetch(`/api/ai/analyze-channel-video?connectionId=${connectionId}&videoId=${videoId}`);
    const data = await res.json();
    setLoadingInsight(false);
    if (res.ok) setInsight(data.insight ?? null);
  }

  function onManualSubmit() {
    const id = extractVideoId(manualInput);
    if (!id) {
      toast.error("URL ou ID de vidéo YouTube invalide.");
      return;
    }
    selectVideo(id, "Vidéo collée manuellement");
  }

  async function analyze(force = false) {
    if (!connectionId || !selectedVideoId) return;
    setAnalyzing(true);
    const res = await fetch("/api/ai/analyze-channel-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, videoId: selectedVideoId, force })
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setAnalyzing(false);
    if (!res || !res.ok) {
      if (res && upgrade.openFromResponse(res.status, data)) return;
      toast.error(data.error ?? "Erreur d'analyse.");
      return;
    }
    setInsight(data.insight);
    if (data.quota && me) patch({ ai: { ...me.ai, quota: data.quota } });
    if (data.reused) toast.info("Cette vidéo a déjà été analysée : voici le résultat, rien n'a été décompté.");
    else if (data.usedCredit) toast.info("Analyse faite avec une de vos analyses achetées.");
  }

  if (!activeBrand) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Sélectionnez ou créez une marque pour analyser une chaîne YouTube.</p>
      </div>
    );
  }

  const locked = aiStatus !== null && !aiStatus.planAllowsAi;

  return (
    <div className="space-y-6">
      {embedded ? (
        <p className="text-sm leading-relaxed text-slate-400">{RETENTION_INTRO}</p>
      ) : (
        <PageHeader icon={<IconRetention className="h-5 w-5" />} title="Rétention IA" description={RETENTION_INTRO} />
      )}

      {recharge === "success" && (
        <GlassCard className="border-emerald-500/30 bg-emerald-500/[0.06]">
          <p className="text-sm text-emerald-300">Recharge payée : vos analyses apparaissent dès que Stripe aura notifié Nebula (quelques secondes). Une notification vous le confirme.</p>
        </GlassCard>
      )}

      {locked && (
        <GlassCard>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-amber-300">
              <IconLock className="h-3 w-3" /> Pro
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            La vraie courbe YouTube Analytics, et l&apos;IA vous dit où les spectateurs décrochent et pourquoi — avec le palier Pro.
          </p>
          <button
            type="button"
            onClick={() => upgrade.open("retention")}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-left text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
          >
            <UpgradeGem className="h-4 w-4 opacity-70" /> Débloquer la rétention IA
          </button>
        </GlassCard>
      )}

      {!locked && connections.length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-400">
            Connectez une chaîne YouTube pour cette marque afin d&apos;utiliser l&apos;outil.
          </p>
          <Link href="/accounts" className="mt-3 inline-block">
            <Button variant="outline">Connecter YouTube</Button>
          </Link>
        </GlassCard>
      )}

      {!locked && connections.length > 0 && (
        <>
          {connections.length > 1 && (
            <GlassCard>
              <label className="block text-xs uppercase tracking-wide text-slate-500">Chaîne YouTube</label>
              <select
                value={connectionId}
                onChange={(e) => {
                  setConnectionId(e.target.value);
                  setSelectedVideoId("");
                  setInsight(null);
                }}
                className="mt-1.5 w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none focus:border-aurora-400/60"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </GlassCard>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-1">
              <GlassCard>
                <h2 className="font-display text-base font-medium text-white">Vidéos récentes</h2>
                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                  {loadingVideos && (
                    <div className="space-y-2" aria-busy="true">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  )}
                  {!loadingVideos && videos.length === 0 && <p className="text-sm text-slate-500">Aucune vidéo trouvée.</p>}
                  {videos.map((v) => (
                    <button
                      key={v.videoId}
                      onClick={() => selectVideo(v.videoId, v.title)}
                      className={clsx(
                        "flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition",
                        selectedVideoId === v.videoId ? "border-aurora-400/60 bg-white/[0.04]" : "border-white/10 hover:border-white/25"
                      )}
                    >
                      <RemoteImage src={v.thumbnailUrl} className="h-12 w-20 shrink-0 rounded-lg" sizes="80px" />
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{v.title}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-4 border-t border-white/[0.06] pt-3">
                  <label className="block text-xs uppercase tracking-wide text-slate-500">
                    Ou collez l&apos;URL/ID d&apos;une autre vidéo de cette chaîne
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && onManualSubmit()}
                      placeholder="https://youtube.com/watch?v=..."
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none focus:border-aurora-400/60"
                    />
                    <Button variant="outline" onClick={onManualSubmit}>
                      OK
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </div>

            <div className="lg:col-span-2">
              {!selectedVideoId ? (
                <GlassCard>
                  <p className="text-sm text-slate-500">Choisissez une vidéo à gauche pour lancer une analyse.</p>
                  <RetentionQuotaLine className="mt-3" />
                </GlassCard>
              ) : (
                <GlassCard>
                  <h2 className="font-display text-base font-medium text-white">{selectedTitle}</h2>

                  {loadingInsight ? (
                    <SkeletonText lines={4} className="mt-3" />
                  ) : !insight ? (
                    <>
                      <Button onClick={() => analyze(false)} disabled={analyzing} className="mt-3">
                        <AiIcon className="h-4 w-4" tone="onAccent" /> {analyzing ? "Analyse en cours…" : "Analyser la rétention (IA)"}
                      </Button>
                      {analyzing && <p className="mt-2 text-xs text-slate-500">L&apos;IA regarde la vidéo : jusqu&apos;à 2 ou 3 minutes pour une vidéo longue.</p>}
                      <RetentionQuotaLine className="mt-3" />
                      {!focusMode && analyzing && <LoadingMiniGame active />}
                    </>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <RetentionInsightView insight={insight} onRedo={() => analyze(true)} redoing={analyzing} />
                      <RetentionQuotaLine />
                      {!focusMode && analyzing && <LoadingMiniGame active />}
                    </div>
                  )}
                </GlassCard>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const RETENTION_INTRO =
  "Analysez n'importe quelle vidéo de votre chaîne YouTube connectée — publiée via Nebula ou non. Nebula relève les chutes de la vraie courbe YouTube Analytics ; l'IA regarde la vidéo (si elle est publique) pour expliquer ce qui se passe à ces moments.";

// useSearchParams (retour de Stripe, ?recharge=) : sous Suspense, comme Facturation.
export function RetentionTool({ embedded = false }: { embedded?: boolean }) {
  return (
    <Suspense fallback={null}>
      <RetentionToolInner embedded={embedded} />
    </Suspense>
  );
}
