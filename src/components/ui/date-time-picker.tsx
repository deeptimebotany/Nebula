"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/clsx";
import { IconCalendar, IconChevron } from "@/components/dashboard/icons";

const WEEKDAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const PANEL_WIDTH = 300;
const PANEL_MAX_HEIGHT = 420;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseValue(value: string): Date {
  if (!value) {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  }
  const [datePart, timePart] = value.split("T");
  const [y, m, day] = datePart.split("-").map(Number);
  const [h, min] = (timePart ?? "00:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, day || 1, h || 0, min || 0);
}

/**
 * Sélecteur date + heure "maison" : remplace l'input <input type="datetime-local">
 * natif du navigateur (peu lisible, très différent d'un OS à l'autre) par une
 * vraie grille mensuelle avec flèches, cohérente avec le reste de Nebula.
 *
 * Le panneau ouvert est rendu via un portail (createPortal) directement dans
 * <body>, en position "fixed" calculée depuis le bouton — plutôt qu'en
 * position "absolute" dans le flux normal. Sans ça, le panneau se faisait
 * couper net par le conteneur scrollable de la page (<main overflow-y-auto>
 * dans le layout du tableau de bord) dès qu'il n'y avait pas assez de place
 * en dessous : on ne le voyait jamais entièrement. Le portail garantit qu'il
 * s'affiche toujours par-dessus tout, avec un repli automatique vers le haut
 * si la place manque en bas de l'écran.
 */
export function DateTimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = useMemo(() => parseValue(value), [value]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const [hour, setHour] = useState(selected.getHours());
  const [minute, setMinute] = useState(selected.getMinutes());
  const [pos, setPos] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function computePosition() {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow;
    const left = Math.min(Math.max(rect.left, 8), window.innerWidth - PANEL_WIDTH - 8);
    const top = openUpward ? Math.max(rect.top - 6, 8) : rect.bottom + 6;
    setPos({ top, left, openUpward });
  }

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onScrollOrResize() {
      computePosition();
    }
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  const grid = useMemo(() => {
    const first = new Date(cursor);
    const startOffset = (first.getDay() + 6) % 7; // lundi = 0
    const start = new Date(first);
    start.setDate(first.getDate() - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const todayKey = new Date().toDateString();
  const selectedKey = value ? selected.toDateString() : null;

  function pickDay(d: Date) {
    const next = new Date(d);
    next.setHours(hour, minute, 0, 0);
    onChange(toValue(next));
  }

  function applyTime(h: number, m: number) {
    setHour(h);
    setMinute(m);
    const next = new Date(selectedKey ? selected : new Date());
    next.setHours(h, m, 0, 0);
    onChange(toValue(next));
  }

  const label = value
    ? `${pad(selected.getDate())}/${pad(selected.getMonth() + 1)}/${selected.getFullYear()} à ${pad(selected.getHours())}:${pad(selected.getMinutes())}`
    : "Choisir une date et une heure";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-sm text-white outline-none transition focus:border-aurora-400/60"
      >
        <IconCalendar className="h-4 w-4 shrink-0 text-slate-400" />
        <span className={clsx(!value && "text-slate-500")}>{label}</span>
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className="glass-panel-solid fixed z-[100] overflow-y-auto rounded-xl p-3"
            style={{
              top: pos.openUpward ? undefined : pos.top,
              bottom: pos.openUpward ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              width: PANEL_WIDTH,
              maxHeight: PANEL_MAX_HEIGHT
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-white">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white"
                >
                  <IconChevron className="h-3.5 w-3.5 rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white"
                >
                  <IconChevron className="h-3.5 w-3.5 -rotate-90" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-1 text-[10px] font-medium text-slate-500">
                  {d}
                </span>
              ))}
              {grid.map((d) => {
                const inMonth = d.getMonth() === cursor.getMonth();
                const isToday = d.toDateString() === todayKey;
                const isSelected = selectedKey && d.toDateString() === selectedKey;
                return (
                  <button
                    type="button"
                    key={d.toISOString()}
                    onClick={() => pickDay(d)}
                    className={clsx(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs transition",
                      !inMonth && "text-slate-600",
                      inMonth && !isSelected && "text-slate-300 hover:bg-white/5",
                      isToday && !isSelected && "today-glow ring-1 ring-aurora-400/50 text-aurora-300",
                      isSelected && "bg-nebula-500 text-white"
                    )}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
              <span className="text-xs text-slate-400">Heure</span>
              <select
                value={hour}
                onChange={(e) => applyTime(Number(e.target.value), minute)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-sm text-white outline-none focus:border-aurora-400/60"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{pad(h)}</option>
                ))}
              </select>
              <span className="text-slate-500">:</span>
              <select
                value={minute}
                onChange={(e) => applyTime(hour, Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-sm text-white outline-none focus:border-aurora-400/60"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <option key={m} value={m}>{pad(m)}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto rounded-lg bg-gradient-to-r from-nebula-500 to-accent-cyan px-3 py-1.5 text-xs font-medium text-white"
              >
                OK
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
