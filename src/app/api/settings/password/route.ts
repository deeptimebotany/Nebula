import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

// POST /api/settings/password { currentPassword, newPassword } — changement
// de mot de passe depuis Paramètres, pour un compte déjà connecté (distinct
// du flux "mot de passe oublié" qui ne demande pas l'ancien mot de passe).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Nouveau mot de passe trop court (8 caractères min.)." }, { status: 400 });
  }
  const { currentPassword, newPassword } = body.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
