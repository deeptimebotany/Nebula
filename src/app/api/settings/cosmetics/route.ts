import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getUserPlan } from "@/lib/billing/plan";
import { COSMETICS, canUseCosmetic, findCosmetic } from "@/lib/cosmetics";

// Toujours réévalué à la demande — même raison que /api/settings/starfield :
// `allowedKeys` doit refléter le palier réel au moment de l'appel.
export const dynamic = "force-dynamic";

// GET/PATCH /api/settings/cosmetics — contenu visuel/sonore débloqué par
// palier OU par easter egg trouvé (voir src/lib/cosmetics.ts), affiché dans
// Paramètres → Cosmétiques. `allowedKeys` liste les clés que ce compte peut
// activer maintenant, quelle que soit la voie (les autres restent visibles
// mais verrouillées côté UI, comme pour les thèmes réservés) ; `enabled`
// liste celles effectivement activées par la personne.
async function eggAllowedKeys(userId: string): Promise<string[]> {
  const eggGated = COSMETICS.filter((c) => c.requiresEgg);
  if (eggGated.length === 0) return [];
  const foundRows: { key: string }[] = await prisma.easterEggFound.findMany({
    where: { userId, key: { in: eggGated.map((c) => c.requiresEgg as string) } },
    select: { key: true }
  });
  const foundSet = new Set(foundRows.map((f) => f.key));
  return eggGated.filter((c) => foundSet.has(c.requiresEgg as string)).map((c) => c.key);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({
      enabled: [],
      allowedKeys: COSMETICS.filter((c) => !c.requiresPlan && !c.requiresEgg).map((c) => c.key)
    });
  }
  const userId = (session.user as { id: string }).id;
  const [user, { plan }, eggKeys] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { enabledCosmetics: true } }),
    getUserPlan(userId),
    eggAllowedKeys(userId)
  ]);
  const planAllowed = COSMETICS.filter((c) => canUseCosmetic(c, plan)).map((c) => c.key);
  const allowedKeys = [...planAllowed, ...eggKeys];
  return NextResponse.json({ enabled: (user?.enabledCosmetics as string[] | undefined) ?? [], allowedKeys });
}

const bodySchema = z.object({ key: z.string(), enabled: z.boolean() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { key, enabled } = parsed.data;

  const cosmetic = findCosmetic(key);
  if (!cosmetic) return NextResponse.json({ error: "Cosmétique inconnu." }, { status: 400 });

  const userId = (session.user as { id: string }).id;

  if (enabled) {
    // Ne jamais faire confiance au client : le palier requis (ou l'easter
    // egg requis) est revérifié ici, comme pour le thème étoilé animé et les
    // thèmes de couleurs réservés.
    if (cosmetic.requiresEgg) {
      const found = await prisma.easterEggFound.findUnique({
        where: { userId_key: { userId, key: cosmetic.requiresEgg } },
        select: { id: true }
      });
      if (!found) {
        return NextResponse.json(
          { error: `"${cosmetic.label}" doit d'abord être débloqué (easter egg) — voir la page Succès.` },
          { status: 403 }
        );
      }
    } else {
      const { plan } = await getUserPlan(userId);
      if (!canUseCosmetic(cosmetic, plan)) {
        return NextResponse.json(
          { error: `"${cosmetic.label}" nécessite le palier ${cosmetic.requiresPlan}. Passez sur ce palier dans Facturation pour le débloquer.` },
          { status: 403 }
        );
      }
    }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { enabledCosmetics: true } });
  const current: string[] = (user?.enabledCosmetics as string[] | undefined) ?? [];
  const next = enabled ? Array.from(new Set([...current, key])) : current.filter((k) => k !== key);

  await prisma.user.update({ where: { id: userId }, data: { enabledCosmetics: next } });
  return NextResponse.json({ ok: true, enabled: next });
}
