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
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
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
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => respond(false)}>
                {pending.cancelLabel ?? "Annuler"}
              </Button>
              <Button variant={pending.danger ? "danger" : "glow"} onClick={() => respond(true)}>
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
