import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/referral/leaderboard — "Boucle de parrainage intégrée" de
// l'espace Communauté : classement des comptes par nombre RÉEL de
// filleuls (comptes dont referredByCode correspond au code de ce compte),
// calculé directement en base — aucun chiffre inventé. Les prénoms sont
// tronqués (première lettre du nom masquée) pour rester public sans exposer
// l'identité complète d'un tiers.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const myUserId = (session.user as { id: string }).id;

  const users = await prisma.user.findMany({
    where: { referralCode: { not: null } },
    select: { id: true, name: true, referralCode: true }
  });

  const counts: { referredByCode: string | null; _count: { _all: number } }[] = await prisma.user.groupBy({
    by: ["referredByCode"],
    where: { referredByCode: { not: null } },
    _count: { _all: true }
  });
  const countByCode = new Map(counts.map((c) => [c.referredByCode as string, c._count._all]));

  interface UserRow {
    id: string;
    name: string;
    referralCode: string | null;
  }

  const ranked = (users as UserRow[])
    .map((u) => ({
      id: u.id,
      displayName: u.name ? `${u.name.charAt(0).toUpperCase()}${u.name.slice(1, 2).toLowerCase()}...` : "Utilisateur",
      referrals: countByCode.get(u.referralCode ?? "") ?? 0,
      isMe: u.id === myUserId
    }))
    .filter((u) => u.referrals > 0)
    .sort((a, b) => b.referrals - a.referrals)
    .slice(0, 10);

  return NextResponse.json({ leaderboard: ranked });
}
