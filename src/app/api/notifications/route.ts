import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notificationDb } from "@/lib/prisma-extra";
import { materializeNews, toDTO } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// GET /api/notifications — la bulle de la cloche (voir
// notification-bell.tsx). ?count=1 : juste le nombre de non lues (appel
// léger, répété toutes les minutes tant que l'onglet est visible).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  await materializeNews(userId, user.createdAt).catch(() => undefined);

  // ?since=<ISO> : seulement les non lues arrivées depuis la dernière
  // ouverture de la bulle (le compteur de la cloche).
  const sinceRaw = req.nextUrl.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const sinceFilter = since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {};
  if (req.nextUrl.searchParams.get("count") === "1") {
    const unread = await notificationDb.count({ where: { userId, readAt: null, ...sinceFilter } });
    return NextResponse.json({ unread });
  }
  const unread = await notificationDb.count({ where: { userId, readAt: null } });

  const rows = await notificationDb.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 40
  });
  return NextResponse.json({ unread, items: rows.map(toDTO) });
}

const patchSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })
]);

// PATCH /api/notifications — marque comme lues ({ all: true } ou { ids }).
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const where = "all" in parsed.data ? { userId, readAt: null } : { userId, readAt: null, id: { in: parsed.data.ids } };
  await notificationDb.updateMany({ where, data: { readAt: new Date() } });
  const unread = await notificationDb.count({ where: { userId, readAt: null } });
  return NextResponse.json({ ok: true, unread });
}
