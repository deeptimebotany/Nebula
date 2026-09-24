import { hasUnlockKey } from "@/lib/reussites/unlocks";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getUserPlan } from "@/lib/billing/plan";
import { COSMETICS, canUseCosmetic, findCosmetic } from "@/lib/cosmetics";
import { isOwnerEmail, ownerUnlocksAll, resolvePreviewPlan } from "@/lib/dev-preview";
import { getAppearanceAccess } from "@/lib/appearance-access";

// Toujours réévalué à la demande — même raison que /api/settings/starfield :
// `allowedKeys` doit refléter le palier réel au moment de l'appel.
export const dynamic = "force-dynamic";

// GET/PATCH /api/settings/cosmetics — contenu visuel/sonore débloqué par
// palier OU par easter egg trouvé (voir src/lib/cosmetics.ts), affiché dans
// Paramètres → Cosmétiques. `allowedKeys` liste les clés que ce compte peut
// activer maintenant, quelle que soit la voie (les autres restent visibles
// mais verrouillées côté UI, comme pour les thèmes réservés) ; `enabled`
// liste celles effectivement activées par la personne.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({
      enabled: [],
      allowedKeys: COSMETICS.filter((c) => !c.requiresPlan && !c.requiresEgg).map((c) => c.key)
    });
  }
  const userId = (session.user as { id: string }).id;
  // Droits calculés par la même fonction que /api/me (voir
  // src/lib/appearance-access.ts) : palier réel, ou « tout déverrouillé »
  // pour le compte propriétaire sans aperçu de palier, ou le palier simulé.
  const [user, access] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { enabledCosmetics: true } }),
    getAppearanceAccess(userId, session.user.email)
  ]);
  return NextResponse.json({
    enabled: (user?.enabledCosmetics as string[] | undefined) ?? [],
    allowedKeys: access.cosmeticsAllowedKeys,
    previewPlan: access.previewPlan
  });
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
  const isOwner = isOwnerEmail(session.user.email);
  // Bypass complet seulement en mode "tout déverrouillé" (voir GET
  // ci-dessus) — dès qu'un aperçu de palier est choisi, ce compte est
  // revérifié comme n'importe quel autre pour les cosmétiques de palier.
  const previewPlan = isOwner ? resolvePreviewPlan(session.user.email) : null;
  const skipChecks = ownerUnlocksAll(session.user.email);

  if (enabled && !skipChecks) {
    // Ne jamais faire confiance au client : le palier requis (ou l'easter
    // egg requis) est revérifié ici, comme pour le thème étoilé animé et les
    // thèmes de couleurs réservés.
    if (cosmetic.requiresEgg) {
      if (!(await hasUnlockKey(userId, cosmetic.requiresEgg))) {
        return NextResponse.json(
          { error: `"${cosmetic.label}" doit d'abord être débloqué — voir la page Réussites.` },
          { status: 403 }
        );
      }
    } else {
      const plan = previewPlan ?? (await getUserPlan(userId)).plan;
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
