"use client";

import { useState, useRef, useEffect } from "react";
import { useBrand } from "@/components/brand-context";
import { useAiStatus } from "@/components/use-ai-status";
import { IconClose, IconSend } from "./icons";
import { NebulaIcon } from "./nebula-brandmark";
import { clsx } from "@/lib/clsx";

interface Message {
  role: "user" | "model";
  text: string;
}

/**
 * Chat assistant flottant, disponible sur tout le dashboard. Se contente de
 * ne rien afficher tant que l'IA n'est pas activée (clé Gemini absente ou
 * palier Gratuit) — zéro bouton visible, zéro coût implicite.
 */
export function AiAssistant() {
  const { activeBrand } = useBrand();
  const aiStatus = useAiStatus(activeBrand?.id);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    if (!input.trim() || !activeBrand || sending) return;
    const next: Message[] = [...messages, { role: "user", text: input.trim() }];
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

  if (!aiStatus?.enabled) return null;

  return (
    <>
      {open && (
        <div className="glass-panel fixed bottom-24 right-6 z-40 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <NebulaIcon size={22} />
              <span className="text-sm font-medium text-white">Assistant Nebula</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-slate-500">
                Demandez-moi comment utiliser Nebula, ou posez une question sur vos statistiques (abonnés, portée,
                engagement) — je réponds à partir de vos vraies données connectées.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={clsx(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                  m.role === "user" ? "ml-auto bg-nebula-600/40 text-white" : "bg-white/[0.04] text-slate-200"
                )}
              >
                {m.text}
              </div>
            ))}
            {sending && <div className="max-w-[60%] rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-slate-400">...</div>}
          </div>

          <div className="flex items-center gap-2 border-t border-white/[0.06] p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Votre question..."
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-nebula-500 to-accent-cyan text-white disabled:opacity-40"
            >
              <IconSend className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="nebula-chat-launcher fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white"
        aria-label="Ouvrir l'assistant IA"
      >
        {open ? <IconClose className="h-5 w-5" /> : <NebulaIcon size={30} />}
      </button>
    </>
  );
}
