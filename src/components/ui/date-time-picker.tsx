"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/clsx";
import { IconCalendar, IconChevron } from "@/components/dashboard/icons";
import { utcToLocalInput } from "@/lib/timezone";

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

const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** Délai minimal avant le premier créneau proposé (le temps de valider). */
const MIN_LEAD_MINUTES = 2;

/** « Maintenant », en heure murale du fuseau voulu (ou de l'appareil). */
export function nowWallClock(timeZone?: string): string {
  return timeZone ? utcToLocalInput(new Date(), timeZone) : toValue(new Date());
}

/** Premier créneau de 5 minutes à venir (au moins MIN_LEAD_MINUTES après « maintenant »). */
export function firstAvailableSlot(timeZone?: string): string {
  const d = parseValue(nowWallClock(timeZone));
  d.setMinutes(d.getMinutes() + MIN_LEAD_MINUTES);
  const rest = d.getMinutes() % 5;
  if (rest || d.getSeconds()) d.setMinutes(d.getMinutes() + (5 - rest), 0, 0);
  return toValue(d);
}

/** true si cette valeur « YYYY-MM-DDTHH:mm » est déjà passée (même fuseau). */
export function isPastWallClock(value: string, timeZone?: string): boolean {
  return Boolean(value) && value <= nowWallClock(timeZone);
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
export function DateTimePicker({
  value,
  onChange,
  timeZone
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fuseau des heures saisies (celui de la marque) : sert à savoir quelle
   *  heure il est « maintenant » pour griser le passé. Absent : l'appareil. */
  timeZone?: string;
}) {
  const selected = useMemo(() => parseValue(value), [value]);
  // Plus tôt créneau autorisé (« YYYY-MM-DDTHH:mm »), recalculé toutes les
  // 30 s : un horaire devient grisé dès qu'il est dépassé, même panneau
  // ouvert. Tout ce qui est avant est grisé et non sélectionnable.
  const [minValue, setMinValue] = useState(() => firstAvailableSlot(timeZone));
  useEffect(() => {
    setMinValue(firstAvailableSlot(timeZone));
    const id = window.setInterval(() => setMinValue(firstAvailableSlot(timeZone)), 30_000);
    return () => window.clearInterval(id);
  }, [timeZone]);
  const minDay = minValue.slice(0, 10);
  const minHour = Number(minValue.slice(11, 13));
  const minMinute = Number(minValue.slice(14, 16));
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

  const todayKey = nowWallClock(timeZone).slice(0, 10);
  const selectedKey = value ? dayKey(selected) : null;
  const valueIsPast = Boolean(value) && value < minValue;

  // Toute valeur produite passe par ici : si elle tombe dans le passé, on la
  // recale sur le premier créneau disponible (jamais de date dépassée).
  function commit(next: Date) {
    let v = toValue(next);
    if (v < minValue) v = minValue;
    const d = parseValue(v);
    setHour(d.getHours());
    setMinute(d.getMinutes());
    onChange(v);
  }

  function pickDay(d: Date) {
    const next = new Date(d);
    next.setHours(hour, minute, 0, 0);
    commit(next);
  }

  function applyTime(h: number, m: number) {
    const next = new Date(selectedKey ? selected : parseValue(minValue));
    next.setHours(h, m, 0, 0);
    commit(next);
  }

  // Ouverture sur une valeur vide ou dépassée : on se place directement sur
  // le premier créneau disponible.
  useEffect(() => {
    if (!open) return;
    if (!value || value < minValue) commit(parseValue(minValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, minValue]);

  const onMinDay = selectedKey === minDay;
  const hourDisabled = (h: number) => onMinDay && h < minHour;
  const minuteDisabled = (m: number) => onMinDay && (hour < minHour || (hour === minHour && m < minMinute));

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
        <span className={clsx(!value && "text-slate-500", valueIsPast && "text-red-300")}>{label}</span>
      </button>
      {valueIsPast && (
        <p className="mt-1.5 text-xs text-red-300" role="alert">
          Cet horaire est déjà passé : choisissez une date et une heure à venir.
        </p>
      )}

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
                const key = dayKey(d);
                const isToday = key === todayKey;
                const isSelected = selectedKey && key === selectedKey;
                // Jours sans aucun créneau à venir (avant le premier créneau
                // disponible) : grisés et non cliquables. Aujourd'hui reste
                // sélectionnable tant qu'il lui reste des horaires.
                const isPast = key < minDay;
                return (
                  <button
                    type="button"
                    key={d.toISOString()}
                    onClick={() => !isPast && pickDay(d)}
                    disabled={isPast}
                    className={clsx(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs transition",
                      !inMonth && "text-slate-700",
                      inMonth && !isSelected && !isPast && "text-slate-300 hover:bg-white/5",
                      isPast && "cursor-not-allowed text-slate-700 opacity-40",
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
                style={{ colorScheme: "dark" }}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-sm text-white outline-none focus:border-aurora-400/60"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h} disabled={hourDisabled(h)} className="bg-void-900 text-white disabled:text-slate-600">{pad(h)}</option>
                ))}
              </select>
              <span className="text-slate-500">:</span>
              <select
                value={minute}
                onChange={(e) => applyTime(hour, Number(e.target.value))}
                style={{ colorScheme: "dark" }}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-sm text-white outline-none focus:border-aurora-400/60"
              >
                {MINUTE_STEPS.map((m) => (
                  <option key={m} value={m} disabled={minuteDisabled(m)} className="bg-void-900 text-white disabled:text-slate-600">{pad(m)}</option>
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
            <p className="mt-2 text-[11px] text-slate-500">Les dates et heures déjà passées sont grisées.</p>
          </div>,
          document.body
        )}
    </div>
  );
}
