"use client";

// « Tester la connexion à Gemini » (07/10/2026) : quand l'IA échoue en
// production, deux appels courts avec la clé et le modèle de ce déploiement
// disent POURQUOI (clé refusée, modèle introuvable, crédits épuisés, Google
// qui ne répond pas…), au lieu du message générique montré aux
// utilisateurs. Voir diagnoseGemini() dans src/lib/ai/gemini.ts.
import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GeminiDiagnostic } from "@/lib/ai/gemini";

const seconds = (ms: number) => `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;

export function GeminiDiagnosticCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GeminiDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ia/diagnostic", { method: "POST" });
      if (!res.ok) throw new Error(res.status === 504 ? "Vercel a coupé le test (plus de 60 s) : Google ne répond pas du tout." : `Le test n'a pas pu se lancer (HTTP ${res.status}).`);
      setResult((await res.json()) as GeminiDiagnostic);
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard hover={false} data-testid="gemini-diagnostic">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-medium text-white">Connexion à Gemini</h2>
          <p className="mt-1 text-xs text-slate-500">
            Deux appels courts avec la clé et le modèle de ce déploiement : la lecture du modèle (gratuite), puis une réponse de quelques mots (une fraction de centime). À lancer quand l&apos;IA affiche une erreur.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void run()} disabled={busy}>
          {busy ? "Test en cours…" : "Tester la connexion à Gemini"}
        </Button>
      </div>

      {error && <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-sm text-red-300">{error}</p>}

      {result && (
        <div className="mt-4 space-y-3" data-testid="gemini-diagnostic-result">
          <p className={result.ok ? "rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-sm text-emerald-200" : "rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-100"}>
            {result.verdict}
          </p>
          <p className="text-xs text-slate-400">
            Modèle : <span className="font-mono text-slate-200">{result.model}</span>
            {result.keyEnd && (
              <>
                {" "}· Clé se terminant par <span className="font-mono text-slate-200">…{result.keyEnd}</span> (à comparer avec AI Studio → Clés API)
              </>
            )}
          </p>
          {result.keyIssues.length > 0 && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-100">
              La valeur de GEMINI_API_KEY sur Vercel contient en trop : {result.keyIssues.join(", ")}. Nebula le retire automatiquement, mais recollez la clé proprement sur Vercel quand vous pouvez.
            </p>
          )}
          <ul className="space-y-2">
            {result.steps.map((step) => (
              <li key={step.label} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-white">{step.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-slate-400">{seconds(step.ms)}</span>
                    <Badge tone={step.ok ? "success" : "danger"}>{step.ok ? "OK" : "Échec"}</Badge>
                  </span>
                </p>
                <p className="mt-1 break-words text-xs text-slate-300">
                  {step.httpStatus !== null && <span className="font-mono">HTTP {step.httpStatus} </span>}
                  {step.googleStatus && <span className="font-mono">{step.googleStatus} </span>}
                  {(step.httpStatus !== null || step.googleStatus) && "— "}
                  {step.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
