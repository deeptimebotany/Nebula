// Rappels des missions de la semaine (Réussites v2, 26/09/2026), lancés par
// le cron (/api/cron et le worker) — dans la cloche, jamais par e-mail :
//  - lundi à partir de 9 h (heure de Paris) : « Vos 3 missions sont
//    prêtes », aux comptes actifs (une publication en ligne ces 4 dernières
//    semaines, ou des missions la semaine précédente) ;
//  - dimanche à partir de 18 h : « Plus qu'une mission pour ouvrir votre
//    coffre », seulement à 2 missions sur 3.
// Une seule fois par compte et par semaine (clé de déduplication), au plus
// 200 comptes par passage : le cron passe chaque minute, la fenêtre dure 3 h.
import { prisma } from "@/lib/prisma";
import { challengeCompletionDb, weeklyMissionsDb } from "@/lib/prisma-extra";
import { notifyOnce } from "@/lib/notifications";
import { utcToWallClock } from "@/lib/timezone";
import { REUSSITES_TZ, weekOf } from "./periods";

const BATCH = 200;
const DAY = 86_400_000;

/** Jour de la semaine (lundi = 1 … dimanche = 7) et heure, à Paris. */
export function parisWeekdayHour(now: Date): { weekday: number; hour: number } {
  const w = utcToWallClock(now, REUSSITES_TZ);
  const day = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return { weekday: day === 0 ? 7 : day, hour: w.hour };
}

export async function runReussitesNudges(now: Date = new Date()): Promise<{ ready: number; lastCall: number }> {
  const { weekday, hour } = parisWeekdayHour(now);
  const week = weekOf(now);
  let ready = 0;
  let lastCall = 0;

  if (weekday === 1 && hour >= 9 && hour < 12) {
    const previous = weekOf(new Date(week.start.getTime() - DAY)).id;
    const dedupeKey = `missions-ready:${week.id}`;
    const users = (await prisma.user.findMany({
      where: {
        OR: [
          { weeklyMissions: { some: { week: previous } } },
          { posts: { some: { targets: { some: { status: "PUBLISHED", publishedAt: { gte: new Date(now.getTime() - 28 * DAY) } } } } } }
        ],
        notifications: { none: { dedupeKey } }
      },
      select: { id: true },
      take: BATCH
    })) as { id: string }[];
    for (const u of users) {
      await notifyOnce(u.id, {
        kind: "achievement",
        title: "Vos 3 missions de la semaine sont prêtes",
        body: "Une habitude réglée sur votre rythme, une progression à choisir, et une mission mystère. Un coffre à la clé.",
        href: "/reussites?focus=missions",
        actionLabel: "Voir mes missions",
        dedupeKey
      });
      ready++;
    }
  }

  if (weekday === 7 && hour >= 18 && hour < 21) {
    const dedupeKey = `missions-last:${week.id}`;
    const rows = await weeklyMissionsDb.findMany({ where: { week: week.id, chestOpenedAt: null }, select: { userId: true }, take: 2000 });
    for (const r of rows) {
      if (lastCall >= BATCH) break;
      const done = await challengeCompletionDb.count({ where: { userId: r.userId, period: week.id, kind: "MISSION" } });
      if (done !== 2) continue;
      const already = await prisma.notification.count({ where: { userId: r.userId, dedupeKey } });
      if (already) continue;
      await notifyOnce(r.userId, {
        kind: "achievement",
        title: "Plus qu'une mission pour ouvrir votre coffre",
        body: "Il reste quelques heures cette semaine : une dernière mission, et le coffre est à vous (il n'expire jamais).",
        href: "/reussites?focus=missions",
        actionLabel: "Voir la mission",
        dedupeKey
      });
      lastCall++;
    }
  }
  return { ready, lastCall };
}
