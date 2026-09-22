import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Toujours réévalué à la demande — voir /api/settings/starfield pour le même
// principe.
export const dynamic = "force-dynamic";

// GET/PATCH /api/settings/publish-sound — option "Son Décollage" (voir
// easter-eggs-registry.ts, clé "publish-sound-unlock"). Même schéma que
// /api/settings/starfield, avec une nuance : ici `unlocked` reflète le fait
// d'avoir TROUVÉ l'easter egg (ligne dans EasterEggFound), pas un palier
// d'abonnement — cette option n'a rien à voir avec Facturation.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ enabled: false, unlocked: false }, { status: 200 });
  const userId = (session.user as { id: string }).id;
  const [user, found] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { publishSoundEnabled: true } }),
    prisma.easterEggFound.findUnique({ where: { userId_key: { userId, key: "publish-sound-unlock" } }, select: { id: true } })
  ]);
  return NextResponse.json({ enabled: Boolean(user?.publishSoundEnabled), unlocked: Boolean(found) });
}

const bodySchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const userId = (session.user as { id: string }).id;

  if (parsed.data.enabled) {
    // Ne jamais faire confiance au client : cette option reste réservée à
    // qui a réellement trouvé l'easter egg (10ᵉ post personnel publié).
    const found = await prisma.easterEggFound.findUnique({
      where: { userId_key: { userId, key: "publish-sound-unlock" } },
      select: { id: true }
    });
    if (!found) {
      return NextResponse.json(
        { error: "Publiez d'abord votre 10ᵉ post personnel pour débloquer cette option." },
        { status: 403 }
      );
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { publishSoundEnabled: parsed.data.enabled } });
  return NextResponse.json({ ok: true });
}
