"use client";

// Widget "Scrubber temporel" — une bande horizontale façon timeline de
// montage vidéo, avec une semaine = un segment. La hauteur de chaque segment
// reflète le nombre RÉEL de publications cette semaine-là, et on peut
// cliquer sur un segment pour sauter à cette semaine, ou sur un nom de mois
// pour afficher ce mois.
//
// Correctif du 24/09/2026 (« le sélecteur de mois est déréglé ») : avant,
// cliquer une semaine ouvrait le mois de son LUNDI (la semaine du lundi
// 29 septembre ouvrait septembre alors qu'elle est presque toute en
// octobre), puis la surbrillance sautait sur la semaine du 1er du mois, pas
// sur celle cliquée. Désormais :
//  - une semaine appartient au mois de son jeudi (règle ISO : le mois qui
//    contient la majorité de ses jours) ;
//  - en vue Mois, toutes les semaines du mois affiché sont surlignées ;
//  - les noms de mois sous la bande sont cliquables.

import { motion } from "framer-motion";
import { useMemo } from "react";
import { clsx } from "@/lib/clsx";

const MONTH_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function mondayOf(d: Date): Date {
  const date = new Date(d);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Mois « propriétaire » d'une semaine : celui de son jeudi. */
export function monthOfWeek(monday: Date): Date {
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  return new Date(thursday.getFullYear(), thursday.getMonth(), 1);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function WeekScrubber({
  entryCountByDay,
  mode,
  activeDate,
  onSelectWeek,
  onSelectMonth
}: {
  entryCountByDay: Map<string, number>;
  /** "month" : vue Mois ou Liste (activeDate = 1er du mois affiché) ;
   *  "week" : vue Heures (activeDate = jour affiché). */
  mode: "month" | "week";
  activeDate: Date;
  onSelectWeek: (monday: Date) => void;
  onSelectMonth: (firstOfMonth: Date) => void;
}) {
  const activeMonday = mondayOf(activeDate).getTime();

  const weeks = useMemo(() => {
    const start = mondayOf(new Date());
    start.setDate(start.getDate() - 7 * 6); // 6 semaines dans le passé
    return Array.from({ length: 14 }, (_, i) => {
      const monday = new Date(start);
      monday.setDate(monday.getDate() + i * 7);
      let count = 0;
      for (let d = 0; d < 7; d++) {
        const day = new Date(monday);
        day.setDate(day.getDate() + d);
        const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        count += entryCountByDay.get(key) ?? 0;
      }
      return { monday, month: monthOfWeek(monday), count };
    });
  }, [entryCountByDay]);

  // Repères de mois : première semaine de chaque mois dans la bande.
  const monthMarks = useMemo(() => {
    const marks: { index: number; month: Date }[] = [];
    weeks.forEach((w, i) => {
      if (i === 0 || !sameMonth(w.month, weeks[i - 1].month)) marks.push({ index: i, month: w.month });
    });
    return marks;
  }, [weeks]);

  const maxCount = Math.max(1, ...weeks.map((w) => w.count));

  return (
    <div className="glass-panel rounded-xl px-3 pb-1.5 pt-2.5">
      <div className="flex items-end gap-1">
        {weeks.map((w) => {
          const isActive = mode === "week" ? w.monday.getTime() === activeMonday : sameMonth(w.month, activeDate);
          const heightPct = 20 + (w.count / maxCount) * 80;
          return (
            <button
              key={w.monday.toISOString()}
              type="button"
              onClick={() => onSelectWeek(w.monday)}
              title={`Semaine du ${w.monday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — ${w.count} publication${w.count === 1 ? "" : "s"}`}
              aria-label={`Semaine du ${w.monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}, ${w.count} publication${w.count === 1 ? "" : "s"}`}
              aria-pressed={isActive}
              className="group relative flex h-10 flex-1 items-end"
            >
              <div
                className={clsx(
                  "w-full rounded-sm transition-all",
                  isActive ? "bg-aurora-400" : w.count > 0 ? "bg-white/25 group-hover:bg-white/40" : "bg-white/[0.06] group-hover:bg-white/15"
                )}
                style={{ height: `${heightPct}%` }}
              />
              {mode === "week" && isActive && (
                <motion.div
                  layoutId="week-scrubber-playhead"
                  className="absolute -top-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-aurora-300"
                  style={{ boxShadow: "0 0 6px rgb(var(--c-aurora-400))" }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
      {/* Noms de mois, alignés sur leur première semaine — cliquables. */}
      <div className="relative mt-1 h-5">
        {monthMarks.map((m) => {
          const active = mode === "month" && sameMonth(m.month, activeDate);
          return (
            <button
              key={m.month.toISOString()}
              type="button"
              onClick={() => onSelectMonth(m.month)}
              className={clsx(
                "absolute top-0 rounded px-1 text-[11px] leading-5 transition",
                active ? "font-semibold text-aurora-300" : "text-slate-500 hover:text-white"
              )}
              style={{ left: `${(m.index / weeks.length) * 100}%` }}
              aria-label={`Afficher ${m.month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`}
            >
              {MONTH_SHORT[m.month.getMonth()]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
