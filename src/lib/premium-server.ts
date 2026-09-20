// Variante server-only de computePremiumInfo (src/lib/premium.ts) : ce
// fichier importe Prisma, donc il ne doit JAMAIS être importé depuis un
// composant "use client" (contrairement à premium.ts, volontairement gardé
// pur/sans dépendance serveur pour rester utilisable côté client).
import { prisma } from "@/lib/prisma";
import { computePremiumInfo, type PremiumInfo } from "@/lib/premium";

export async function getMyPremiumInfo(userId: string): Promise<PremiumInfo> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscription: { select: { plan: true, status: true, createdAt: true } } }
  });
  return computePremiumInfo(me?.subscription);
}
