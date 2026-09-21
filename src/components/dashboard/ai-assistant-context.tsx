"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useBrand } from "@/components/brand-context";

export interface AiAssistantMessage {
  role: "user" | "model";
  text: string;
}

interface AiAssistantContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: AiAssistantMessage[];
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  send: () => void;
  /** Ajoute un message "explication" dans la bulle Assistant Nebula et
   *  l'ouvre automatiquement — utilisé après une génération IA (titre,
   *  description, miniatures) pour que le "pourquoi" ne reste jamais
   *  invisible (voir composer/page.tsx). */
  explain: (text: string) => void;
  /** Vide la conversation en cours (bouton "Nouvelle conversation" du
   *  crayon dans l'en-tête) — ne touche à rien côté serveur, juste l'état
   *  local affiché. */
  clearMessages: () => void;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

/**
 * Fait vivre l'état de la bulle Assistant Nebula (messages, ouverture) au
 * niveau du layout dashboard plutôt que dans le composant flottant lui-même
 * (ai-assistant.tsx) : ça permet à n'importe quelle page (ex: le Composer)
 * d'y pousser une explication via useAiAssistantBubble(), sans dupliquer un
 * second panneau de chat.
 */
export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const { activeBrand } = useBrand();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiAssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!input.trim() || !activeBrand || sending) return;
    const next: AiAssistantMessage[] = [...messages, { role: "user", text: input.trim() }];
    setMessages(next);
    setInput("");
    setSending(true);

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: activeBrand.id, messages: next })
    });
    const data = await res.json();
    setSending(false);

    if (!res.ok) {
      setMessages((prev) => [...prev, { role: "model", text: `⚠️ ${data.error ?? "Erreur de l'assistant."}` }]);
      return;
    }
    setMessages((prev) => [...prev, { role: "model", text: data.reply }]);
  }

  function explain(text: string) {
    setMessages((prev) => [...prev, { role: "model", text }]);
    setOpen(true);
  }

  function clearMessages() {
    setMessages([]);
  }

  return (
    <AiAssistantContext.Provider
      value={{ open, setOpen, messages, input, setInput, sending, send, explain, clearMessages }}
    >
      {children}
    </AiAssistantContext.Provider>
  );
}

export function useAiAssistantBubble(): AiAssistantContextValue {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) throw new Error("useAiAssistantBubble() doit être utilisé sous <AiAssistantProvider>.");
  return ctx;
}
