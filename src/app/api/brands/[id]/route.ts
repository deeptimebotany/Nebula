import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({ name: z.string().min(2).max(80) });

// PATCH /api/brands/[id] { name } — renomme le pseudo affiché d'une marque
// (visible dans l'aperçu du Composer, le sélecteur de marque, etc.).
// Réservé aux membres de la marque (n'importe quel rôle peut renommer, à
// la différence de la création qui suit le quota d'abonnement).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Pseudo invalide (2 caractères minimum)." }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  const membership = await prisma.membership.findUnique({
    where: { userId_brandId: { userId, brandId: params.id } }
  });
  if (!membership) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

  const brand = await prisma.brand.update({ where: { id: params.id }, data: { name: parsed.data.name } });
  return NextResponse.json({ ok: true, brand });
}
