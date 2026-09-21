"use client";

import { useEffect, useRef } from "react";
import { useBrand } from "@/components/brand-context";
import { useAiStatus } from "@/components/use-ai-status";
import { useAiAssistantBubble } from "./ai-assistant-context";
import { IconSparkle, IconClose, IconSend, IconMenu, IconEdit } from "./icons";
import { clsx } from "@/lib/clsx";

/**
 * Chat assistant flottant, disponible sur tout le dashboard. Se contente de
 * ne rien afficher tant que l'IA n'est pas activée (clé Gemini absente ou
 * palier Gratuit) — zéro bouton visible, zéro coût implicite. L'état (messages,
 * ouverture) vit dans AiAssistantProvider (voir ai-assistant-context.tsx) afin
 * que d'autres pages (ex: le Composer) puissent y pousser une explication.
 */
export function AiAssistant() {
  const { activeBrand } = useBrand();
  const aiStatus = useAiStatus(activeBrand?.id);
  const { open, setOpen, messages, input, setInput, sending, send, clearMessages } = useAiAssistantBubble();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  if (!aiStatus?.enabled) return null;

  return (
    <>
      {open && (
        // Wrapper séparé du panneau "verre" lui-même : .chat-panel-glow pose
        // son halo violet/magenta (::before flouté) sur un élément SANS
        // overflow-hidden, pour qu'il ne soit pas rogné par celui du panneau
        // (nécessaire pour clipper proprement les messages/le scroll).
        <div className="chat-panel-glow fixed bottom-24 right-6 z-40 w-[380px]">
          <div className="glass-panel relative z-10 flex h-[560px] flex-col overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <IconMenu className="h-4 w-4 text-slate-500" />
                <span className="font-display text-sm font-semibold text-white">Assistant Nebula</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearMessages}
                  title="Nouvelle conversation"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  <IconEdit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <p className="text-sm text-slate-500">
                  Demandez-moi comment utiliser Nebula, ou posez une question sur vos statistiques (abonnés, portée,
                  engagement) — je réponds à partir de vos vraies données connectées. Les explications de mes
                  générations IA (titres, miniatures...) apparaissent aussi ici.
                </p>
              )}
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div
                    key={i}
                    className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-gradient-to-br from-accent-violet/80 to-accent-magenta/70 px-3.5 py-2.5 text-sm text-white shadow-[0_8px_24px_-10px_rgba(180,90,240,0.6)]"
                  >
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className="flex max-w-[92%] items-start gap-2 whitespace-pre-wrap text-sm text-slate-200">
                    <IconSparkle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-violet" />
                    <p>{m.text}</p>
                  </div>
                )
              )}
              {sending && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <IconSparkle className="h-3.5 w-3.5 shrink-0 animate-pulse text-accent-violet" />
                  <span>Réflexion en cours...</span>
                </div>
              )}
            </div>

            <div className="border-t border-white/[0.06] p-3">
              <div
                className={clsx(
                  "flex items-center gap-2 rounded-full border bg-white/[0.03] px-2 py-1.5 transition",
                  "border-accent-violet/30 shadow-[0_0_22px_-8px_rgba(170,90,240,0.5)] focus-within:border-accent-violet/60"
                )}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Posez une question..."
                  className="flex-1 bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-slate-500"
                />
                <button
                  onClick={send}
                  disabled={sending || !input.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-violet to-accent-magenta text-white disabled:opacity-40"
                >
                  <IconSend className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 px-1 text-[10.5px] leading-snug text-slate-500">
                L&apos;IA peut faire des erreurs. Vérifiez les informations importantes avant de publier.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="chat-panel-glow fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setOpen(!open)}
          className="btn-glow relative z-10 flex h-14 w-14 items-center justify-center rounded-full text-white"
          aria-label="Ouvrir l'assistant IA"
        >
          {open ? <IconClose className="h-5 w-5" /> : <IconSparkle className="h-5 w-5" />}
        </button>
      </div>
    </>
  );
}
