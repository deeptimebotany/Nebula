import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// GET/PATCH /api/settings/mode — préférence Sombre/Clair (voir mode-provider.tsx),
// même logique que /api/settings/theme et /api/settings/background.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ mode: null }, { status: 200 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { colorMode: true } });
  return NextResponse.json({ mode: user?.colorMode ?? "dark" });
}

const bodySchema = z.object({ mode: z.enum(["dark", "light"]) });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  await prisma.user.update({ where: { id: userId }, data: { colorMode: parsed.data.mode } });
  return NextResponse.json({ ok: true });
}
