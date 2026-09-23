import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";

// DELETE /api/approvals/[id] — révoque un lien client (le token cesse
// immédiatement de fonctionner, sans supprimer l'historique des réponses).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const userId = (session.user as { id: string }).id;
  const { count } = await prisma.approvalLink.updateMany({
    where: { id: params.id, brand: ownedBy(userId) },
    data: { revokedAt: new Date() }
  });
  if (count === 0) return NextResponse.json({ error: "Lien introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
