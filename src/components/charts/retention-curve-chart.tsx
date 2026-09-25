"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useChartTheme } from "@/lib/chart-theme";

export interface RetentionPoint {
  timeRatio: number;
  watchRatio: number;
}

// Courbe de rétention d'une vidéo (page d'un post, page Rétention), en % de
// la durée (x) et % de spectateurs encore présents (y).
export function RetentionCurveChart({ points, height }: { points: RetentionPoint[]; height: number }) {
  const theme = useChartTheme();
  const data = points.map((p) => ({ x: Math.round(p.timeRatio * 100), y: Math.round(p.watchRatio * 100) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <XAxis dataKey="x" tick={{ fill: theme.axis, fontSize: 10 }} unit="%" axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: theme.axis, fontSize: 10 }} unit="%" axisLine={false} tickLine={false} width={32} />
        <Tooltip contentStyle={theme.tooltip} labelStyle={theme.labelStyle} />
        <Line type="monotone" dataKey="y" stroke={theme.series[1]} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
