"use client";

// Point d'entrée historique de la courbe de croissance : le graphique réel
// (recharts) est chargé à la demande, voir components/charts/lazy.tsx.
import type { ChartPoint } from "@/lib/types";

export type GrowthPoint = ChartPoint;
export { GrowthChart } from "@/components/charts/lazy";
