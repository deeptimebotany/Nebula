// Fin d'essai Pro (brief growth, lot G2.a) — appliquée par /api/cron et le
// worker, jamais destructive : « rien n'est supprimé ».
//   - liens de page bio au-delà de la limite Gratuit : conservés mais
//     DÉSACTIVÉS (grisés « Pro » dans l'éditeur) ;
//   - rapports et calendrier client : dépubliés (la page publique affiche
//     « n'est plus partagé ») ;
//   - marques au-delà de la limite : lecture seule, appliquée à la volée par
//     assertBrandWritable() (ci-dessous) — rien à faire ici ;
//   - Rétention IA et assistant : verrouillés par getUserPlan() ;
//   - les publications déjà programmées partent quand même (runDuePosts ne
//     regarde pas le palier).
// Idempotent : trialExpiredAppliedAt marque les comptes déjà traités.
//
// Et la migration ponctuelle des comptes gratuits existants au déploiement
// (« trial_gift ») : tout compte SANS trialEndsAt et sans abonnement payant
// reçoit 14 jours de Pro, une seule fois — les nouveaux comptes ayant
// toujours une date dès l'inscription, seuls les anciens sont concernés.
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plans";
import { getUserPlan } from "@/lib/billing/plan";
import { trialEndDate } from "@/lib/trial";
import { trackGrowth } from "@/lib/growth";

export async function applyTrialExpirations(): Promise<{ applied: number }> {
  const now = new Date();
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
    const brandIds = user.memberships.map((m) => m.brandId);
    const limit = PLAN_LIMITS.FREE.maxBioLinks;
    for (const brandId of brandIds) {
      const page = await prisma.linkPage.findUnique({ where: { brandId }, select: { id: true, links: { orderBy: { order: "asc" }, select: { id: true } } } });
      if (page && page.links.length > limit) {
        const extra = page.links.slice(limit).map((l) => l.id);
        await prisma.linkItem.updateMany({ where: { id: { in: extra } }, data: { enabled: false } });
      }
    }
    if (!PLAN_LIMITS.FREE.reportsEnabled) await prisma.brandReport.updateMany({ where: { brandId: { in: brandIds }, enabled: true }, data: { enabled: false } });
    if (!PLAN_LIMITS.FREE.calendarShareEnabled) await prisma.calendarShare.updateMany({ where: { brandId: { in: brandIds }, enabled: true }, data: { enabled: false } });
    await prisma.user.update({ where: { id: user.id }, data: { trialExpiredAppliedAt: now } });
    await trackGrowth("trial_ended", { brands: brandIds.length }, user.id);
    applied += 1;
  }
  return { applied };
}

export async function grantTrialToLegacyAccounts(): Promise<{ granted: number }> {
  const legacy = await prisma.user.findMany({
    where: { trialEndsAt: null, OR: [{ subscription: null }, { subscription: { plan: "FREE" } }, { subscription: { status: { notIn: ["ACTIVE", "TRIALING"] } } }] },
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
 * Marques au-delà de la limite du palier : lecture seule (aucune nouvelle
 * publication). La marque « principale » est la plus ancienne ; les
 * suivantes, jusqu'à maxBrands, restent actives ; au-delà, refus 402 avec
 * la raison `second_brand` (UpgradeModal côté client).
 */
export async function assertBrandWritable(brandId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const owner = await prisma.membership.findFirst({ where: { brandId, role: "OWNER" }, orderBy: { id: "asc" }, select: { userId: true } });
  if (!owner) return { ok: true };
  const info = await getUserPlan(owner.userId);
  const owned = await prisma.membership.findMany({
    where: { userId: owner.userId, role: "OWNER" },
    select: { brandId: true, brand: { select: { createdAt: true } } },
    orderBy: { brand: { createdAt: "asc" } }
  });
  const rank = owned.findIndex((m) => m.brandId === brandId);
  if (rank >= 0 && rank >= info.maxBrands) {
    return { ok: false, message: `Cette marque est en lecture seule : votre palier ${info.limits.label} permet ${info.maxBrands} marque${info.maxBrands > 1 ? "s" : ""}. Passez en Pro pour publier à nouveau depuis celle-ci.` };
  }
  return { ok: true };
}
