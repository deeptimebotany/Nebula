import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// PATCH /api/me/tour — visite guidée (lot U4). État gardé sur le compte :
// elle ne se rejoue pas sur un autre appareil et reprend à la bonne étape
// après un rechargement.
//   { action: "step", step }   étape atteinte (0 à 5) ;
//   { action: "done" }         terminée ou passée (tourCompletedAt) ;
//   { action: "restart" }      « Revoir la visite » (Paramètres, palette).
const TOUR_STEPS = 6;
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("step"), step: z.number().int().min(0).max(TOUR_STEPS - 1) }),
  z.object({ action: z.literal("done") }),
  z.object({ action: z.literal("restart") })
]);

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const userId = (session.user as { id: string }).id;
  const body = parsed.data;
  const data =
    body.action === "step"
      ? { tourStep: body.step }
      : body.action === "done"
        ? { tourCompletedAt: new Date() }
        : { tourCompletedAt: null, tourStep: 0 };
  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true });
}
