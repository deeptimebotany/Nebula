"use client";

// Widget inédit "Scrubber temporel" — une bande horizontale façon timeline
// de montage vidéo, avec une semaine = un segment. La hauteur/luminosité de
// chaque segment reflète le nombre RÉEL de publications cette semaine-là
// (mini-repère de densité, comme une forme d'onde), et on peut cliquer
// n'importe où sur la bande pour sauter directement à cette semaine —
// beaucoup plus rapide que d'avancer mois par mois avec les flèches ◀ ▶
// quand on planifie loin dans le temps.

import { motion } from "framer-motion";
import { useMemo } from "react";

function mondayOf(d: Date): Date {
  const date = new Date(d);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function WeekScrubber({
  entryCountByDay,
  activeDate,
  onSelectWeek
}: {
  entryCountByDay: Map<string, number>;
  activeDate: Date;
  onSelectWeek: (monday: Date) => void;
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
      return { monday, count };
    });
  }, [entryCountByDay]);

  const maxCount = Math.max(1, ...weeks.map((w) => w.count));

  return (
    <div className="glass-panel flex items-end gap-1 rounded-xl px-3 py-2.5">
      {weeks.map((w) => {
        const isActive = w.monday.getTime() === activeMonday;
        const heightPct = 20 + (w.count / maxCount) * 80;
        return (
          <button
            key={w.monday.toISOString()}
            onClick={() => onSelectWeek(w.monday)}
            title={`Semaine du ${w.monday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — ${w.count} publication${w.count === 1 ? "" : "s"}`}
            className="group relative flex h-10 flex-1 items-end"
          >
            <div
              className={`w-full rounded-sm transition-all ${isActive ? "bg-aurora-400" : w.count > 0 ? "bg-white/25 group-hover:bg-white/40" : "bg-white/[0.06]"}`}
              style={{ height: `${heightPct}%` }}
            />
            {isActive && (
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
  );
}
