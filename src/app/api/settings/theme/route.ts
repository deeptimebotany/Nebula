import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { THEMES } from "@/lib/themes";

// GET/PATCH /api/settings/theme — préférence de thème de couleurs, propre au
// compte (pas à la marque), pour la retrouver en se connectant depuis un
// autre appareil. Le choix s'applique immédiatement côté client via
// localStorage (voir theme-provider.tsx) ; cette route ne fait que
// synchroniser pour la prochaine connexion ailleurs.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ theme: null }, { status: 200 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { themePreference: true } });
  return NextResponse.json({ theme: user?.themePreference ?? "nebula" });
}

const bodySchema = z.object({ theme: z.string() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!THEMES.some((t) => t.key === parsed.data.theme)) {
    return NextResponse.json({ error: "Thème inconnu." }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;
  await prisma.user.update({ where: { id: userId }, data: { themePreference: parsed.data.theme } });
  return NextResponse.json({ ok: true });
}
