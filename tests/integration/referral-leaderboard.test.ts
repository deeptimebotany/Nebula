import { afterEach, describe, expect, it, vi } from "vitest";

// Classement des parrains (10/10/2026, demande de Lucas) : seuls les
// filleuls ABONNÉS comptent (récompense de parrainage GRANTED ou CAPPED :
// abonnement payé, toujours actif 30 jours après). De faux comptes inscrits
// avec le code, ou un filleul qui a résilié avant 30 jours, ne comptent pas.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/referral/leaderboard/route";
import { checkReferralCrownStreak } from "@/lib/referral-crown-streak";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

async function referrer(name: string, code: string) {
  const { user } = await makeBrand();
  return prisma.user.update({ where: { id: user.id }, data: { name, referralCode: code } });
}

async function filleul(code: string, rewardStatus: string | null, beneficiaryId: string) {
  const { user } = await makeBrand();
  await prisma.user.update({ where: { id: user.id }, data: { referredByCode: code } });
  if (rewardStatus) {
    await prisma.referralReward.create({ data: { beneficiaryId, refereeId: user.id, reason: "referral", status: rewardStatus, eligibleAt: new Date() } });
  }
  return user;
}

describe.skipIf(!hasDatabase)("classement des parrains : filleuls abonnés seulement", () => {
  afterEach(() => {
    session.userId = null;
  });

  it("les inscriptions sans abonnement (faux comptes) ne comptent pas", async () => {
    await resetDatabase();
    const tricheur = await referrer("Tricheur", "TRICHE01");
    const honnete = await referrer("Honnête", "HONNETE1");
    // 5 inscriptions avec le code du tricheur, jamais abonnées ; une résiliée avant 30 jours.
    for (let i = 0; i < 5; i++) await filleul("TRICHE01", null, tricheur.id);
    await filleul("TRICHE01", "CANCELED", tricheur.id);
    await filleul("TRICHE01", "PENDING", tricheur.id);
    // 2 vrais filleuls abonnés (un mois offert, un au-delà du plafond).
    await filleul("HONNETE1", "GRANTED", honnete.id);
    await filleul("HONNETE1", "CAPPED", honnete.id);

    session.userId = tricheur.id;
    const { leaderboard } = await (await GET()).json();
    // Le @pseudo (10/10/2026), jamais le nom.
    const handle = (await prisma.user.findUnique({ where: { id: honnete.id }, select: { handle: true } }))?.handle;
    expect(leaderboard).toEqual([{ id: honnete.id, displayName: handle ? `@${handle}` : "@membre", referrals: 2, isMe: false }]);

    // Couronne : le premier du classement est le parrain honnête (état du
    // jour remis à zéro : un autre test a pu déjà le calculer aujourd'hui).
    await prisma.referralCrownStreak.deleteMany({});
    await checkReferralCrownStreak();
    expect(await prisma.referralCrownStreak.findUnique({ where: { id: "singleton" } })).toMatchObject({ userId: honnete.id, days: 1 });
  });

  it("le badge « Propulsé par Nebula » ne compte pas comme parrainage", async () => {
    await resetDatabase();
    const p = await referrer("Paula", "PAULA001");
    const { user } = await makeBrand();
    await prisma.referralReward.create({ data: { beneficiaryId: p.id, refereeId: user.id, reason: "badge", status: "GRANTED", eligibleAt: new Date() } });
    session.userId = p.id;
    expect((await (await GET()).json()).leaderboard).toEqual([]);
  });
});
