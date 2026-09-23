"use client";

// Widget inédit "Momentum" — au lieu d'un simple compteur, la régularité de
// publication est représentée comme une traînée de comète qui s'allonge et
// s'illumine avec le nombre de semaines consécutives où au moins une
// publication réelle est partie. Gamification discrète, cohérente avec
// l'identité "cockpit spatial" de Nebula, et strictement basée sur les
// vraies publications déjà publiées (jamais une valeur inventée).

import { motion } from "framer-motion";

interface PublishedPost {
  status: string;
  scheduledAt: string | null;
  createdAt: string;
}

function isoWeekKey(d: Date): string {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // Décale au jeudi de la semaine ISO courante pour un calcul d'année ISO fiable.
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${week}`;
}

/** Nombre de semaines consécutives (jusqu'à cette semaine incluse) avec au
 * moins une publication réellement partie — calculé depuis les vraies
 * publications, jamais une estimation. */
export function computeStreak(posts: PublishedPost[]): number {
  const published = posts.filter((p) => p.status === "PUBLISHED");
  const weeks = new Set(published.map((p) => isoWeekKey(new Date(p.scheduledAt ?? p.createdAt))));

  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 104; i++) {
    if (weeks.has(isoWeekKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 7);
    } else if (i === 0) {
      // La semaine en cours peut ne pas avoir encore de publication sans
      // casser la traînée — on tente simplement la semaine précédente.
      cursor.setDate(cursor.getDate() - 7);
      if (weeks.has(isoWeekKey(cursor))) continue;
      break;
    } else {
      break;
    }
  }
  return streak;
}

export function MomentumComet({ streak }: { streak: number }) {
  const dots = Math.min(streak, 8);

  return (
    <div>
      <div className="flex h-10 items-center gap-1.5">
        {streak === 0 ? (
          <p className="text-xs text-slate-500">Aucune traînée pour l&apos;instant — publiez cette semaine pour l&apos;amorcer.</p>
        ) : (
          <>
            {Array.from({ length: dots }, (_, i) => (
              <motion.span
                key={i}
                className="momentum-trail h-1.5 rounded-full bg-gradient-to-r from-transparent via-aurora-300 to-white"
                style={{ width: 6 + i * 3, opacity: 0.35 + (i / dots) * 0.65 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
              />
            ))}
            <motion.span
              // Tête de la comète : blanche et lumineuse en sombre, couleur du
              // thème en mode clair (voir .momentum-head dans globals.css).
              className="momentum-head h-2.5 w-2.5 shrink-0 rounded-full"
              animate={{ scale: [1, 1.25, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-300">
        {streak === 0 ? (
          "Votre régularité de publication apparaîtra ici, semaine après semaine."
        ) : (
          <>
            <span className="font-display text-lg text-white">{streak}</span> semaine{streak > 1 ? "s" : ""} de suite avec au moins une publication réelle.
          </>
        )}
      </p>
    </div>
  );
}
