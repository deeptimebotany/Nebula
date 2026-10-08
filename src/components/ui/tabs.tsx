"use client";

// Onglets / contrôle segmenté partagé, accessible (role="tablist", flèches
// gauche/droite, Début/Fin), pour remplacer les trois implémentations
// divergentes qui existaient (Analytics, Communauté, sélecteur de vue du
// Calendrier).
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { clsx } from "@/lib/clsx";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Petit compteur ou pastille à droite du libellé. */
  badge?: ReactNode;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nom accessible de la liste d'onglets. */
  "aria-label": string;
  /** "segmented" : bloc compact (filtres) ; "line" : onglets soulignés (sections de page). */
  variant?: "segmented" | "line";
  className?: string;
  /**
   * Préfixe d'identifiants (lot U3) : chaque onglet reçoit l'id
   * `{prefix}-tab-{valeur}` et pointe (aria-controls) vers le panneau
   * `{prefix}-panel-{valeur}` — voir TabPanel.
   */
  idPrefix?: string;
}

export function Tabs<T extends string>({ items, value, onChange, variant = "segmented", className, idPrefix, ...aria }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.filter((i) => !i.disabled);
    const index = enabled.findIndex((i) => i.value === value);
    if (index === -1) return;
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    else return;
    e.preventDefault();
    onChange(enabled[next].value);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])');
    buttons?.[next]?.focus();
  }

  const isLine = variant === "line";

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      className={clsx(
        "flex items-center gap-1 overflow-x-auto",
        // V2 (07/10/2026) : trait fin, sans fond gris.
        isLine ? "border-b border-[color:var(--nb-sep)]" : "rounded-lg border border-[color:var(--nb-sep-strong)] p-0.5",
        className
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${item.value}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${item.value}` : undefined}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
              isLine
                ? clsx(
                    "-mb-px border-b-2 px-3 py-2.5",
                    active ? "border-current font-semibold text-white" : "border-transparent text-slate-400 hover:text-white"
                  )
                : clsx(
                    "rounded-md px-3 py-1.5",
                    active ? "bg-[color:var(--nb-active)] text-white" : "text-slate-400 hover:bg-[color:var(--nb-hover)] hover:text-white"
                  )
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

/** Panneau d'un onglet (à utiliser avec `Tabs idPrefix`). Seul le panneau actif est rendu. */
export function TabPanel({ idPrefix, value, active, children, className }: { idPrefix: string; value: string; active: boolean; children: ReactNode; className?: string }) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${value}`} aria-labelledby={`${idPrefix}-tab-${value}`} tabIndex={0} className={clsx("outline-none", className)}>
      {children}
    </div>
  );
}
