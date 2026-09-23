"use client";

// Interrupteur Activé/Désactivé partagé (role="switch", utilisable au
// clavier : Espace/Entrée). Remplace les deux implémentations divergentes
// qui existaient (pilule texte « Activé/Désactivé » dans Paramètres,
// interrupteur dessiné à la main dans Facturation).
import { clsx } from "@/lib/clsx";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Libellé visible à côté de l'interrupteur (ou aria-label si absent). */
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  /** Nom accessible quand aucun libellé visible n'est fourni. */
  "aria-label"?: string;
  className?: string;
  size?: "sm" | "md";
}

export function Toggle({ checked, onChange, label, description, disabled, className, size = "md", ...aria }: ToggleProps) {
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const travel = size === "sm" ? "translate-x-4" : "translate-x-5";
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria["aria-label"]}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
        track,
        checked ? "border-aurora-400/60 bg-aurora-400/40" : "border-white/15 bg-white/10",
        !label && className
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          "absolute left-0.5 rounded-full bg-white shadow transition-transform",
          knob,
          checked ? travel : "translate-x-0"
        )}
      />
    </button>
  );

  if (!label) return control;

  return (
    <label className={clsx("flex cursor-pointer items-start justify-between gap-4", disabled && "cursor-not-allowed", className)}>
      <span className="min-w-0">
        <span className="block text-sm text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      {control}
    </label>
  );
}
