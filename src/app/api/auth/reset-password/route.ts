import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashResetToken } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8)
});

// POST /api/auth/reset-password { token, password } — valide le jeton reçu
// par email (voir /api/auth/forgot-password) et définit le nouveau mot de
// passe. Le jeton est à usage unique : il est effacé après utilisation.
export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Lien invalide ou mot de passe trop court (8 caractères min.)." }, { status: 400 });
  }
  const { token, password } = body.data;
  const tokenHash = hashResetToken(token);

  const user = await prisma.user.findUnique({ where: { passwordResetTokenHash: tokenHash } });
  if (!user || !user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Ce lien de réinitialisation est invalide ou a expiré." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordResetTokenHash: null, passwordResetTokenExpiresAt: null }
  });

  return NextResponse.json({ ok: true });
}
