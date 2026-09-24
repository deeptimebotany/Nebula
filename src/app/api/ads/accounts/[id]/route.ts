import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { adsAccessFor } from "@/lib/ads/access";
import { adAccountDb, adMetricDailyDb } from "@/lib/prisma-extra";

export const dynamic = "force-dynamic";

// DELETE /api/ads/accounts/:id — ne plus suivre ce compte (ses chiffres
// sont supprimés de Nebula ; rien ne change côté régie).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const account = await adAccountDb.findUnique({ where: { id: params.id } });
  if (!account) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  const access = await adsAccessFor(userId, account.brandId);
  if (!access) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  // Retirer reste possible même redescendu en gratuit (pour faire le ménage).
  if (access.role !== "OWNER" && access.role !== "EDITOR") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  await adMetricDailyDb.deleteMany({ where: { adAccountId: account.id } });
  await adAccountDb.deleteMany({ where: { id: account.id } });
  return NextResponse.json({ ok: true });
}
