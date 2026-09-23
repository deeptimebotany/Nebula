"use client";

// État commun des micro-outils IA (brief growth, lot G4.c) : appel à
// /api/public/tools/generate, quota restant, et déclenchement de la capture
// d'email après la 2e génération du jour (voir tool-lead-capture.tsx).
import { useState } from "react";
import { hasToolLead } from "@/components/tools/tool-lead-capture";

export type LeadStep = "idle" | "ask" | "done" | "skipped";

export function useToolGeneration<T>(tool: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [used, setUsed] = useState(0);
  const [leadStep, setLeadStep] = useState<LeadStep>("idle");
  const [result, setResult] = useState<T | null>(null);

  /** Renvoie true si la capture d'email doit s'afficher d'abord. */
  function shouldAskLead(): boolean {
    if (used >= 2 && leadStep === "idle" && !hasToolLead()) {
      setLeadStep("ask");
      return true;
    }
    return false;
  }

  async function generate(body: Record<string, unknown>, pick: (data: Record<string, unknown>) => T) {
    if (shouldAskLead()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/tools/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, ...body }) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Une erreur est survenue.");
        return;
      }
      setResult(pick(data));
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (typeof data.used === "number") setUsed(data.used);
    } catch {
      setError("Impossible de contacter le générateur pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  const leadProps = {
    tool,
    onDone: (bonus: number) => {
      setLeadStep("done");
      setRemaining((r) => (r === null ? null : r + bonus));
    },
    onSkip: () => setLeadStep("skipped")
  };

  return { loading, error, remaining, result, leadStep, generate, leadProps, setError };
}
