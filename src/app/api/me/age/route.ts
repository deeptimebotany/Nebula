import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/me/age { adult: true } — confirmation « J'ai 18 ans ou plus »
// (30/09/2026). Demandée une fois aux comptes créés avant cette date et à
// ceux ouverts avec Google, Apple ou Facebook (sans le formulaire
// d'inscription). Datée ; jamais effacée ensuite.
const schema = z.object({ adult: z.literal(true) });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirmation invalide." }, { status: 400 });
  await prisma.user.updateMany({ where: { id: userId, ageConfirmedAt: null }, data: { ageConfirmedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
