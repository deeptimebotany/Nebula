"use client";

// Dépenses publicitaires par jour, empilées par régie (lot 5). Un seul axe
// (la dépense, dans une seule devise), barres fines à extrémité arrondie,
// 2 px d'écart entre segments, légende toujours visible et infobulle au
// survol. Le bouton « Tableau » donne les mêmes chiffres en texte.
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Rectangle } from "recharts";
import { useChartTheme } from "@/lib/chart-theme";
import { AD_PLATFORM_META, type AdPlatform } from "@/lib/ads/types";
import { clsx } from "@/lib/clsx";
import { useAdColors } from "./ads-colors";
import { longDate, money, moneyCompact, shortDate } from "./ads-format";

export type DailyPoint = { date: string; total: number } & Partial<Record<AdPlatform, number>>;

const GAP = 2;

export function AdsSpendChart({ data, platforms, currency }: { data: DailyPoint[]; platforms: AdPlatform[]; currency: string | null }) {
  const theme = useChartTheme();
  const colors = useAdColors();
  const [view, setView] = useState<"chart" | "table">("chart");

  // Segment le plus haut de chaque jour : c'est lui qui porte l'arrondi.
  const topOf = useMemo(() => {
    const map = new Map<string, AdPlatform | null>();
    for (const d of data) {
      let top: AdPlatform | null = null;
      for (const p of platforms) if ((d[p] ?? 0) > 0) top = p;
      map.set(d.date, top);
    }
    return map;
  }, [data, platforms]);

  const hasSpend = data.some((d) => d.total > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Légende">
          {platforms.map((p) => (
            <li key={p} className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colors[p] }} aria-hidden="true" />
              {AD_PLATFORM_META[p].label}
            </li>
          ))}
        </ul>
        <div className="flex rounded-lg border border-white/10 p-0.5 text-xs" role="group" aria-label="Affichage">
          {(
            [
              ["chart", "Graphique"],
              ["table", "Tableau"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={clsx("rounded-md px-2.5 py-1 transition", view === id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "chart" ? (
        <div role="img" aria-label={`Dépenses publicitaires par jour et par régie, du ${longDate(data[0]?.date ?? "")} au ${longDate(data.at(-1)?.date ?? "")}.`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={data.length > 45 ? "18%" : "28%"}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fill: theme.axis, fontSize: 11 }}
                axisLine={{ stroke: theme.grid }}
                tickLine={false}
                minTickGap={18}
              />
              <YAxis
                tickFormatter={(v: number) => moneyCompact(v, currency)}
                tick={{ fill: theme.axis, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={56}
                allowDecimals={false}
                domain={[0, hasSpend ? "auto" : 10]}
              />
              <Tooltip
                cursor={{ fill: theme.grid }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as DailyPoint;
                  return (
                    <div style={theme.tooltip} className="min-w-[180px] px-3 py-2 shadow-lg">
                      <p className="mb-1.5 text-[11px]" style={theme.labelStyle}>
                        {longDate(String(label))}
                      </p>
                      {[...platforms].reverse().map((p) => (
                        <p key={p} className="flex items-center justify-between gap-4 py-0.5">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-[2px]" style={{ background: colors[p] }} aria-hidden="true" />
                            {AD_PLATFORM_META[p].label}
                          </span>
                          <span className="tabular-nums">{money(point[p] ?? 0, currency)}</span>
                        </p>
                      ))}
                      {platforms.length > 1 && (
                        <p className="mt-1 flex justify-between gap-4 border-t pt-1 font-medium" style={{ borderColor: theme.grid }}>
                          <span>Total</span>
                          <span className="tabular-nums">{money(point.total, currency)}</span>
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              {platforms.map((p) => (
                <Bar
                  key={p}
                  dataKey={p}
                  stackId="spend"
                  fill={colors[p]}
                  isAnimationActive={false}
                  maxBarSize={22}
                  shape={(props: unknown) => {
                    const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: DailyPoint };
                    if (!height || height <= 0) return <g />;
                    const top = topOf.get(payload.date) === p;
                    // Écart de 2 px au-dessus de chaque segment (sauf le plus
                    // haut) : le fond de la carte apparaît entre deux régies.
                    const h = top ? height : Math.max(0, height - GAP);
                    const yy = top ? y : y + GAP;
                    return <Rectangle x={x} y={yy} width={width} height={h} fill={colors[p]} radius={top ? [4, 4, 0, 0] : 0} />;
                  }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-[260px] overflow-auto rounded-lg border border-white/[0.06]">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Dépenses publicitaires par jour</caption>
            <thead className="nebula-table-head sticky top-0 text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Jour</th>
                {platforms.map((p) => (
                  <th key={p} scope="col" className="px-3 py-2 text-right font-medium">
                    {AD_PLATFORM_META[p].label}
                  </th>
                ))}
                {platforms.length > 1 && <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date} className="border-t border-white/[0.05] text-slate-200">
                  <th scope="row" className="px-3 py-1.5 font-normal text-slate-300">
                    {longDate(d.date)}
                  </th>
                  {platforms.map((p) => (
                    <td key={p} className="px-3 py-1.5 text-right tabular-nums">
                      {money(d[p] ?? 0, currency)}
                    </td>
                  ))}
                  {platforms.length > 1 && <td className="px-3 py-1.5 text-right font-medium tabular-nums text-white">{money(d.total, currency)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
