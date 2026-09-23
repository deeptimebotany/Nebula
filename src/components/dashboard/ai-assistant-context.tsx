"use client";

// État partagé du tiroir « Demander à Nebula » (voir ai-assistant.tsx pour
// l'interface). Monté dans le layout du dashboard, au-dessus du shell : ainsi
// l'en-tête (bouton « Demander à Nebula »), le bouton flottant, n'importe
// quelle page (ex. la section Miniature du composer) et le tiroir lui-même
// parlent du MÊME assistant, sans dupliquer de panneau.
//
// Le contexte actif est calculé ici, une seule fois, à partir de l'URL
// (resolveAssistantContext) — et une page peut le forcer temporairement
// (setContextOverride) quand l'URL seule ne suffit pas : la page Publier
// passe en « thumbnails » quand sa section Miniature est à l'écran. Toute
// navigation remet l'override à zéro, pour ne jamais rester bloqué sur un
// contexte d'une page qu'on a quittée.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { useAiStatus } from "@/components/use-ai-status";
import { resolveAssistantContext, type AssistantContextKey } from "@/lib/ai/assistant-contexts";

export interface PendingPrompt {
  text: string;
  /** true : envoyer tout de suite ; false : seulement pré-remplir la saisie. */
  submit: boolean;
  /** Change à chaque demande, pour qu'un même texte demandé deux fois de
   *  suite soit bien traité deux fois. */
  nonce: number;
}

interface AiAssistantContextValue {
  /** IA disponible pour la marque active (clé Gemini + palier). Faux → aucun
   *  bouton n'est affiché, nulle part. */
  enabled: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /** Contexte effectif : override d'une page, sinon celui de l'URL. */
  contextKey: AssistantContextKey;
  setContextOverride: (key: AssistantContextKey | null) => void;
  /** Ouvre le tiroir avec une question (envoyée, ou juste pré-remplie). */
  ask: (text: string, options?: { submit?: boolean; contextKey?: AssistantContextKey }) => void;
  pendingPrompt: PendingPrompt | null;
  consumePendingPrompt: () => void;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { activeBrand } = useBrand();
  const aiStatus = useAiStatus(activeBrand?.id);

  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<AssistantContextKey | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);

  // Changement de page → l'override de la page précédente n'a plus de sens.
  useEffect(() => {
    setOverride(null);
  }, [pathname]);

  const pageKey = useMemo(() => resolveAssistantContext(pathname), [pathname]);
  const contextKey = override ?? pageKey;

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const ask = useCallback((text: string, options?: { submit?: boolean; contextKey?: AssistantContextKey }) => {
    if (options?.contextKey) setOverride(options.contextKey);
    setPendingPrompt({ text, submit: options?.submit ?? true, nonce: Date.now() });
    setOpen(true);
  }, []);

  const consumePendingPrompt = useCallback(() => setPendingPrompt(null), []);

  const value = useMemo<AiAssistantContextValue>(
    () => ({
      enabled: Boolean(aiStatus?.enabled),
      open,
      setOpen,
      toggle,
      contextKey,
      setContextOverride: setOverride,
      ask,
      pendingPrompt,
      consumePendingPrompt
    }),
    [aiStatus?.enabled, open, toggle, contextKey, ask, pendingPrompt, consumePendingPrompt]
  );

  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>;
}

export function useAiAssistant(): AiAssistantContextValue {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) throw new Error("useAiAssistant() doit être utilisé sous <AiAssistantProvider>.");
  return ctx;
}

/** Variante tolérante pour les composants qui peuvent vivre hors du
 *  dashboard (retourne null au lieu de lever une erreur). */
export function useOptionalAiAssistant(): AiAssistantContextValue | null {
  return useContext(AiAssistantContext);
}
