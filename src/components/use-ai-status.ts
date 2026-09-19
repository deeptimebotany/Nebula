"use client";

import { useEffect, useState } from "react";

interface AiStatus {
  enabled: boolean;
  keyConfigured: boolean;
  plan: string;
  planAllowsAi: boolean;
}

/** Sait si les fonctions IA doivent être affichées pour cette marque (clé
 * Gemini configurée par l'hébergeur ET palier Pro/Agence actif). */
export function useAiStatus(brandId: string | undefined) {
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    fetch(`/api/ai/status?brandId=${brandId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStatus(d);
      })
      .catch(() => setStatus({ enabled: false, keyConfigured: false, plan: "FREE", planAllowsAi: false }));
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  return status;
}
