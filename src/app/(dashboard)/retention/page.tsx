"use client";

// Outil autonome d'analyse de rétention vidéo IA (voir /api/ai/analyze-channel-video
// et /api/social/youtube/videos). Contrairement au flux historique (bouton
// "Analyser" sur /posts/[id], réservé aux vidéos publiées via le Composer),
// ceci fonctionne pour N'IMPORTE QUELLE vidéo de la chaîne YouTube connectée
// — voir le produit n°3 de la feuille de route ("outil autonome").

import { useEffect, useState } from "react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { useAiStatus } from "@/components/use-ai-status";
import { IconRetention, IconSparkle, IconLock } from "@/components/dashboard/icons";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";
import { LoadingMiniGame } from "@/components/mini-game/loading-mini-game";

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

interface Insight {
  id: string;
  summary: string;
  dropOffPoints: string;
  recommendations: string;
  retentionCurve: string;
}

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

export default function RetentionToolPage() {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const aiStatus = useAiStatus(activeBrand?.id);

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
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
    if (!activeBrand) return;
    fetch(`/api/connections?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => {
        const yt = (d.connections ?? []).filter((c: ConnectionRow) => c.network === "YOUTUBE" && c.status === "CONNECTED");
        setConnections(yt);
        setConnectionId((prev) => prev || yt[0]?.id || "");
      })
      .catch(() => undefined);
  }, [activeBrand?.id]);

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

  async function analyze() {
    if (!connectionId || !selectedVideoId) return;
    setAnalyzing(true);
    const res = await fetch("/api/ai/analyze-channel-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, videoId: selectedVideoId })
    });
    const data = await res.json();
    setAnalyzing(false);
    if (!res.ok) {
      toast.error(data.error ?? "Erreur d'analyse.");
      return;
    }
    setInsight(data.insight);
  }

  if (!activeBrand) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Sélectionnez ou créez une marque pour analyser une chaîne YouTube.</p>
      </div>
    );
  }

  const locked = aiStatus !== null && !aiStatus.planAllowsAi;

  const retentionCurve: { timeRatio: number; watchRatio: number }[] = insight ? JSON.parse(insight.retentionCurve) : [];
  const dropOffPoints: { timeRatio: number; watchRatio: number; note: string }[] = insight ? JSON.parse(insight.dropOffPoints) : [];
  const recommendations: string[] = insight ? JSON.parse(insight.recommendations) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-white">
          <IconRetention className="h-5 w-5 text-slate-400" /> Analyse de rétention IA
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Analysez n&apos;importe quelle vidéo de votre chaîne YouTube connectée — publiée via Nebula ou non — avec la
          vraie courbe de rétention YouTube Analytics et des recommandations générées par IA.
        </p>
      </div>

      {locked && (
        <GlassCard>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-amber-300">
              <IconLock className="h-3 w-3" /> Palier Pro/Agence
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            L&apos;analyse de rétention IA fait partie des paliers payants de Nebula.
          </p>
          <Link
            href="/billing"
            className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
          >
            <UpgradeGem className="h-4 w-4 opacity-70" /> Passer sur un palier supérieur
          </Link>
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
                  <option key={c.id} value={c.id} className="bg-void-900">
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
                  {loadingVideos && <p className="text-sm text-slate-500">Chargement...</p>}
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
                      <img src={v.thumbnailUrl} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
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
                </GlassCard>
              ) : (
                <GlassCard>
                  <h2 className="font-display text-base font-medium text-white">{selectedTitle}</h2>

                  {loadingInsight ? (
                    <p className="mt-3 text-sm text-slate-500">Chargement...</p>
                  ) : !insight ? (
                    <>
                      <Button onClick={analyze} disabled={analyzing} className="mt-3">
                        <IconSparkle className="h-4 w-4" /> {analyzing ? "Analyse en cours..." : "Analyser la rétention (IA)"}
                      </Button>
                      <LoadingMiniGame active={analyzing} />
                    </>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm text-slate-200">{insight.summary}</p>
                      {retentionCurve.length > 0 && (
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={retentionCurve.map((p) => ({ x: Math.round(p.timeRatio * 100), y: Math.round(p.watchRatio * 100) }))}>
                            <XAxis dataKey="x" tick={{ fill: "#7386ab", fontSize: 10 }} unit="%" axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#7386ab", fontSize: 10 }} unit="%" axisLine={false} tickLine={false} width={32} />
                            <Tooltip contentStyle={{ background: "rgba(10,14,26,0.95)", border: "1px solid rgba(120,150,255,0.25)", borderRadius: 8, fontSize: 11 }} />
                            <Line type="monotone" dataKey="y" stroke="#63e6ff" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                      {dropOffPoints.length > 0 && (
                        <ul className="space-y-1 text-xs text-slate-400">
                          {dropOffPoints.map((d, i) => (
                            <li key={i}>
                              <span className="text-aurora-300">{Math.round(d.timeRatio * 100)}%</span> — {d.note}
                            </li>
                          ))}
                        </ul>
                      )}
                      {recommendations.length > 0 && (
                        <ul className="space-y-1 text-xs text-emerald-300">
                          {recommendations.map((r, i) => (
                            <li key={i}>✓ {r}</li>
                          ))}
                        </ul>
                      )}
                      <button onClick={analyze} disabled={analyzing} className="text-xs text-slate-500 hover:text-slate-300">
                        {analyzing ? "Analyse en cours..." : "Relancer l'analyse"}
                      </button>
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
