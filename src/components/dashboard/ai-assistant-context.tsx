"use client";

// État partagé du tiroir « Demander à Nebula » (voir ai-assistant.tsx pour
// l'interface). Monté dans le layout du dashboard, au-dessus du shell : ainsi
// l'en-tête (bouton « Demander à Nebula », seul point d'entrée général
// depuis le 06/10/2026 : le bouton flottant faisait doublon), n'importe
// quelle page (ex. la section Miniature du composer) et le tiroir lui-même
// parlent du MÊME assistant, sans dupliquer de panneau.
//
// Le contexte actif est calculé ici, une seule fois, à partir de l'URL
// (resolveAssistantContext) — et une page peut le forcer temporairement
// (setContextOverride) quand l'URL seule ne suffit pas : la page Publier
// passe en « thumbnails » quand sa section Miniature est à l'écran. Toute
// navigation remet l'override à zéro, pour ne jamais rester bloqué sur un
// contexte d'une page qu'on a quittée.
// 09/10/2026 : l'override est attaché à la page où il a été posé (et non plus
// effacé par un effet au changement de page, qui passait APRÈS l'effet de la
// nouvelle page et effaçait son override) : un onglet d'une page (Rétention
// IA dans Analytics, Engagement dans Interactions) peut ainsi poser le sien
// dès son affichage.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { useAiStatus } from "@/components/use-ai-status";
import { resolveAssistantContext, type AssistantContextKey } from "@/lib/ai/assistant-contexts";
import type { FramePickCard } from "@/lib/ai/thumbnail-brief-bridge";

export interface PendingPrompt {
  text: string;
  /** true : envoyer tout de suite ; false : seulement pré-remplir la saisie. */
  submit: boolean;
  /** Change à chaque demande, pour qu'un même texte demandé deux fois de
   *  suite soit bien traité deux fois. */
  nonce: number;
}

/** Message ajouté au fil par une page (sans passer par Gemini) — ex. les
 *  3 miniatures proposées par « Générer des miniatures » du composer. */
export interface InjectedMessage {
  role: "user" | "model";
  text: string;
  framePicks?: FramePickCard[];
  error?: boolean;
}

export interface PendingInjection {
  messages: InjectedMessage[];
  nonce: number;
}

interface AiAssistantContextValue {
  /** IA disponible pour la marque active (clé Gemini + palier). Faux → aucun
   *  bouton n'est affiché, nulle part. */
  enabled: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /** Le tiroir est à télécharger (survol ou focus du bouton de l'en-tête) :
   *  il est monté fermé avant l'ouverture, pour garder son animation. */
  prepared: boolean;
  prepare: () => void;
  /** Contexte effectif : override d'une page, sinon celui de l'URL. */
  contextKey: AssistantContextKey;
  setContextOverride: (key: AssistantContextKey | null) => void;
  /** Ouvre le tiroir avec une question (envoyée, ou juste pré-remplie). */
  ask: (text: string, options?: { submit?: boolean; contextKey?: AssistantContextKey }) => void;
  pendingPrompt: PendingPrompt | null;
  consumePendingPrompt: () => void;
  /** Ajoute des messages au fil et ouvre le tiroir. */
  inject: (messages: InjectedMessage[], options?: { contextKey?: AssistantContextKey }) => void;
  pendingInjection: PendingInjection | null;
  consumePendingInjection: () => void;
  /** Une page travaille pour l'assistant (ex. analyse des images) : affiche
   *  l'indicateur « en train d'écrire ». */
  externalThinking: boolean;
  /** Ce que fait la page pendant ce temps, affiché à côté de l'indicateur
   *  (« Je regarde votre vidéo… ») : une longue attente reste lisible. */
  externalThinkingLabel: string | null;
  setExternalThinking: (v: boolean, label?: string) => void;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { activeBrand } = useBrand();
  const aiStatus = useAiStatus(activeBrand?.id);

  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState(false);
  // Override + page où il a été posé : ignoré dès qu'on change de page.
  const [overrideState, setOverrideState] = useState<{ key: AssistantContextKey; path: string } | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const setOverride = useCallback((key: AssistantContextKey | null) => {
    setOverrideState(key ? { key, path: pathRef.current } : null);
  }, []);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [pendingInjection, setPendingInjection] = useState<PendingInjection | null>(null);
  const [externalThinking, setExternalThinkingState] = useState(false);
  const [externalThinkingLabel, setExternalThinkingLabel] = useState<string | null>(null);
  const setExternalThinking = useCallback((v: boolean, label?: string) => {
    setExternalThinkingState(v);
    setExternalThinkingLabel(v && label ? label : null);
  }, []);

  // Changement de page → l'override de la page précédente n'a plus de sens.
  const override = overrideState && overrideState.path === pathname ? overrideState.key : null;

  const pageKey = useMemo(() => resolveAssistantContext(pathname), [pathname]);
  const contextKey = override ?? pageKey;

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const prepare = useCallback(() => setPrepared(true), []);

  const ask = useCallback((text: string, options?: { submit?: boolean; contextKey?: AssistantContextKey }) => {
    if (options?.contextKey) setOverride(options.contextKey);
    setPendingPrompt({ text, submit: options?.submit ?? true, nonce: Date.now() });
    setOpen(true);
  }, [setOverride]);

  const consumePendingPrompt = useCallback(() => setPendingPrompt(null), []);

  const inject = useCallback((messages: InjectedMessage[], options?: { contextKey?: AssistantContextKey }) => {
    if (options?.contextKey) setOverride(options.contextKey);
    // Ajout à la file (et non remplacement) : deux injections rapprochées
    // (question puis réponse) ne doivent pas s'écraser.
    setPendingInjection((prev) => ({ messages: [...(prev?.messages ?? []), ...messages], nonce: Date.now() }));
    setOpen(true);
  }, [setOverride]);
  const consumePendingInjection = useCallback(() => setPendingInjection(null), []);

  const value = useMemo<AiAssistantContextValue>(
    () => ({
      enabled: Boolean(aiStatus?.enabled),
      open,
      setOpen,
      toggle,
      prepared,
      prepare,
      contextKey,
      setContextOverride: setOverride,
      ask,
      pendingPrompt,
      consumePendingPrompt,
      inject,
      pendingInjection,
      consumePendingInjection,
      externalThinking,
      externalThinkingLabel,
      setExternalThinking
    }),
    [aiStatus?.enabled, open, toggle, prepared, prepare, contextKey, setOverride, ask, pendingPrompt, consumePendingPrompt, inject, pendingInjection, consumePendingInjection, externalThinking, externalThinkingLabel, setExternalThinking]
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
