"use client";

// Meilleur moment pour publier, partagé par /outils/meilleur-moment (public)
// et /tools/meilleur-moment (application : fuseau de la marque, réseau du
// premier compte connecté, et le créneau personnel calculé comme sur la Vue
// d'ensemble quand il y a assez de relevés). Sans IA.
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { markToolExplored } from "@/lib/tools-explored";
import { GlassCard } from "@/components/ui/glass-card";
import { NETWORK_META } from "@/lib/types";
import { TOOL_NETWORKS, type ToolBestTimeDTO, type ToolNetwork } from "@/lib/tools/app-context-shared";
import { BEST_TIME_SLOTS, BEST_TIME_SOURCE_DATE, hourLabel, timezoneChoices } from "@/lib/tools/best-time";
import { shiftWallHour } from "@/lib/timezone";
import { clsx } from "@/lib/clsx";

export interface BestTimePersonal {
  slots: ToolBestTimeDTO[];
  minSnapshots: number;
}

export function BestTimeTable({ initialNetwork, initialTimezone, personal }: { initialNetwork?: ToolNetwork; initialTimezone?: string; personal?: BestTimePersonal }) {
  const uid = useId();
  const [network, setNetwork] = useState<ToolNetwork>(initialNetwork ?? "INSTAGRAM");
  const [tz, setTz] = useState(initialTimezone ?? "Europe/Paris");
  const zones = useMemo(() => timezoneChoices(initialTimezone), [initialTimezone]);
  const rows = useMemo(() => BEST_TIME_SLOTS[network].map((s) => ({ ...s, hours: s.hours.map((h) => shiftWallHour(h, "Europe/Paris", tz)) })), [network, tz]);
  // Badge Explorateur (Réussites, lot C) : la page EST le résultat (tableau des créneaux).
  useEffect(() => {
    markToolExplored();
  }, []);

  const mine = personal?.slots.find((s) => s.network === network) ?? null;

  return (
    <GlassCard hover={false}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p id={`${uid}-net`} className="text-xs uppercase tracking-wide text-slate-500">
            Réseau
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-labelledby={`${uid}-net`}>
            {TOOL_NETWORKS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNetwork(n)}
                aria-pressed={network === n}
                className={clsx("rounded-xl border-2 px-3.5 py-2 text-sm font-medium transition", network === n ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25")}
              >
                {NETWORK_META[n].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor={`${uid}-tz`} className="block text-xs uppercase tracking-wide text-slate-500">
            Fuseau
          </label>
          <select id={`${uid}-tz`} value={tz} onChange={(e) => setTz(e.target.value)} className="mt-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60">
            {zones.map((t) => (
              <option key={t} value={t} className="bg-void-900">
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {personal && (
        <div className="mt-5 rounded-xl border border-aurora-400/25 bg-aurora-400/[0.06] p-4" aria-live="polite">
          <p className="text-xs uppercase tracking-wide text-aurora-200">Votre créneau {NETWORK_META[network].label}</p>
          {mine?.hasEnoughData && mine.bestHour !== null ? (
            <p className="mt-1 text-sm text-slate-200">
              D&apos;après vos {mine.sampleSize} relevés, votre meilleur créneau est vers <strong className="text-white">{hourLabel(mine.bestHour)}</strong> (heure de votre marque), comme sur la Vue d&apos;ensemble. Il prime sur les moyennes ci-dessous.
            </p>
          ) : mine ? (
            <p className="mt-1 text-sm text-slate-300">
              Encore un peu de patience : {mine.sampleSize} relevé{mine.sampleSize > 1 ? "s" : ""} sur les {personal.minSnapshots} nécessaires pour calculer votre créneau. Nebula fait un relevé par jour tout seul ; « Actualiser depuis les réseaux » dans{" "}
              <Link href="/analytics" className="text-aurora-300 hover:underline">
                Analytics
              </Link>{" "}
              en ajoute un tout de suite.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-300">
              Aucun compte {NETWORK_META[network].label} connecté à cette marque.{" "}
              <Link href="/accounts" className="text-aurora-300 hover:underline">
                Connecter un compte
              </Link>
            </p>
          )}
        </div>
      )}

      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">Créneaux moyens pour {NETWORK_META[network].label}</caption>
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 font-medium">Jours</th>
            <th className="py-2 font-medium">Créneaux</th>
            <th className="hidden py-2 font-medium sm:table-cell">Pourquoi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.days} className="border-t border-white/[0.06] align-top">
              <td className="py-3 text-slate-200">{r.days}</td>
              <td className="py-3">
                <div className="flex flex-wrap gap-1.5">
                  {r.hours.map((h) => (
                    <span key={h} className="rounded-full border border-aurora-400/30 bg-aurora-400/10 px-2 py-0.5 text-xs text-aurora-100">
                      {hourLabel(h)}
                    </span>
                  ))}
                </div>
              </td>
              <td className="hidden py-3 text-xs text-slate-400 sm:table-cell">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[11px] text-slate-500">Moyennes générales relevées en {BEST_TIME_SOURCE_DATE} (études publiques Sprout Social, Hootsuite, Buffer), heures converties depuis Paris — vos propres statistiques Nebula font mieux.</p>
    </GlassCard>
  );
}
