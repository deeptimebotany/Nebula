"use client";

// Champs de formulaire partagés — Input, Textarea, Select — avec libellé
// relié (htmlFor/id générés), texte d'aide et message d'erreur annoncés
// aux lecteurs d'écran (aria-describedby / aria-invalid). Avant ce fichier,
// chaque page recopiait ses propres classes de champ (58 variantes) sans
// aucun <label htmlFor> : un champ n'avait donc pas de nom accessible.
//
// Apparence : la même que les champs existants (bordure fine, fond "verre",
// bordure aurora au focus) pour ne rien changer visuellement en migrant —
// la refonte visuelle des formulaires vient dans un lot ultérieur.
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

export const FIELD_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-aurora-400/60 disabled:cursor-not-allowed disabled:opacity-60";

const FIELD_ERROR_CLASS = "border-red-400/60 focus:border-red-400";

interface FieldChromeProps {
  /** Libellé affiché au-dessus du champ (recommandé). */
  label?: ReactNode;
  /** Petit texte d'aide sous le champ. */
  hint?: ReactNode;
  /** Message d'erreur : affiché sous le champ et annoncé au lecteur d'écran. */
  error?: ReactNode;
  /** Élément aligné à droite du libellé (ex : lien « Mot de passe oublié ? »). */
  labelAside?: ReactNode;
  /** Classes du conteneur (libellé + champ + aide). */
  wrapperClassName?: string;
}

function FieldChrome({
  id,
  label,
  hint,
  error,
  labelAside,
  wrapperClassName,
  children
}: FieldChromeProps & { id: string; children: ReactNode }) {
  return (
    <div className={clsx("min-w-0", wrapperClassName)}>
      {(label || labelAside) && (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          {label ? (
            <label htmlFor={id} className="block text-xs font-medium text-slate-400">
              {label}
            </label>
          ) : (
            <span />
          )}
          {labelAside}
        </div>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hasError: boolean, hasHint: boolean): string | undefined {
  if (hasError) return `${id}-error`;
  if (hasHint) return `${id}-hint`;
  return undefined;
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> &
  FieldChromeProps & {
    /** Icône ou bouton affiché à droite dans le champ (ex : œil « voir le mot de passe »). */
    trailing?: ReactNode;
  };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, hint, error, labelAside, wrapperClassName, trailing, className, ...props },
  ref
) {
  const generated = useId();
  const fieldId = id ?? `field-${generated}`;
  return (
    <FieldChrome id={fieldId} label={label} hint={hint} error={error} labelAside={labelAside} wrapperClassName={wrapperClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, Boolean(error), Boolean(hint))}
          className={clsx(FIELD_CLASS, Boolean(error) && FIELD_ERROR_CLASS, Boolean(trailing) && "pr-11", className)}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
      </div>
    </FieldChrome>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldChromeProps;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { id, label, hint, error, labelAside, wrapperClassName, className, ...props },
  ref
) {
  const generated = useId();
  const fieldId = id ?? `field-${generated}`;
  return (
    <FieldChrome id={fieldId} label={label} hint={hint} error={error} labelAside={labelAside} wrapperClassName={wrapperClassName}>
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, Boolean(error), Boolean(hint))}
        className={clsx(FIELD_CLASS, "min-h-[96px] resize-y", Boolean(error) && FIELD_ERROR_CLASS, className)}
        {...props}
      />
    </FieldChrome>
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldChromeProps;

// Select natif (le menu déroulant du système, fiable au clavier et sur
// mobile) habillé comme les autres champs, avec un chevron dessiné en CSS.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id, label, hint, error, labelAside, wrapperClassName, className, children, ...props },
  ref
) {
  const generated = useId();
  const fieldId = id ?? `field-${generated}`;
  return (
    <FieldChrome id={fieldId} label={label} hint={hint} error={error} labelAside={labelAside} wrapperClassName={wrapperClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, Boolean(error), Boolean(hint))}
          className={clsx(FIELD_CLASS, "appearance-none pr-9 [&>option]:bg-void-950 [&>option]:text-white", Boolean(error) && FIELD_ERROR_CLASS, className)}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </div>
    </FieldChrome>
  );
});
