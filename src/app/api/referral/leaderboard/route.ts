import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { topReferrers } from "@/lib/referral-leaderboard";

// GET /api/referral/leaderboard — classement des parrains de la Communauté
// et de Mon profil. Depuis le 10/10/2026 (demande de Lucas), seuls les
// filleuls ABONNÉS comptent (abonnés, ayant réellement payé, toujours
// abonnés 30 jours après : voir src/lib/referral-leaderboard.ts) — de faux
// comptes ne font plus monter au classement. Calculé en base, aucun chiffre
// inventé. Depuis le 10/10/2026 : le @pseudo de la Communauté, jamais le nom.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const myUserId = (session.user as { id: string }).id;

  const leaderboard = (await topReferrers(10)).map((t) => ({
    id: t.userId,
    // 10/10/2026 : le @pseudo de la Communauté, en entier (plus de nom tronqué).
    displayName: t.name,
    referrals: t.referrals,
    isMe: t.userId === myUserId
  }));

  return NextResponse.json({ leaderboard });
}
