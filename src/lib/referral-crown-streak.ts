import { prisma } from "@/lib/prisma";
import { markEasterEggFound } from "@/lib/easter-eggs/server";
import { topReferrers } from "@/lib/referral-leaderboard";

// Easter egg à récompense "Couronne permanente" (referral-crown-30d) : il
// faut rester en 1ère place du classement de parrainage (voir
// /api/referral/leaderboard, même règle de calcul reprise ici) 30 jours
// CONSÉCUTIFS. Vérifié une fois par jour civil (UTC) — voir ReferralCrownStreak
// dans schema.prisma, une ligne globale unique ("singleton"), mise à jour
// depuis /api/cron et scripts/worker.ts (tous les deux appellent cette
// fonction à chaque exécution ; elle ne fait réellement quelque chose que la
// première fois du jour, voir la sortie anticipée ci-dessous).
const CROWN_STREAK_TARGET = 30;
const SINGLETON_ID = "singleton";

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Parrain actuellement en tête du classement — même règle que
// /api/referral/leaderboard : le plus de filleuls ABONNÉS (10/10/2026, voir
// src/lib/referral-leaderboard.ts ; avant, toutes les inscriptions avec le
// code comptaient, faux comptes compris).
async function computeTopReferrerId(): Promise<string | null> {
  return (await topReferrers(1))[0]?.userId ?? null;
}

export async function checkReferralCrownStreak(): Promise<void> {
  try {
    const today = utcDateOnly(new Date());

    const state = await prisma.referralCrownStreak.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {}
    });

    // Déjà vérifié aujourd'hui — /api/cron tourne toutes les minutes, mais
    // ce streak est journalier.
    if (state.lastDate && utcDateOnly(state.lastDate).getTime() === today.getTime()) {
      return;
    }

    const topUserId = await computeTopReferrerId();
    if (!topUserId) {
      await prisma.referralCrownStreak.update({
        where: { id: SINGLETON_ID },
        data: { userId: null, days: 0, lastDate: today }
      });
      return;
    }

    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const wasTopYesterday =
      state.userId === topUserId &&
      !!state.lastDate &&
      utcDateOnly(state.lastDate).getTime() === yesterday.getTime();

    const days = wasTopYesterday ? state.days + 1 : 1;

    await prisma.referralCrownStreak.update({
      where: { id: SINGLETON_ID },
      data: { userId: topUserId, days, lastDate: today }
    });

    if (days >= CROWN_STREAK_TARGET) {
      await markEasterEggFound(topUserId, "referral-crown-30d");
    }
  } catch (err) {
    // Comme markEasterEggFound : un easter egg ne doit jamais faire échouer
    // le cron/worker (publications programmées, rapports...).
    console.error("[easter-eggs] échec de la vérification du streak de couronne :", err);
  }
}
