"use client";

// Ce qu'il reste d'IA à ce compte (30/09/2026, quotas mensuels) : analyses
// Rétention (+ achetées), miniatures, Studio, messages à l'assistant, et les
// textes du jour. Page Facturation ; masquée si le palier n'a pas d'IA.
import { GlassCard } from "@/components/ui/glass-card";
import { useBootstrap } from "@/components/bootstrap-provider";
import { RetentionPackButton } from "@/components/billing/retention-pack";
import type { AiQuotaEntryView } from "@/lib/me-types";

const ROWS: { key: "retention" | "image" | "studio" | "assistant" | "text"; label: string }[] = [
  { key: "retention", label: "Analyses Rétention" },
  { key: "image", label: "Miniatures IA" },
  { key: "studio", label: "Générations du Studio" },
  { key: "assistant", label: "Messages à l'assistant" },
  { key: "text", label: "Textes IA (titres, légendes)" }
];

/** « le 1er novembre » à partir de « 2026-11-01 ». */
export function resetLabel(resetsOn: string | null): string | null {
  if (!resetsOn) return null;
  const d = new Date(`${resetsOn}T12:00:00`);
  return `le 1er ${d.toLocaleDateString("fr-FR", { month: "long" })}`;
}

function perLabel(e: AiQuotaEntryView): string {
  return e.per === "day" ? "aujourd'hui" : e.per === "trial" ? "pendant l'essai" : "ce mois-ci";
}

export function AiQuotaCard() {
  const { data: me } = useBootstrap();
  const quota = me?.ai.quota;
  if (!quota || ROWS.every((r) => quota[r.key].limit <= 0)) return null;
  const reset = resetLabel(quota.resetsOn);
  return (
    <GlassCard>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-medium text-white">IA : ce qu&apos;il vous reste</h2>
        {reset && <p className="text-xs text-slate-500">Quotas du mois remis à zéro {reset} (heure de Paris)</p>}
      </div>
      <ul className="mt-3 divide-y divide-white/[0.06] text-sm">
        {ROWS.filter((r) => quota[r.key].limit > 0).map((r) => {
          const e = quota[r.key];
          return (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-slate-300">{r.label}</span>
              <span className="tabular-nums text-slate-200">
                {e.remaining} restant{e.remaining > 1 ? "s" : ""} sur {e.limit} {perLabel(e)}
                {r.key === "retention" && quota.retentionCredits > 0 && <span className="text-emerald-300"> + {quota.retentionCredits} achetée{quota.retentionCredits > 1 ? "s" : ""}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {quota.retentionPacks && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <RetentionPackButton returnTo="billing" />
          <p className="text-xs text-slate-500">Analyses achetées : utilisées après le quota du mois, sans date limite.</p>
        </div>
      )}
    </GlassCard>
  );
}
