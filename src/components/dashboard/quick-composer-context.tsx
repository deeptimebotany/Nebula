"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { QuickComposerModal } from "@/components/dashboard/quick-composer-modal";

export interface QuickComposerOpenOptions {
  /** Date pré-remplie (YYYY-MM-DD), ex: depuis un clic sur une case du calendrier. */
  date?: string;
  /** Heure pré-remplie (HH:mm), ex: depuis un créneau horaire du calendrier. */
  time?: string;
}

interface QuickComposerContextValue {
  open: (options?: QuickComposerOpenOptions) => void;
}

const QuickComposerContext = createContext<QuickComposerContextValue | null>(null);

/**
 * Fait vivre l'état de la popup "Nouvelle publication" au niveau du layout
 * dashboard (comme AiAssistantProvider pour la bulle IA) : n'importe quel
 * bouton "Nouveau post" (tableau de bord, calendrier, palette de commandes)
 * peut l'ouvrir via useQuickComposer().open() sans monter une popup par
 * page — une seule instance, montée une fois ici.
 */
export function QuickComposerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; date?: string; time?: string }>({ open: false });

  function open(options?: QuickComposerOpenOptions) {
    setState({ open: true, date: options?.date, time: options?.time });
  }

  function close() {
    setState((s) => ({ ...s, open: false }));
  }

  return (
    <QuickComposerContext.Provider value={{ open }}>
      {children}
      <QuickComposerModal open={state.open} initialDate={state.date} initialTime={state.time} onClose={close} />
    </QuickComposerContext.Provider>
  );
}

export function useQuickComposer(): QuickComposerContextValue {
  const ctx = useContext(QuickComposerContext);
  if (!ctx) throw new Error("useQuickComposer() doit être utilisé sous <QuickComposerProvider>.");
  return ctx;
}
