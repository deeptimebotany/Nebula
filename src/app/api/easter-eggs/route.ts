import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EASTER_EGGS } from "@/lib/easter-eggs-registry";
import { markEasterEggFound } from "@/lib/easter-eggs/server";

export const dynamic = "force-dynamic";

// GET /api/easter-eggs — l'état complet des easter eggs pour le compte
// connecté : utilisé par la page /succes (onglet "Succès") et par le petit
// compteur affiché dans la Communauté. Le titre/indice n'est renvoyé QUE pour
// les eggs déjà trouvés — les autres ne remontent que leur numéro, pour ne
// rien dévoiler côté réseau (voir l'onglet Succès, qui les affiche en "?").
// Exception : le NOM de la récompense (`reward`) est lui renvoyé même pour
// un egg pas encore trouvé — c'est ce qui permet à /succes d'afficher
// "🎁 Récompense à la clé : ..." sans dévoiler comment l'obtenir.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({
      total: EASTER_EGGS.length,
      foundCount: 0,
      eggs: EASTER_EGGS.map((e) => ({ number: e.number, found: false, reward: e.reward }))
    });
  }

  const userId = (session.user as { id: string }).id;

  // Easter eggs "Premier anniversaire personnel", "Fidélité rétro" et
  // "Toujours à l'heure" : tous les trois vérifiés ICI plutôt que sur une
  // tâche planifiée — cette route est déjà appelée à chaque visite de
  // /succes ou de la Communauté (voir eggCount côté client), ce qui couvre
  // la grande majorité des sessions actives sans plomberie supplémentaire.
  // Compromis documenté : un compte qui ne visite ni l'une ni l'autre un
  // jour donné ne fait pas progresser ces compteurs ce jour-là.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, lastLoginDate: true, loginStreakDays: true, lastLoginHour: true, sameHourLoginStreak: true }
  });
  if (me) {
    const now = new Date();
    const created = me.createdAt as Date;
    if (now.getMonth() === created.getMonth() && now.getDate() === created.getDate() && now.getFullYear() > created.getFullYear()) {
      await markEasterEggFound(userId, "account-anniversary");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastLoginDate = me.lastLoginDate as Date | null;
    const lastDay = lastLoginDate ? new Date(lastLoginDate) : null;
    if (lastDay) lastDay.setHours(0, 0, 0, 0);

    // Seule la PREMIÈRE visite de la journée fait progresser ces deux
    // compteurs — sinon revisiter /succes 10 fois le même jour compterait
    // 10 jours d'un coup.
    if (!lastDay || lastDay.getTime() !== today.getTime()) {
      const isNextConsecutiveDay = lastDay !== null && today.getTime() - lastDay.getTime() === 24 * 60 * 60 * 1000;

      // "Fidélité rétro" (#47) : jours consécutifs avec au moins une visite.
      const nextStreakDays = isNextConsecutiveDay ? (me.loginStreakDays ?? 0) + 1 : 1;

      // "Toujours à l'heure" (#48) : connexions à peu près à la même heure
      // (± 1h, heure entière) sur des jours consécutifs.
      const nowHour = now.getHours();
      const sameHourAsLast =
        isNextConsecutiveDay && me.lastLoginHour !== null && Math.abs(nowHour - me.lastLoginHour) <= 1;
      const nextSameHourStreak = sameHourAsLast ? (me.sameHourLoginStreak ?? 0) + 1 : 1;

      await prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginDate: today,
          loginStreakDays: nextStreakDays,
          lastLoginHour: nowHour,
          sameHourLoginStreak: nextSameHourStreak
        }
      });

      if (nextStreakDays === 30) {
        await markEasterEggFound(userId, "retro-icon-unlock");
      }
      if (nextSameHourStreak === 3) {
        await markEasterEggFound(userId, "greeting-unlock");
      }
    }
  }

  // Types explicites : le client Prisma généré dans ce sandbox n'a pas accès
  // au réseau (voir schema.prisma), donc `findMany` ne renvoie pas de type
  // concret ici — sans cette annotation, `f` et `foundAt` tombent sur `{}`.
  const found: { key: string; foundAt: Date }[] = await prisma.easterEggFound.findMany({
    where: { userId },
    select: { key: true, foundAt: true }
  });
  const foundByKey = new Map<string, Date>(found.map((f) => [f.key, f.foundAt]));

  const eggs = EASTER_EGGS.map((e) => {
    const foundAt = foundByKey.get(e.key);
    if (!foundAt) return { number: e.number, found: false, reward: e.reward };
    return {
      number: e.number,
      found: true,
      key: e.key,
      emoji: e.emoji,
      title: e.title,
      hint: e.hint,
      reward: e.reward,
      foundAt: foundAt.toISOString()
    };
  });

  return NextResponse.json({ total: EASTER_EGGS.length, foundCount: found.length, eggs });
}
