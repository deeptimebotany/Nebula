"use client";

// Modale de confirmation réutilisable (remplace window.confirm, qui bloque
// le thread et casse le style sombre de l'app) : useConfirm() renvoie une
// promesse résolue à true/false selon le choix de l'utilisateur.

import { createContext, useCallback, useContext, useState } from "react";
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

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setTyped("");
      setPending({ ...opts, resolve });
    });
  }, []);

  function respond(value: boolean) {
    pending?.resolve(value);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-5">
            {pending.title && <h3 className="font-display text-base font-medium text-white">{pending.title}</h3>}
            <p className="mt-1 text-sm text-slate-300">{pending.message}</p>
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
              <Button variant="ghost" onClick={() => respond(false)}>
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
