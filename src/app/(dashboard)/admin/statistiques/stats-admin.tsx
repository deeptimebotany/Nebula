"use client";

// Statistiques de groupe anonymes (29/09/2026) : ce que le serveur a calculé
// à partir des seuls comptes qui ont donné leur accord, et des seules données
// propres à Nebula. Seules les valeurs d'au moins 20 comptes existent.
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { IconChart } from "@/components/dashboard/icons";

interface Cell {
  metric: string;
  metricLabel: string;
  dimension: string;
  dimensionLabel: string;
  value: number;
  sampleAccounts: number;
  sampleItems: number;
  computedAt: string;
}

interface StatsResponse {
  period: string;
  periods: string[];
  consenting: number;
  threshold: number;
  cells: Cell[];
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function periodLabel(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function StatsAdmin() {
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState<StatsResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p: string) => {
    const res = await fetch(`/api/admin/stats?period=${p}`, { cache: "no-store" }).catch(() => null);
    setData(res?.ok ? ((await res.json()) as StatsResponse) : null);
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  async function recompute() {
    setBusy(true);
    await fetch("/api/admin/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) }).catch(() => null);
    setBusy(false);
    await load(period);
  }

  const groups = useMemo(() => {
    const map = new Map<string, Cell[]>();
    for (const c of data?.cells ?? []) map.set(c.metricLabel, [...(map.get(c.metricLabel) ?? []), c]);
    return [...map.entries()];
  }, [data]);

  const periods = useMemo(() => [...new Set([currentPeriod(), ...(data?.periods ?? [])])].sort().reverse(), [data]);
  const unit = (metric: string) => (metric.includes("mediane") || metric.includes("median") ? "" : " %");

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconChart className="h-5 w-5" />}
        title="Statistiques anonymes"
        description="Chiffres de groupe calculés chaque jour sur le serveur, uniquement avec les comptes qui ont coché la case facultative, et uniquement à partir des données propres à Nebula (jamais celles des API des réseaux). Une valeur n'existe que si au moins 20 comptes y contribuent."
      />

      <GlassCard hover={false}>
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Mois" value={period} onChange={(e) => setPeriod(e.target.value)} wrapperClassName="w-52">
            {periods.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={() => void recompute()} disabled={busy}>
            {busy ? "Calcul…" : "Recalculer ce mois"}
          </Button>
          <a href={`/api/admin/stats?period=${period}&format=csv`} className={buttonClasses("ghost")}>
            Exporter (CSV)
          </a>
        </div>
        {data && (
          <p className="mt-4 text-sm text-slate-400">
            {data.consenting} compte{data.consenting > 1 ? "s ont" : " a"} donné son accord. Seuil d&apos;anonymat : {data.threshold} comptes par valeur.
          </p>
        )}
        <p className="mt-2 text-xs text-amber-200/80">
          Rien n&apos;est vendu ni partagé automatiquement. Avant toute cession à un partenaire : validation par un juriste, et
          vérification que les conditions d&apos;utilisation l&apos;annoncent bien.
        </p>
      </GlassCard>

      {data === null ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : groups.length === 0 ? (
        <GlassCard hover={false}>
          <p className="text-sm text-slate-400">
            Aucune valeur pour {periodLabel(data.period)} : il faut au moins {data.threshold} comptes consentants actifs pour qu&apos;un chiffre apparaisse.
          </p>
        </GlassCard>
      ) : (
        groups.map(([label, cells]) => (
          <GlassCard key={label} hover={false}>
            <h2 className="font-display text-base font-medium text-white">{label}</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Détail</th>
                    <th className="py-2 pr-3 text-right font-semibold">Valeur</th>
                    <th className="py-2 pr-3 text-right font-semibold">Comptes</th>
                    <th className="py-2 text-right font-semibold">Éléments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {cells.map((c) => (
                    <tr key={`${c.metric}-${c.dimension}`}>
                      <td className="py-2 pr-3 text-slate-200">{c.dimensionLabel}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-white">
                        {c.value.toLocaleString("fr-FR")}
                        {unit(c.metric)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{c.sampleAccounts}</td>
                      <td className="py-2 text-right tabular-nums text-slate-400">{c.sampleItems}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        ))
      )}
    </div>
  );
}
