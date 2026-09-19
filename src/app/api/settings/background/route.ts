import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { BACKGROUNDS, DEFAULT_BACKGROUND_KEY } from "@/lib/backgrounds";

// GET/PATCH /api/settings/background — même logique que /api/settings/theme
// (voir ce fichier), pour le fond d'écran choisi dans Paramètres.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ background: null }, { status: 200 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { backgroundPreference: true } });
  return NextResponse.json({ background: user?.backgroundPreference ?? DEFAULT_BACKGROUND_KEY });
}

const bodySchema = z.object({ background: z.string() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!BACKGROUNDS.some((b) => b.key === parsed.data.background)) {
    return NextResponse.json({ error: "Fond d'écran inconnu." }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;
  await prisma.user.update({ where: { id: userId }, data: { backgroundPreference: parsed.data.background } });
  return NextResponse.json({ ok: true });
}
