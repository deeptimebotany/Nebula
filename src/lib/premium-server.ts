// Variante server-only de computePremiumInfo (src/lib/premium.ts) : ce
// fichier importe Prisma, donc il ne doit JAMAIS être importé depuis un
// composant "use client" (contrairement à premium.ts, volontairement gardé
// pur/sans dépendance serveur pour rester utilisable côté client).
//
// Passe par getUserPlan() — la fonction de vérité du palier effectif (brief
// growth, lot G2) : un abonnement en pause n'est plus Premium ; un essai Pro
// applicatif l'est (fonctions Premium débloquées pendant l'essai), sans
// ancienneté affichée puisqu'il n'y a pas encore d'abonnement.
import { prisma } from "@/lib/prisma";
import { computePremiumInfo, type PremiumInfo } from "@/lib/premium";
import { getUserPlan } from "@/lib/billing/plan";

export async function getMyPremiumInfo(userId: string): Promise<PremiumInfo> {
  const info = await getUserPlan(userId);
  if (info.paid) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscription: { select: { plan: true, status: true, createdAt: true } } }
    });
    return computePremiumInfo(me?.subscription);
  }
  if (info.onTrial) return { isPremium: true, plan: "PRO", tenureLabel: null, tenureTier: null };
  return { isPremium: false, plan: "FREE", tenureLabel: null, tenureTier: null };
}
