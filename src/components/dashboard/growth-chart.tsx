"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ChartPoint } from "@/lib/types";

export type GrowthPoint = ChartPoint;

const COLORS = ["#4d78e8", "#3ee6dd", "#7c6cf0", "#e857b0", "#63e6ff", "#5b8def"];

export function GrowthChart({ data, seriesKeys }: { data: GrowthPoint[]; seriesKeys: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          {seriesKeys.map((key, i) => (
            <linearGradient id={`fill-${key}`} key={key} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,255,0.08)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#7386ab", fontSize: 11 }}
          axisLine={{ stroke: "rgba(148,163,255,0.12)" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis tick={{ fill: "#7386ab", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          contentStyle={{
            background: "rgba(10,14,26,0.95)",
            border: "1px solid rgba(120,150,255,0.25)",
            borderRadius: 12,
            fontSize: 12,
            color: "#eaf0ff"
          }}
          labelStyle={{ color: "#7ea1f5" }}
        />
        {seriesKeys.map((key, i) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            fill={`url(#fill-${key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
