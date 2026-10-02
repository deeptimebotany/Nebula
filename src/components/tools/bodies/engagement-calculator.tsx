"use client";

// Calculateur de taux d'engagement, partagé par /outils/taux-engagement
// (public, saisie à la main) et /tools/taux-engagement (application :
// `presets` = les comptes connectés, avec leurs vrais chiffres). Sans IA.
import { useEffect, useId, useMemo, useState } from "react";
import { markToolExplored } from "@/lib/tools-explored";
import { GlassCard } from "@/components/ui/glass-card";
import { NETWORK_META } from "@/lib/types";
import { TOOL_NETWORKS, type EngagementPreset, type ToolNetwork } from "@/lib/tools/app-context-shared";

export type { EngagementPreset };
import { ENGAGEMENT_BENCHMARKS, ENGAGEMENT_BENCHMARK_DATE, engagementRate, frNumber } from "@/lib/tools/engagement-rate";
import { clsx } from "@/lib/clsx";


const FIELDS = [
  ["followers", "Abonnés"],
  ["likes", "J'aime (total)"],
  ["comments", "Commentaires (total)"],
  ["shares", "Partages (total)"],
  ["posts", "Nombre de publications"]
] as const;
type FieldKey = (typeof FIELDS)[number][0];
type Values = Record<FieldKey, string>;

const EMPTY: Values = { followers: "", likes: "", comments: "", shares: "", posts: "1" };
const fromPreset = (p: EngagementPreset): Values => ({ followers: String(p.followers), likes: String(p.likes), comments: String(p.comments), shares: String(p.shares), posts: String(p.posts) });

export function EngagementCalculator({ presets = [] }: { presets?: EngagementPreset[] }) {
  const uid = useId();
  const first = presets[0];
  const [presetId, setPresetId] = useState<string | null>(first?.id ?? null);
  const [network, setNetwork] = useState<ToolNetwork>(first?.network ?? "INSTAGRAM");
  const [values, setValues] = useState<Values>(first ? fromPreset(first) : EMPTY);

  const num = (v: string) => Number(v) || 0;
  const result = useMemo(
    () => engagementRate({ followers: num(values.followers), likes: num(values.likes), comments: num(values.comments), shares: num(values.shares), posts: num(values.posts) }, network),
    [values, network]
  );
  // Badge Explorateur (Réussites, lot C) : un vrai taux calculé.
  const computed = Boolean(result && (num(values.likes) || num(values.comments) || num(values.shares)));
  useEffect(() => {
    if (computed) markToolExplored();
  }, [computed]);

  function applyPreset(p: EngagementPreset) {
    setPresetId(p.id);
    setNetwork(p.network);
    setValues(fromPreset(p));
  }

  const b = ENGAGEMENT_BENCHMARKS[network];
  const activePreset = presets.find((p) => p.id === presetId) ?? null;

  return (
    <GlassCard hover={false}>
      {presets.length > 0 && (
        <div className="mb-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Vos comptes</p>
          <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Remplir avec les chiffres d'un compte">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                aria-pressed={presetId === p.id}
                className={clsx("rounded-xl border-2 px-3.5 py-2 text-left text-sm transition", presetId === p.id ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-300 hover:border-white/25")}
              >
                <span className="block font-medium">{p.label}</span>
                <span className="block text-[11px] text-slate-500">{p.detail}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Chiffres relevés par Nebula (abonnés du dernier relevé, interactions des publications d&apos;Engagements). Vous pouvez les modifier.</p>
        </div>
      )}

      <p id={`${uid}-net`} className="text-xs uppercase tracking-wide text-slate-500">
        Réseau
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-labelledby={`${uid}-net`}>
        {TOOL_NETWORKS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setNetwork(n);
              setPresetId(null);
            }}
            aria-pressed={network === n}
            className={clsx("rounded-xl border-2 px-3.5 py-2 text-sm font-medium transition", network === n ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25")}
          >
            {NETWORK_META[n].label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FIELDS.map(([key, label]) => (
          <label key={key} className="block">
            <span className="block text-xs uppercase tracking-wide text-slate-500">{label}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={values[key]}
              onChange={(e) => {
                const v = e.target.value;
                setValues((prev) => ({ ...prev, [key]: v }));
                setPresetId(null);
              }}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
            />
          </label>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] p-4" aria-live="polite">
        {result ? (
          <>
            <p className="text-xs uppercase tracking-wide text-slate-500">Taux d&apos;engagement par publication{activePreset ? ` — ${activePreset.label}` : ""}</p>
            <p className="mt-1 text-3xl font-semibold text-white">{frNumber(result.rate)} %</p>
            <p className="mt-1 text-sm text-slate-300">
              {frNumber(result.perPost, 0)} interactions par publication — <strong className="text-white">{result.verdict}</strong> pour {NETWORK_META[network].label}.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">Indiquez au moins vos abonnés et une interaction pour voir le résultat.</p>
        )}
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Ordres de grandeur — {NETWORK_META[network].label}</p>
          <ul className="mt-1.5 grid grid-cols-3 gap-2 text-center text-xs">
            <li className="rounded-lg bg-white/[0.03] py-2"><span className="block text-slate-500">bas</span><span className="text-white">{frNumber(b.low)} %</span></li>
            <li className="rounded-lg bg-white/[0.03] py-2"><span className="block text-slate-500">médian</span><span className="text-white">{frNumber(b.median)} %</span></li>
            <li className="rounded-lg bg-white/[0.03] py-2"><span className="block text-slate-500">élevé</span><span className="text-white">{frNumber(b.high)} %</span></li>
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">Moyennes générales relevées en {ENGAGEMENT_BENCHMARK_DATE} (études publiques des éditeurs d&apos;outils d&apos;analyse). Vos propres statistiques Nebula font mieux.</p>
        </div>
      </div>
    </GlassCard>
  );
}
