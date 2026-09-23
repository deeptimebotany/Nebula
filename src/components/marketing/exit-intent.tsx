"use client";

// Modale de sortie de /tarifs (brief growth, lot G5.c) : ordinateur
// uniquement (le curseur quitte la page par le haut), une seule fois par
// session (sessionStorage dans un try/catch), après au moins dix secondes
// sur la page. Pas sur téléphone (pas de curseur, et le geste n'existe pas).
// Accessible : piège de focus, fermeture par Échap, bouton étiqueté. Tout
// vit dans ce composant — aucun script inline (CSP avec nonce). Ce n'est pas
// un toast : c'est une modale de produit, Mode focus respecté.
import { useCallback, useEffect, useRef, useState } from "react";
import { SavingsCalculator } from "@/components/marketing/savings-calculator";
import { ButtonLink } from "@/components/ui/button";
import { IconClose } from "@/components/dashboard/icons";
import { trackGrowthEvent } from "@/lib/growth-client";

const SESSION_KEY = "nebula:exit-intent";
const MIN_SECONDS = 10;

function alreadyShown(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markShown() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // stockage indisponible : on ne réaffichera pas grâce à l'état local
  }
}

export function ExitIntentModal({ page = "tarifs" }: { page?: string }) {
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Pas de pointeur fin (téléphone, tablette) → jamais.
    if (!window.matchMedia("(pointer: fine)").matches || window.innerWidth < 900) return;
    if (alreadyShown()) return;
    const arrivedAt = Date.now();

    function onLeave(e: MouseEvent) {
      if (shownRef.current) return;
      if (e.clientY > 0) return; // seule la sortie par le haut compte
      if (Date.now() - arrivedAt < MIN_SECONDS * 1000) return;
      shownRef.current = true;
      markShown();
      previousFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
      trackGrowthEvent("exit_intent_shown", { page });
    }
    document.addEventListener("mouseout", onLeave);
    return () => document.removeEventListener("mouseout", onLeave);
  }, [page]);

  const close = useCallback(() => {
    setOpen(false);
    previousFocus.current?.focus?.();
  }, []);

  // Focus initial + piège de focus + Échap.
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (!node) return;
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled"));
    focusables()[0]?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="exit-intent-title" className="glass-panel-solid max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">Avant de partir</p>
            <h2 id="exit-intent-title" className="mt-2 font-display text-2xl font-semibold text-white">Combien Nebula vous ferait-il économiser ?</h2>
          </div>
          <button type="button" onClick={close} aria-label="Fermer" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">
          <SavingsCalculator compact title="Votre configuration" className="border-0 bg-transparent p-0 sm:p-0" />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ButtonLink href={`/register?utm_source=${page}&utm_medium=exit-intent&utm_campaign=calculateur`} onClick={() => trackGrowthEvent("exit_intent_clicked", { page })}>
            Essayer Nebula gratuitement
          </ButtonLink>
          <button type="button" onClick={close} className="text-sm text-slate-400 transition hover:text-white">
            Continuer ma lecture
          </button>
        </div>
      </div>
    </div>
  );
}
