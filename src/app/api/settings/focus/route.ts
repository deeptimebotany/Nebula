import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// PATCH /api/settings/focus — Mode focus (voir schema.prisma, User.focusMode
// et bootstrap-provider.tsx). La valeur courante est servie par /api/me.
const bodySchema = z.object({ focusMode: z.boolean() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  await prisma.user.update({ where: { id: userId }, data: { focusMode: parsed.data.focusMode } });
  return NextResponse.json({ ok: true, focusMode: parsed.data.focusMode });
}
