import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EASTER_EGGS } from "@/lib/easter-eggs-registry";
import { markEasterEggFound } from "@/lib/easter-eggs/server";
import { checkAudienceMilestones } from "@/lib/easter-eggs/audience";
import { isOwnerEmail } from "@/lib/dev-preview";

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
      isOwner: false,
      eggs: EASTER_EGGS.map((e) => ({ number: e.number, found: false, reward: e.secret ? undefined : e.reward }))
    });
  }

  const userId = (session.user as { id: string }).id;

  // Easter egg "Toujours à l'heure" : vérifié ICI plutôt que sur une tâche
  // planifiée — cette route est déjà appelée à chaque visite de /succes ou
  // de la Communauté (voir eggCount côté client), ce qui couvre la grande
  // majorité des sessions actives sans plomberie supplémentaire. Compromis
  // documenté : un compte qui ne visite ni l'une ni l'autre un jour donné ne
  // fait pas progresser ce compteur ce jour-là.
  //
  // Note : `loginStreakDays`/`lastLoginDate` restent calculés et enregistrés
  // ci-dessous même si plus aucun easter egg n'en dépend depuis la
  // suppression de "Fidélité rétro" (ex #46, qui déverrouillait l'« Icône
  // rétro », elle-même supprimée) — pas de migration de schéma pour un
  // simple retrait de déclencheur, et ces champs restent disponibles si un
  // futur easter egg veut s'appuyer sur une série de connexions.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastLoginDate: true, loginStreakDays: true, lastLoginHour: true, sameHourLoginStreak: true }
  });
  if (me) {
    const now = new Date();
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

      // Jours consécutifs avec au moins une visite (n'alimente plus aucun
      // easter egg directement, voir la note ci-dessus, mais reste calculé).
      const nextStreakDays = isNextConsecutiveDay ? (me.loginStreakDays ?? 0) + 1 : 1;

      // "Toujours à l'heure" (#46) : connexions à peu près à la même heure
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

      if (nextSameHourStreak === 3) {
        await markEasterEggFound(userId, "greeting-unlock");
      }
    }
  }

  // Succès d'audience (cadres de la page bio) : revérifiés à chaque visite.
  await checkAudienceMilestones(userId);

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
    // Succès « secret » : rien de sa récompense ne fuit tant qu'il n'est
    // pas trouvé — il s'affiche comme un easter egg numéroté ordinaire.
    if (!foundAt) return { number: e.number, found: false, reward: e.secret ? undefined : e.reward };
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

  return NextResponse.json({
    total: EASTER_EGGS.length,
    foundCount: found.length,
    // Voir dev-preview.ts : permet à Paramètres de laisser le compte
    // propriétaire choisir n'importe quel fond d'écran réservé, sans avoir à
    // revérifier ce même easter egg côté client pour chaque fond.
    isOwner: isOwnerEmail(session.user.email),
    eggs
  });
}
