"use client";

// Champ mot de passe partagé : bouton « afficher / masquer » (avec libellé
// accessible) et, en option, un indicateur de robustesse calculé localement
// (rien n'est envoyé nulle part). Repose sur <Input> pour garder le même
// libellé, la même aide et les mêmes messages d'erreur que les autres champs.
import { useState } from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { clsx } from "@/lib/clsx";

export function passwordStrength(value: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  const clamped = Math.min(4, Math.max(1, score)) as 1 | 2 | 3 | 4;
  const labels: Record<1 | 2 | 3 | 4, string> = { 1: "Trop court", 2: "Faible", 3: "Correct", 4: "Solide" };
  return { score: clamped, label: labels[clamped] };
}

const BAR_COLORS = ["", "bg-red-400", "bg-amber-400", "bg-aurora-400", "bg-emerald-400"];

export function PasswordInput({ showStrength = false, value, ...props }: InputProps & { showStrength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const strength = showStrength ? passwordStrength(String(value ?? "")) : null;

  return (
    <div>
      <Input
        {...props}
        value={value}
        type={visible ? "text" : "password"}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={visible}
            className="rounded-md p-1.5 text-slate-400 transition hover:text-white"
          >
            {visible ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true">
                <path d="M3 3l18 18M10.6 10.7A2 2 0 0 0 13.3 13.3M9.9 5.1A9.8 9.8 0 0 1 12 4.9c5 0 8.6 4.2 9.7 6.6a1 1 0 0 1 0 1c-.5 1-1.4 2.5-2.8 3.8M6.2 6.3C4.2 7.7 2.9 9.6 2.3 10.9a1 1 0 0 0 0 1C3.4 14.3 7 18.5 12 18.5c1.4 0 2.7-.3 3.8-.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true">
                <path d="M2.3 11.4C3.4 8.9 7 4.9 12 4.9s8.6 4 9.7 6.5a1 1 0 0 1 0 1C20.6 14.9 17 18.9 12 18.9s-8.6-4-9.7-6.5a1 1 0 0 1 0-1z" strokeLinejoin="round" />
                <circle cx="12" cy="11.9" r="3" />
              </svg>
            )}
          </button>
        }
      />
      {strength && (
        <div className="mt-2" aria-live="polite">
          <div className="grid grid-cols-4 gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={clsx("h-1 rounded-full transition-colors", i <= strength.score ? BAR_COLORS[strength.score] : "bg-white/10")} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {strength.label ? (
              <>
                Robustesse : <span className="text-slate-300">{strength.label}</span>
                {strength.score < 3 && " — 12 caractères ou plus, avec majuscules, chiffres et symboles, c'est l'idéal."}
              </>
            ) : (
              "8 caractères minimum."
            )}
          </p>
        </div>
      )}
    </div>
  );
}
