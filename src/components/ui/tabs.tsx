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
}

export function Tabs<T extends string>({ items, value, onChange, variant = "segmented", className, ...aria }: TabsProps<T>) {
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
        isLine ? "border-b border-white/[0.06]" : "rounded-xl border border-white/10 bg-white/[0.03] p-1",
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
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
              isLine
                ? clsx(
                    "-mb-px border-b-2 px-3 py-2.5",
                    active ? "border-aurora-400 text-white" : "border-transparent text-slate-400 hover:text-white"
                  )
                : clsx(
                    "rounded-lg px-3 py-1.5",
                    active ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:bg-white/5 hover:text-white"
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
