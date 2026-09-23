"use client";

// Calculateur d'économies public (brief growth, lot G5.b), dérivé du
// simulateur de la page Facturation : nombre de marques, de comptes et
// d'utilisateurs → coût mensuel et annuel chez trois concurrents au choix
// (données src/data/competitors.ts) contre Nebula (src/lib/plans.ts). Les
// chiffres sont des estimations à partir des grilles publiques, en
// facturation annuelle, converties en euros quand l'éditeur affiche des
// dollars. Utilisé sur /tarifs, /alternatives/* et /prix/* et dans la
// modale de sortie de /tarifs.
import { useMemo, useState } from "react";
import { COMPETITORS, FX_NOTE, REFERENCE_SCENARIO, formatEur, formatVerifiedAt, nebulaEstimate, toEur, type CostInput } from "@/data/competitors";
import { clsx } from "@/lib/clsx";

const FIELDS: { key: keyof CostInput; label: string; min: number; max: number }[] = [
  { key: "brands", label: "Marques (clients, projets)", min: 1, max: 50 },
  { key: "accounts", label: "Comptes connectés au total", min: 1, max: 80 },
  { key: "users", label: "Utilisateurs", min: 1, max: 10 }
];

export function SavingsCalculator({ defaultCompetitors = ["hootsuite", "metricool", "buffer"], title = "Combien Nebula vous ferait-il économiser ?", compact = false, className }: { defaultCompetitors?: string[]; title?: string; compact?: boolean; className?: string }) {
  const [input, setInput] = useState<CostInput>(REFERENCE_SCENARIO);
  const [selected, setSelected] = useState<string[]>(() => defaultCompetitors.filter((s) => COMPETITORS.some((c) => c.slug === s)).slice(0, 3));

  const rows = useMemo(() => {
    return selected
      .map((slug) => COMPETITORS.find((c) => c.slug === slug))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => {
        const est = c.estimate(input);
        return { slug: c.slug, name: c.name, monthlyEur: toEur(est.monthly, c.currency), how: est.how, currency: c.currency, verifiedAt: c.verifiedAt };
      });
  }, [selected, input]);
  const nebula = useMemo(() => nebulaEstimate(input), [input]);
  const usesUsd = rows.some((r) => r.currency === "USD");
  const verifiedAt = rows[0]?.verifiedAt ?? COMPETITORS[0].verifiedAt;

  function toggle(slug: string) {
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.length > 1 ? prev.filter((s) => s !== slug) : prev;
      if (prev.length >= 3) return [...prev.slice(1), slug];
      return [...prev, slug];
    });
  }

  return (
    <div className={clsx("rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6", className)}>
      <h2 className="font-display text-lg font-semibold text-white sm:text-xl">{title}</h2>
      <p className="mt-1 text-xs text-slate-400">Estimation à partir des grilles publiques (facturation annuelle), pour la configuration que vous indiquez.</p>

      <div className={clsx("mt-4 grid gap-4", compact ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-3")}>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`sc-${f.key}`} className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{f.label}</span>
              <span className="font-medium text-white">{input[f.key]}</span>
            </label>
            <input id={`sc-${f.key}`} type="range" min={f.min} max={f.max} value={input[f.key]} onChange={(e) => setInput((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))} className="w-full accent-aurora-500" />
          </div>
        ))}
      </div>

      <fieldset className="mt-4">
        <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Comparer avec (3 maximum)</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {COMPETITORS.map((c) => {
            const on = selected.includes(c.slug);
            return (
              <button key={c.slug} type="button" onClick={() => toggle(c.slug)} aria-pressed={on} className={clsx("rounded-full border px-3 py-1 text-xs font-medium transition", on ? "border-aurora-400 bg-aurora-400/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25 hover:text-white")}>
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3 font-semibold">Outil</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Par mois</th>
              <th scope="col" className="py-2 text-right font-semibold">Par an</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {rows.map((r) => (
              <tr key={r.slug}>
                <td className="py-2.5 pr-3">
                  <span className="text-white">{r.name}</span>
                  {!compact && <span className="block text-[11px] text-slate-500">{r.how}</span>}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-slate-200">{r.monthlyEur === null ? "non publié" : formatEur(r.monthlyEur)}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-200">{r.monthlyEur === null ? "—" : formatEur(r.monthlyEur * 12)}</td>
              </tr>
            ))}
            <tr className="bg-aurora-400/[0.06]">
              <td className="rounded-l-xl py-3 pr-3">
                <span className="font-semibold text-white">Nebula</span>
                <span className="block text-[11px] text-aurora-200">{nebula.how}</span>
              </td>
              <td className="py-3 pr-3 text-right font-semibold tabular-nums text-white">{formatEur(nebula.monthlyAnnual, nebula.monthlyAnnual % 1 ? 2 : 0)}</td>
              <td className="rounded-r-xl py-3 text-right font-semibold tabular-nums text-white">{formatEur(nebula.monthlyAnnual * 12)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Savings rows={rows} nebulaMonthly={nebula.monthlyAnnual} />

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Prix constatés le {formatVerifiedAt(verifiedAt)} sur le site de chaque éditeur, susceptibles d&apos;évoluer. {usesUsd ? FX_NOTE + " " : ""}Nebula : facturation annuelle (dix mois au prix de douze), utilisateurs illimités, prix tels qu&apos;affichés sur la page Tarifs.
      </p>
    </div>
  );
}

function Savings({ rows, nebulaMonthly }: { rows: { name: string; monthlyEur: number | null }[]; nebulaMonthly: number }) {
  const priced = rows.filter((r) => r.monthlyEur !== null) as { name: string; monthlyEur: number }[];
  if (priced.length === 0) return null;
  const cheapest = priced.reduce((a, b) => (a.monthlyEur < b.monthlyEur ? a : b));
  const diff = (cheapest.monthlyEur - nebulaMonthly) * 12;
  if (diff <= 0) {
    return <p className="mt-3 text-sm text-slate-300">Pour cette configuration, {cheapest.name} est au même prix ou moins cher que Nebula : comparez les fonctions plutôt que le tarif.</p>;
  }
  return (
    <p className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-100">
      Par rapport au moins cher des outils sélectionnés ({cheapest.name}), Nebula vous ferait économiser environ <strong className="font-semibold">{formatEur(diff)}</strong> par an.
    </p>
  );
}
