"use client";

// État commun des micro-outils IA de /outils (brief growth, lot G4.c).
// 29/09/2026 : sans compte, `generate` affiche la démo préparée à l'avance
// (aucun appel à l'IA) ; avec un compte, vraie génération via
// /api/public/tools/generate, avec le quota du jour du compte.
import { useState } from "react";
import { markToolExplored } from "@/lib/tools-explored";
import { useToolAccess } from "@/components/tools/use-tool-access";

export function useToolGeneration<T>(tool: string, demo: T) {
  const access = useToolAccess();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);
  /** Vrai quand le résultat affiché est la démo (et non une vraie génération). */
  const [isDemo, setIsDemo] = useState(false);

  async function generate(body: Record<string, unknown>, pick: (data: Record<string, unknown>) => T) {
    setError(null);
    if (access.status !== "member") {
      setResult(demo);
      setIsDemo(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/public/tools/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, ...body }) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 401 && data.signupRequired) {
        access.becomeVisitor();
        setResult(demo);
        setIsDemo(true);
        return;
      }
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Une erreur est survenue.");
        return;
      }
      setResult(pick(data));
      setIsDemo(false);
      // Badge Explorateur (Réussites, lot C) : un vrai résultat obtenu.
      markToolExplored();
      if (typeof data.remaining === "number") access.setRemaining("text", data.remaining);
    } catch {
      setError("Impossible de contacter le générateur pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  return { access, loading, error, result, isDemo, generate, setError };
}
