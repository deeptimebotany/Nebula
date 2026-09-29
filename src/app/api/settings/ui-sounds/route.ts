import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// PATCH /api/settings/ui-sounds — réglage « Sons de l'interface » (lot U5),
// enregistré sur le compte (User.uiSoundsEnabled, activé par défaut). La
// valeur courante est servie par /api/me (uiSounds).
const bodySchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const userId = (session.user as { id: string }).id;
  await prisma.user.update({ where: { id: userId }, data: { uiSoundsEnabled: parsed.data.enabled } });
  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
