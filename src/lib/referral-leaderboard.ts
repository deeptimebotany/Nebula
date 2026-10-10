// Classement des parrains (« Top parrains » de la Communauté et de Mon
// profil, Couronne permanente) — 10/10/2026, demande de Lucas : ne compter
// que les filleuls ABONNÉS, pour qu'on ne puisse pas grimper avec de faux
// comptes. Avant : toutes les inscriptions faites avec le code comptaient,
// même un compte jamais utilisé.
//
// Filleul abonné = filleul confirmé par billing/rewards.ts : il a pris un
// abonnement, a réellement payé (facture > 0 €) et était toujours abonné 30
// jours après (récompense GRANTED, ou CAPPED quand le parrain a déjà reçu
// ses 12 mois offerts de l'année). Même règle que les paliers ambassadeur.
import { prisma } from "@/lib/prisma";
import { displayHandle } from "@/lib/community/handle-rules";
import { referralRewardDb } from "@/lib/prisma-extra";

/** Statuts d'une récompense de parrainage dont le filleul est confirmé abonné. */
export const CONFIRMED_REFERRAL_STATUSES = ["GRANTED", "CAPPED"] as const;

/** Filleuls abonnés confirmés, par parrain (identifiant du compte → nombre). */
export async function confirmedReferralCounts(): Promise<Map<string, number>> {
  const rows = await referralRewardDb.groupBy({
    by: ["beneficiaryId"],
    where: { reason: "referral", status: { in: [...CONFIRMED_REFERRAL_STATUSES] } },
    _count: { _all: true }
  });
  return new Map(rows.map((r) => [r.beneficiaryId, r._count._all]));
}

/**
 * Classement : le plus de filleuls abonnés d'abord ; à égalité, l'ordre de
 * l'identifiant (stable d'un jour à l'autre). Seulement les parrains qui en
 * ont au moins un.
 */
export function rankReferrers(counts: Map<string, number>, limit = 10): { userId: string; referrals: number }[] {
  return Array.from(counts.entries())
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([userId, referrals]) => ({ userId, referrals }));
}

/**
 * Les `limit` premiers parrains, comptes existants seulement (une
 * récompense survit à la suppression du compte du parrain : elle ne doit
 * ni apparaître au classement ni recevoir la couronne).
 */
export async function topReferrers(limit = 10): Promise<{ userId: string; name: string; referrals: number }[]> {
  const ranked = rankReferrers(await confirmedReferralCounts(), Number.MAX_SAFE_INTEGER);
  if (ranked.length === 0) return [];
  // Pseudo de la Communauté, jamais le nom (10/10/2026).
  const users: { id: string; handle: string | null }[] = await prisma.user.findMany({ where: { id: { in: ranked.map((r) => r.userId) } }, select: { id: true, handle: true } });
  const nameById = new Map(users.map((u) => [u.id, displayHandle(u.handle)]));
  return ranked.filter((r) => nameById.has(r.userId)).slice(0, limit).map((r) => ({ ...r, name: nameById.get(r.userId) ?? "" }));
}
