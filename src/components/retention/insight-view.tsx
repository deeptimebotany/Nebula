"use client";

// Affichage d'une analyse Rétention IA (30/09/2026), partagé par /retention
// et la fiche d'une publication : ce que l'IA a vu, les chutes calculées par
// Nebula (moment, spectateurs restants) avec l'explication de l'IA, les
// conseils, et « Refaire l'analyse » (compte une analyse). Lit aussi les
// analyses d'avant (note seule, position en % de la vidéo).
import { RetentionCurveChart } from "@/components/charts/lazy";
import { useBootstrap } from "@/components/bootstrap-provider";
import { RetentionPackButton } from "@/components/billing/retention-pack";
import { formatClock } from "@/lib/ai/retention";
import { clsx } from "@/lib/clsx";
import type { AiQuotaView } from "@/lib/me-types";

export interface InsightData {
  id: string;
  summary: string;
  dropOffPoints: string;
  recommendations: string;
  retentionCurve: string;
  mode?: string | null;
  createdAt?: string | null;
}

interface DropPoint {
  timeRatio: number;
  watchRatio: number;
  note?: string;
  second?: number | null;
  before?: number;
  after?: number;
  lostShare?: number;
  scene?: string;
  cause?: string;
}

function parse<T>(json: string | null | undefined, fallback: T): T {
  try {
    return json ? (JSON.parse(json) as T) : fallback;
  } catch {
    return fallback;
  }
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

const MODE_LABEL: Record<string, { text: string; tone: string }> = {
  video: { text: "L'IA a regardé la vidéo", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" },
  clips: { text: "L'IA a regardé le début et les passages des chutes", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" },
  frames: { text: "L'IA a vu une image à chaque chute", tone: "border-white/10 bg-white/[0.04] text-slate-300" },
  thumbnail: { text: "Vidéo privée ou non listée : l'IA n'a vu que la miniature, ses explications sont des hypothèses", tone: "border-amber-300/30 bg-amber-300/10 text-amber-100" }
};

export function RetentionInsightView({ insight, onRedo, redoing, chartHeight = 180 }: { insight: InsightData; onRedo: () => void; redoing: boolean; chartHeight?: number }) {
  const curve = parse<{ timeRatio: number; watchRatio: number }[]>(insight.retentionCurve, []);
  const drops = parse<DropPoint[]>(insight.dropOffPoints, []);
  const recommendations = parse<string[]>(insight.recommendations, []);
  const mode = insight.mode ? MODE_LABEL[insight.mode] : null;
  const date = insight.createdAt ? new Date(insight.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : null;

  return (
    <div className="space-y-3">
      {mode && <p className={clsx("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium", mode.tone)}>{mode.text}</p>}
      {insight.summary && <p className="text-sm text-slate-200">{insight.summary}</p>}
      {curve.length > 0 && <RetentionCurveChart points={curve} height={chartHeight} />}
      {drops.length > 0 && (
        <ul className="space-y-2">
          {drops.map((d, i) => {
            const when = typeof d.second === "number" ? formatClock(d.second) : `${Math.round(d.timeRatio * 100)} % de la vidéo`;
            const text = d.scene || d.cause ? [d.scene, d.cause].filter(Boolean).join(" — ") : (d.note ?? "");
            return (
              <li key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold tabular-nums text-aurora-300">À {when}</span>
                  {typeof d.before === "number" && typeof d.after === "number" && (
                    <span className="tabular-nums text-slate-400">
                      spectateurs restants : {pct(d.before)} → {pct(d.after)}
                      {typeof d.lostShare === "number" && d.lostShare > 0 && <> · {pct(d.lostShare)} des personnes encore là partent</>}
                    </span>
                  )}
                </p>
                {text && <p className="mt-1 text-slate-300">{text}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {recommendations.length > 0 && (
        <ul className="space-y-1 text-xs text-emerald-300">
          {recommendations.map((r, i) => (
            <li key={i}>✓ {r}</li>
          ))}
        </ul>
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {date && <span>Analyse du {date} · les chiffres viennent de YouTube Analytics, les explications de l&apos;IA.</span>}
        <button type="button" onClick={onRedo} disabled={redoing} className="text-slate-400 underline-offset-2 hover:text-white hover:underline">
          {redoing ? "Analyse en cours…" : "Refaire l'analyse (compte 1 analyse)"}
        </button>
      </p>
    </div>
  );
}

/**
 * Recharge d'analyses (Pro, Agence) quand il en reste peu. 10/10/2026 (demande
 * de Lucas) : plus aucun nombre d'analyses restantes ; seulement, quand tout
 * est utilisé, la phrase « Analyses du mois utilisées ».
 */
export function RetentionQuotaLine({ className }: { className?: string }) {
  const { data: me } = useBootstrap();
  const q = me?.ai.quota;
  if (!q || q.retention.limit <= 0) return null;
  return <RetentionQuotaText quota={q} className={className} />;
}

function RetentionQuotaText({ quota, className }: { quota: AiQuotaView; className?: string }) {
  const r = quota.retention;
  const empty = r.remaining <= 0 && quota.retentionCredits <= 0;
  const pack = quota.retentionPacks && r.remaining <= 3;
  if (!empty && !pack) return null;
  return (
    <div className={clsx("flex flex-wrap items-center gap-3 text-xs", className)}>
      {empty && <p className="text-amber-200">Analyses {r.per === "trial" ? "de l'essai" : "du mois"} utilisées.</p>}
      {pack && <RetentionPackButton />}
    </div>
  );
}
