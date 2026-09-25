"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartPoint } from "@/lib/types";
import { useChartTheme } from "@/lib/chart-theme";

// Courbe de croissance des abonnés (Vue d'ensemble, Analytics). Chaque série
// prend la couleur officielle de son réseau (la même que les pastilles) et
// les axes/infobulles suivent le thème actif — voir src/lib/chart-theme.ts.
// Chargée à la demande (voir components/charts/lazy.tsx) : recharts pèse
// ~95 Ko et n'a rien à faire dans le premier affichage de la page.
export function GrowthChart({ data, seriesKeys }: { data: ChartPoint[]; seriesKeys: string[] }) {
  const theme = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          {seriesKeys.map((key, i) => (
            <linearGradient id={`fill-${key}`} key={key} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.seriesColor(key, i)} stopOpacity={0.35} />
              <stop offset="100%" stopColor={theme.seriesColor(key, i)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: theme.axis, fontSize: 11 }} axisLine={{ stroke: theme.grid }} tickLine={false} minTickGap={24} />
        <YAxis tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={theme.tooltip} labelStyle={theme.labelStyle} />
        {seriesKeys.map((key, i) => (
          <Area key={key} type="monotone" dataKey={key} stroke={theme.seriesColor(key, i)} strokeWidth={2} fill={`url(#fill-${key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
