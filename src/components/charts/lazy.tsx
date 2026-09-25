"use client";

// Graphiques chargés à la demande (audit performance, lot 4).
//
// recharts pèse ~95 Ko compressés : importé directement, il était envoyé
// avec la Vue d'ensemble, Analytics, les rapports… avant même le premier
// affichage. Ici, chaque graphique est un morceau séparé, téléchargé
// seulement quand il doit s'afficher ; un cadre de même hauteur le remplace
// entre-temps pour que la page ne saute pas.
//
// Règle : ne jamais importer "recharts" ailleurs que dans components/charts/
// et components/dashboard/ads/ads-spend-chart.tsx (lui-même chargé ainsi).
import dynamic from "next/dynamic";
import { clsx } from "@/lib/clsx";
import type { RetentionPoint } from "./retention-curve-chart";

export function ChartSkeleton({ height, className }: { height?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx("animate-pulse rounded-xl bg-white/[0.04]", height === undefined && "h-full", className)}
      style={height === undefined ? undefined : { height }}
    />
  );
}

export const GrowthChart = dynamic(() => import("./growth-chart-impl").then((m) => m.GrowthChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={280} />
});

export const FollowersAreaChart = dynamic(() => import("./followers-area-chart").then((m) => m.FollowersAreaChart), {
  ssr: false,
  loading: () => <ChartSkeleton />
});

const RetentionCurveChartInner = dynamic(() => import("./retention-curve-chart").then((m) => m.RetentionCurveChart), {
  ssr: false,
  loading: () => <ChartSkeleton />
});

// La hauteur varie selon la page (140 ou 180 px) : le cadre la fixe, pour
// que le squelette et le graphique réel occupent exactement la même place.
export function RetentionCurveChart({ points, height }: { points: RetentionPoint[]; height: number }) {
  return (
    <div style={{ height }}>
      <RetentionCurveChartInner points={points} height={height} />
    </div>
  );
}
