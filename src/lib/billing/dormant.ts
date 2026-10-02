// Marques et comptes « en veille » (lot E4, brief « Essai 14 jours ») : ni
// publication ni synchronisation (statistiques, commentaires, engagements,
// publicité) — ce qui économise aussi les quotas des réseaux. Les jetons
// restent en base sans être rafraîchis.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const DORMANT_SYNC_MESSAGE = "Marque en veille en Gratuit : la synchronisation reprend dès le passage en Pro. Tout est conservé.";

/** Retire les comptes en veille, ou dont la marque est en veille. */
export async function withoutDormant<T extends { id: string; brandId: string; dormantAt?: Date | null }>(connections: T[]): Promise<T[]> {
  if (connections.length === 0) return connections;
  const brandIds = Array.from(new Set(connections.map((c) => c.brandId)));
  const sleeping = new Set((await prisma.brand.findMany({ where: { id: { in: brandIds }, dormantAt: { not: null } }, select: { id: true } })).map((b) => b.id));
  return connections.filter((c) => !c.dormantAt && !sleeping.has(c.brandId));
}

/** Réponse d'une synchronisation demandée sur une marque (ou des comptes) en veille. */
export function dormantSyncResponse(): NextResponse {
  return NextResponse.json({ error: DORMANT_SYNC_MESSAGE, reason: "dormant_brand" }, { status: 402 });
}

export async function isBrandDormant(brandId: string): Promise<boolean> {
  const b = await prisma.brand.findUnique({ where: { id: brandId }, select: { dormantAt: true } });
  return Boolean(b?.dormantAt);
}
