"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/clsx";
import { IconClose } from "@/components/dashboard/icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Largeur max du panneau, ex "max-w-lg" (défaut) ou "max-w-xl". */
  maxWidthClassName?: string;
  children: ReactNode;
}

/**
 * Coquille de fenêtre modale générique (fond assombri + flou + panneau
 * "verre"), factorisée à partir du mécanisme déjà présent dans
 * post-edit-modal.tsx (Échap pour fermer, clic sur le fond pour fermer) —
 * pour que toute nouvelle popup réutilise
 * la même mécanique au lieu de la redupliquer à chaque fois. Rendue via un
 * portail dans <body> pour ne jamais être coupée par un ancêtre avec
 * overflow/transform (ex : la mise en page du tableau de bord).
 */
export function Modal({ open, onClose, title, maxWidthClassName = "max-w-lg", children }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={clsx(
          "glass-panel relative z-10 w-full overflow-y-auto rounded-2xl p-5",
          maxWidthClassName
        )}
        style={{ maxHeight: "90vh" }}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-display text-lg font-semibold text-white">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
