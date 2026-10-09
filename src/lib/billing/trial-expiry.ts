// Fin d'essai (brief growth, lot G2.a, revu au lot E4 du brief « Essai 14
// jours », 29/09/2026) — appliquée par /api/cron et le worker, jamais
// destructive : « rien n'est supprimé ». Tout le détail est dans
// applyFreeLimits() (src/lib/billing/free-limits.ts), commune à toutes les
// descentes en Gratuit : marque active gardée, autres marques en veille,
// publications lointaines en brouillon, page bio en version Gratuit,
// rapports / calendrier client / media kit dépubliés.
// Idempotent : trialExpiredAppliedAt marque les comptes déjà traités.
//
// Et la migration ponctuelle des comptes gratuits existants au déploiement
// (« trial_gift ») : tout compte SANS trialEndsAt et sans abonnement payant
// reçoit 14 jours d'essai, une seule fois — les nouveaux comptes ayant
// toujours une date dès l'inscription (ou un refus d'essai, lot E3), seuls
// les anciens sont concernés.
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/billing/plan";
import { upToBrandsText } from "@/lib/plans";
import { trialEndDate } from "@/lib/trial";
import { trackGrowth } from "@/lib/growth";
import { applyFreeLimits, DORMANT_BRAND_MESSAGE } from "@/lib/billing/free-limits";
import { CONNECTION_LIMIT_REASON, brandConnectionOverage, connectionLimitMessage } from "@/lib/billing/connection-limit";

export async function applyTrialExpirations(now: Date = new Date()): Promise<{ applied: number }> {
  const expired = await prisma.user.findMany({
    where: { trialEndsAt: { lte: now }, trialExpiredAppliedAt: null },
    select: { id: true, memberships: { where: { role: "OWNER" }, select: { brandId: true } } },
    take: 200
  });
  let applied = 0;
  for (const user of expired) {
    const info = await getUserPlan(user.id);
    // Payant entre-temps, ou accès offert (partenaire) : on marque comme
    // traité sans rien toucher.
    if (info.paid || info.comp) {
      await prisma.user.update({ where: { id: user.id }, data: { trialExpiredAppliedAt: now } });
      continue;
    }
    const result = await applyFreeLimits(user.id, "trial_end", now);
    await prisma.user.update({ where: { id: user.id }, data: { trialExpiredAppliedAt: now } });
    await trackGrowth("trial_ended", { brands: user.memberships.length, dormant: result.dormantBrands, drafted: result.drafted }, user.id);
    applied += 1;
  }
  return { applied };
}

export async function grantTrialToLegacyAccounts(): Promise<{ granted: number }> {
  const legacy = await prisma.user.findMany({
    // Jamais les comptes dont l'essai a été refusé à l'inscription (lot E3).
    where: { trialEndsAt: null, trialDeniedAt: null, OR: [{ subscription: null }, { subscription: { plan: "FREE" } }, { subscription: { status: { notIn: ["ACTIVE", "TRIALING"] } } }] },
    select: { id: true },
    take: 500
  });
  if (legacy.length === 0) return { granted: 0 };
  const trialEndsAt = trialEndDate(false);
  await prisma.user.updateMany({ where: { id: { in: legacy.map((u) => u.id) } }, data: { trialEndsAt } });
  for (const u of legacy) await trackGrowth("trial_gift", {}, u.id);
  return { granted: legacy.length };
}

/**
 * Une marque peut-elle publier ? (création, import, programmation, « Publier
 * maintenant »)
 *   - marque en veille (lot E4) → non, raison `dormant_brand` ;
 *   - plus de comptes connectés que le palier n'en permet (fin d'essai,
 *     résiliation…, 09/10/2026) → non, raison `connection_limit`, tant que
 *     les comptes en trop ne sont pas déconnectés (connection-limit.ts) ;
 *   - essai en cours → oui : les marques déjà créées restent actives jusqu'à
 *     la fin de l'essai, même au-delà de 2 (limite appliquée à la création) ;
 *   - sinon, marques non en veille au-delà du palier (rétrogradation, fin
 *     d'essai pas encore traitée par le cron) → lecture seule, raison
 *     `second_brand` ; la marque active choisie passe en premier, puis les
 *     plus anciennes.
 */
export async function assertBrandWritable(
  brandId: string
): Promise<{ ok: true } | { ok: false; message: string; reason: "dormant_brand" | "second_brand" | typeof CONNECTION_LIMIT_REASON }> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { dormantAt: true } });
  if (brand?.dormantAt) return { ok: false, message: DORMANT_BRAND_MESSAGE, reason: "dormant_brand" };
  const overage = await brandConnectionOverage(brandId);
  if (overage.over) return { ok: false, message: connectionLimitMessage(overage.slots, overage.max, overage.planLabel), reason: CONNECTION_LIMIT_REASON };
  const owner = await prisma.membership.findFirst({ where: { brandId, role: "OWNER" }, orderBy: { id: "asc" }, select: { userId: true, user: { select: { freeActiveBrandId: true } } } });
  if (!owner) return { ok: true };
  const info = await getUserPlan(owner.userId);
  if (info.onTrial) return { ok: true };
  const owned = await prisma.membership.findMany({
    where: { userId: owner.userId, role: "OWNER", brand: { dormantAt: null } },
    select: { brandId: true, brand: { select: { createdAt: true } } },
    orderBy: { brand: { createdAt: "asc" } }
  });
  const activeId = owner.user?.freeActiveBrandId;
  const ordered = [...owned.filter((m) => m.brandId === activeId), ...owned.filter((m) => m.brandId !== activeId)];
  const rank = ordered.findIndex((m) => m.brandId === brandId);
  if (rank >= 0 && rank >= info.maxBrands) {
    return {
      ok: false,
      reason: "second_brand",
      // Payant ou accès offert avec trop de marques (ex. fin d'essai à 2
      // marques → Pro 1 marque) : choisir la marque active, ou plus de marques.
      message:
        info.paid || info.comp
          ? `Cette marque est en lecture seule : votre palier ${info.limits.label} (${upToBrandsText(info.maxBrands)}) est complet. Choisissez la marque qui publie dans Facturation → « Choisir ce que je garde », ou passez à un palier avec plus de marques.`
          : `Cette marque est en lecture seule : votre palier ${info.limits.label} permet ${info.maxBrands} marque${info.maxBrands > 1 ? "s" : ""}. Passez en Pro pour publier à nouveau depuis celle-ci.`
    };
  }
  return { ok: true };
}

/** Comptes en veille parmi ceux visés par une publication (lot E4). */
export async function assertConnectionsWritable(connectionIds: string[]): Promise<{ ok: true } | { ok: false; message: string; reason: "dormant_brand" }> {
  if (connectionIds.length === 0) return { ok: true };
  const sleeping = await prisma.socialConnection.count({ where: { id: { in: connectionIds }, dormantAt: { not: null } } });
  return sleeping > 0 ? { ok: false, message: "Un des comptes choisis est en veille : en Gratuit, seuls les comptes gardés sur votre marque active publient. Passez en Pro pour le réactiver.", reason: "dormant_brand" } : { ok: true };
}
