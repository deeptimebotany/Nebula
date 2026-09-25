"use client";

// Conseils personnalisés de l'audit : trois paragraphes écrits par l'IA
// (Gemini) à partir des chiffres du rapport, demandés APRÈS l'affichage du
// rapport (il n'attend jamais l'IA), une seule fois par rapport. Si l'IA ne
// répond pas, la section le dit en une ligne : les recommandations par
// règles, au-dessus, restent complètes.
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditAdvice } from "@/lib/audit/types";

export function AdviceSection({ token, initial, enabled }: { token: string; initial: AuditAdvice | null; enabled: boolean }) {
  const [advice, setAdvice] = useState<AuditAdvice | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial && enabled);

  useEffect(() => {
    if (initial || !enabled) return;
    let cancelled = false;
    fetch(`/api/public/audit/${encodeURIComponent(token)}/advice`, { method: "POST" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { advice?: AuditAdvice; error?: string; reason?: string };
        if (cancelled) return;
        if (res.ok && data.advice) setAdvice(data.advice);
        else if (data.reason !== "not_configured") setError(data.error ?? "Les conseils de l'IA ne sont pas disponibles pour le moment.");
        else setError(null);
      })
      .catch(() => !cancelled && setError("Les conseils de l'IA ne sont pas disponibles pour le moment."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, initial, enabled]);

  if (!enabled || (!loading && !advice && !error)) return null;
  return (
    <section aria-labelledby="conseils-title" className="space-y-3">
      <h2 id="conseils-title" className="font-display text-lg font-semibold text-white">
        Conseils personnalisés
      </h2>
      <GlassCard hover={false} className="space-y-3 p-5" aria-busy={loading}>
        {loading ? (
          <div className="space-y-2" role="status" aria-label="Rédaction des conseils en cours">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <p className="pt-1 text-xs text-slate-500">L&apos;IA rédige vos conseils à partir des chiffres du rapport…</p>
          </div>
        ) : advice ? (
          <>
            {advice.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-slate-200">
                {p}
              </p>
            ))}
            <p className="text-[11px] text-slate-500">Rédigé par une IA (Gemini) à partir des seuls chiffres de ce rapport. Relisez avant d&apos;appliquer.</p>
          </>
        ) : (
          <p className="text-sm text-slate-400">{error}</p>
        )}
      </GlassCard>
    </section>
  );
}
