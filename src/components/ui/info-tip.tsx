"use client";

// Petite bulle d'aide « i » : le texte s'affiche au survol, au focus clavier
// et au toucher (clic sur mobile, qui n'a pas de survol). Utilisée dans le
// Composer pour expliquer les options par réseau (« Contenu généré par
// l'IA », « Notifier les abonnés »…).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { clsx } from "@/lib/clsx";

export function InfoTip({ children, label = "En savoir plus", className, align = "left" }: { children: ReactNode; label?: string; className?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={clsx("relative inline-flex", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] font-semibold leading-none text-slate-400 transition hover:border-aurora-400/60 hover:text-white focus-visible:border-aurora-400/60 focus-visible:text-white focus-visible:outline-none"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={clsx(
            "glass-panel-solid absolute top-[calc(100%+6px)] z-30 w-64 rounded-lg px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-slate-300 shadow-xl",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {children}
        </span>
      )}
    </span>
  );
}
