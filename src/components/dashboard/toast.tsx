"use client";

// Petit système de notifications "toast" auto-suffisant (pas de dépendance
// externe) qui remplace les alert()/messages perdus dans la page : succès,
// erreurs et infos apparaissent en bas à droite et disparaissent seuls.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { useCosmetics } from "@/components/cosmetics-provider";
import { playPulsarChime } from "@/lib/cosmic-audio";

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
  // Cosmétique "Son Pulsar" (voir src/lib/cosmetics.ts) : petit carillon
  // synthétisé qui accompagne chaque notification de succès, uniquement si
  // le compte l'a activé (et y a droit — CosmeticsProvider ne renvoie la clé
  // dans `enabled` que dans ce cas, voir /api/settings/cosmetics).
  const cosmetics = useCosmetics();
  // Lu via une référence : `push` (et donc la valeur du contexte) reste le
  // même objet d'un rendu à l'autre. Avant, chaque toast affiché recréait
  // la valeur et re-rendait tous les composants qui utilisent useToast()
  // (audit performance, lot 4).
  const hasCosmetic = useRef(cosmetics.has);
  useEffect(() => {
    hasCosmetic.current = cosmetics.has;
  }, [cosmetics.has]);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, kind, message }]);
      if (kind === "success" && hasCosmetic.current("son-pulsar")) {
        try {
          playPulsarChime();
        } catch {
          // agrément sonore facultatif — jamais bloquant
        }
      }
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m)
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Zone "live" : chaque notification est annoncée aux lecteurs d'écran
          (aria-live polite) sans interrompre ce que fait la personne. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-20 right-4 z-[100] flex w-[min(320px,calc(100vw-2rem))] flex-col gap-2 lg:bottom-5 lg:right-5"
      >
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
              className="text-current transition hover:brightness-125"
              aria-label="Fermer la notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Filet de sécurité si un composant est monté hors du provider (ne devrait
// pas arriver dans le dashboard) : on retombe sur la console. Objet unique,
// pour rester stable dans les dépendances des effets.
const CONSOLE_TOAST: ToastContextValue = {
  success: (m) => console.log("[toast:success]", m),
  error: (m) => console.error("[toast:error]", m),
  info: (m) => console.info("[toast:info]", m)
};

export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? CONSOLE_TOAST;
}
