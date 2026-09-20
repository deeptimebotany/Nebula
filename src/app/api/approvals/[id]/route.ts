import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/approvals/[id] — révoque un lien client (le token cesse
// immédiatement de fonctionner, sans supprimer l'historique des réponses).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  await prisma.approvalLink.update({ where: { id: params.id }, data: { revokedAt: new Date() } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
