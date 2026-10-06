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
//
// Correctif du 03/10/2026 (« le gros bloc gris ») : chaque barre remplissait
// toute la largeur de sa semaine (≈ 120 px) : la semaine la plus chargée
// devenait un grand rectangle gris, et une semaine vide gardait 20 % de
// hauteur, comme si elle avait des publications. Désormais :
//  - des colonnes fines (24 px au plus), arrondies en haut, posées sur une
//    même ligne de base ;
//  - une semaine vide n'est qu'un trait au ras de la ligne de base ;
//  - le mois affiché est une plage teintée derrière ses semaines (même vides),
//    ses colonnes en violet, les autres en gris neutre ;
//  - un point repère la semaine en cours.

import { m as motion } from "framer-motion";
import { useMemo } from "react";
import { clsx } from "@/lib/clsx";
import { MotionRoot } from "@/components/motion/motion-root";

const MONTH_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** Hauteur utile des colonnes (px), sous le repère de lecture. */
const BAR_MAX_PX = 30;
/** Une semaine avec au moins une publication reste visible. */
const BAR_MIN_PX = 4;

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

/** Hauteur d'une colonne (px) : 0 pour une semaine vide, proportionnelle sinon. */
export function weekBarHeight(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  return Math.max(BAR_MIN_PX, Math.round((count / maxCount) * BAR_MAX_PX));
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
  const currentMonday = mondayOf(new Date()).getTime();

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
  const activeFlags = weeks.map((w) => (mode === "week" ? w.monday.getTime() === activeMonday : sameMonth(w.month, activeDate)));

  return (
    <MotionRoot>
      <div className="glass-panel rounded-xl px-3 pb-1.5 pt-2.5">
        <div className="flex items-end">
          {weeks.map((w, i) => {
            const isActive = activeFlags[i];
            const isCurrent = w.monday.getTime() === currentMonday;
            const height = weekBarHeight(w.count, maxCount);
            const label = `Semaine du ${w.monday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}${isCurrent ? " (cette semaine)" : ""}, ${w.count} publication${w.count === 1 ? "" : "s"}`;
            return (
              <button
                key={w.monday.toISOString()}
                type="button"
                onClick={() => onSelectWeek(w.monday)}
                title={label}
                aria-label={label}
                aria-pressed={isActive}
                className={clsx(
                  "group relative flex h-10 flex-1 items-end justify-center transition-colors",
                  // Plage du mois (ou de la semaine) affiché : teintée d'un bout à l'autre.
                  isActive ? "bg-aurora-400/[0.10]" : "hover:bg-slate-500/[0.08]",
                  isActive && !activeFlags[i - 1] && "rounded-l-md",
                  isActive && !activeFlags[i + 1] && "rounded-r-md",
                  !isActive && "rounded-md"
                )}
              >
                {height > 0 ? (
                  <span
                    data-week-bar
                    className={clsx(
                      "block w-full max-w-[24px] rounded-t-[4px] transition-colors",
                      isActive ? "bg-aurora-400" : "bg-slate-500 group-hover:bg-slate-400"
                    )}
                    style={{ height }}
                  />
                ) : (
                  // Semaine vide : un simple trait sur la ligne de base.
                  <span data-week-bar className={clsx("block h-0.5 w-full max-w-[24px] rounded-full", isActive ? "bg-aurora-400/50" : "bg-slate-500/30")} />
                )}
                {isCurrent && (
                  <span aria-hidden="true" className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-aurora-300" />
                )}
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
        <div className="relative mt-1.5 h-5">
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
    </MotionRoot>
  );
}
