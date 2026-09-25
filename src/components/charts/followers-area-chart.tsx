"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useChartTheme } from "@/lib/chart-theme";

export interface FollowersPoint {
  date: string;
  followers: number;
}

// Couleurs fixes du rapport public (/rapport/[token]) : la page est vue par
// le client de l'utilisateur, hors de l'application et de ses thèmes.
const PUBLIC_COLORS = {
  stroke: "rgb(129 140 248)",
  axis: "#64748b",
  tooltip: { background: "#0b1120", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }
};

// Abonnés sur la période (aperçu des rapports, rapport public). Remplit son
// conteneur : le parent fixe la hauteur (h-48, h-52…).
export function FollowersAreaChart({ data, variant = "theme" }: { data: FollowersPoint[]; variant?: "theme" | "public" }) {
  const theme = useChartTheme();
  const gradientId = variant === "public" ? "growthFillPublic" : "growthFill";
  const stroke = variant === "public" ? PUBLIC_COLORS.stroke : theme.series[0];
  const axis = variant === "public" ? PUBLIC_COLORS.axis : theme.axis;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.5} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: axis }} />
        <YAxis tick={{ fontSize: 11, fill: axis }} width={40} />
        {variant === "public" ? (
          <Tooltip contentStyle={PUBLIC_COLORS.tooltip} />
        ) : (
          <Tooltip contentStyle={theme.tooltip} labelStyle={theme.labelStyle} />
        )}
        <Area type="monotone" dataKey="followers" stroke={stroke} fill={`url(#${gradientId})`} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
