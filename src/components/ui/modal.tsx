"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
 *
 * Clavier (02/10/2026) : à l'ouverture, le focus entre dans la fenêtre (sauf
 * si un champ « autoFocus » l'a déjà pris) ; Tab et Maj+Tab restent dans la
 * fenêtre ; à la fermeture, le focus revient au bouton qui l'a ouverte.
 */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, maxWidthClassName = "max-w-lg", children }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Élément qui avait le focus à l'ouverture, lu au rendu : avant qu'un champ
  // « autoFocus » de la fenêtre ne le prenne.
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    openerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }
  wasOpen.current = open;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    const opener = openerRef.current;
    return () => {
      // La fenêtre a disparu : le focus est retombé sur la page. On le rend
      // au bouton d'ouverture s'il existe encore (sinon, rien).
      const active = document.activeElement;
      if (opener?.isConnected && (!active || active === document.body || !active.isConnected)) opener.focus({ preventScroll: true });
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;
      // Une autre fenêtre (confirmation…) par-dessus : elle gère son clavier.
      const otherDialog = active instanceof Element ? active.closest('[role="dialog"],[role="alertdialog"]') : null;
      if (otherDialog && otherDialog !== panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={clsx(
          "glass-panel relative z-10 w-full overflow-y-auto rounded-2xl p-5 outline-none",
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
