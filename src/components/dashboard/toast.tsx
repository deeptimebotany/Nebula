"use client";

// Petit système de notifications "toast" auto-suffisant (pas de dépendance
// externe) qui remplace les alert()/messages perdus dans la page : succès,
// erreurs et infos apparaissent en bas à droite et disparaissent seuls.

import { createContext, useCallback, useContext, useState } from "react";
import { clsx } from "@/lib/clsx";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-200",
  error: "border-red-500/30 bg-red-500/[0.12] text-red-200",
  info: "border-aurora-400/30 bg-nebula-700/40 text-slate-100"
};

const KIND_ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ"
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const value: ToastContextValue = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m)
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[320px] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm shadow-lg backdrop-blur-xl animate-fade-in",
              KIND_STYLES[t.kind]
            )}
          >
            <span className="mt-0.5">{KIND_ICON[t.kind]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-current opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Filet de sécurité si un composant est monté hors du provider (ne
    // devrait pas arriver dans le dashboard) : on retombe sur console.
    return {
      success: (m) => console.log("[toast:success]", m),
      error: (m) => console.error("[toast:error]", m),
      info: (m) => console.info("[toast:info]", m)
    };
  }
  return ctx;
}
