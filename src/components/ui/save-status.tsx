"use client";

// Enregistrement visible (24/09/2026) : sur les pages qui enregistrent
// toutes seules (Page bio, Rapports, Calendrier partagé…), on ne savait pas
// si une modification était prise en compte. Ce hook suit chaque
// enregistrement, et <SaveStatus> l'affiche en haut de la page :
// « Modifications non enregistrées » (avec bouton Enregistrer), « Enregistrement… »,
// « Enregistré ✓ » ou « Échec de l'enregistrement ».
import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useSaveStatus() {
  const [state, setState] = useState<SaveState>("idle");
  const pending = useRef(0);

  /** Suit un enregistrement : renvoie true s'il a réussi. */
  const track = useCallback(async (run: () => Promise<boolean>): Promise<boolean> => {
    pending.current += 1;
    setState("saving");
    let ok = false;
    try {
      ok = await run();
    } catch {
      ok = false;
    }
    pending.current -= 1;
    if (!ok) setState("error");
    else if (pending.current === 0) setState("saved");
    return ok;
  }, []);

  return { state, track, setState };
}

/** Prévient avant de quitter la page tant que des modifications ne sont pas enregistrées. */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

export function SaveStatus({
  state,
  dirty = false,
  onSave,
  className
}: {
  state: SaveState;
  /** Des champs ont été modifiés mais pas encore enregistrés. */
  dirty?: boolean;
  /** Affiche un bouton « Enregistrer » quand dirty. */
  onSave?: () => void;
  className?: string;
}) {
  const saving = state === "saving";
  const label = saving
    ? "Enregistrement…"
    : dirty
      ? "Modifications non enregistrées"
      : state === "error"
        ? "Échec de l'enregistrement — réessayez"
        : state === "saved"
          ? "Toutes les modifications sont enregistrées"
          : "Enregistrement automatique";
  const tone = saving ? "text-slate-300" : dirty ? "text-amber-300" : state === "error" ? "text-red-300" : state === "saved" ? "text-emerald-300" : "text-slate-500";

  return (
    <div className={clsx("flex items-center gap-2", className)} role="status" aria-live="polite">
      <span className={clsx("flex items-center gap-1.5 text-xs", tone)}>
        {saving ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
        ) : (
          <span
            className={clsx(
              "h-2 w-2 rounded-full",
              dirty ? "bg-amber-300" : state === "error" ? "bg-red-400" : state === "saved" ? "bg-emerald-400" : "bg-slate-500"
            )}
            aria-hidden="true"
          />
        )}
        {label}
      </span>
      {onSave && (dirty || state === "error") && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn-glow rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          Enregistrer
        </button>
      )}
    </div>
  );
}
