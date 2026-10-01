"use client";

// Modale de confirmation réutilisable (remplace window.confirm, qui bloque
// le thread et casse le style sombre de l'app) : useConfirm() renvoie une
// promesse résolue à true/false selon le choix de l'utilisateur.

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Texte à retaper pour activer le bouton (actions définitives). */
  requireText?: string;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const messageId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      returnFocus.current = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
      setTyped("");
      setPending({ ...opts, resolve });
    });
  }, []);

  function respond(value: boolean) {
    pending?.resolve(value);
    setPending(null);
    // Le focus revient sur le bouton qui a ouvert la question (clavier).
    returnFocus.current?.focus?.();
  }

  // Échap = Annuler (01/10/2026), comme les autres fenêtres de l'application.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      pendingRef.current?.resolve(false);
      setPending(null);
      returnFocus.current?.focus?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={pending.title ? titleId : undefined}
            aria-describedby={messageId}
            className="glass-panel w-full max-w-sm rounded-2xl p-5"
          >
            {pending.title && (
              <h3 id={titleId} className="font-display text-base font-medium text-white">
                {pending.title}
              </h3>
            )}
            <p id={messageId} className="mt-1 text-sm text-slate-300">
              {pending.message}
            </p>
            {pending.requireText && (
              <label className="mt-4 block text-xs text-slate-400">
                Pour confirmer, tapez <strong className="text-white">{pending.requireText}</strong>
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && typed.trim() === pending.requireText && respond(true)}
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
                />
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              {/* Focus par défaut sur « Annuler » : Entrée ne supprime jamais par mégarde. */}
              <Button variant="ghost" onClick={() => respond(false)} autoFocus={!pending.requireText}>
                {pending.cancelLabel ?? "Annuler"}
              </Button>
              <Button
                variant={pending.danger ? "danger" : "glow"}
                onClick={() => respond(true)}
                disabled={Boolean(pending.requireText) && typed.trim() !== pending.requireText}
              >
                {pending.confirmLabel ?? "Confirmer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Filet de sécurité si utilisé hors provider.
    return async (options) => window.confirm(typeof options === "string" ? options : options.message);
  }
  return ctx;
}
