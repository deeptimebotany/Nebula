import { hasUnlockKey } from "@/lib/reussites/unlocks";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { BACKGROUNDS, DEFAULT_BACKGROUND_KEY, canUseBackground, resolveBackgroundKey } from "@/lib/backgrounds";
import { getUserPlan } from "@/lib/billing/plan";
import { isOwnerEmail, ownerUnlocksAll, resolvePreviewPlan } from "@/lib/dev-preview";

// GET/PATCH /api/settings/background — même logique que /api/settings/theme
// (voir ce fichier), pour le fond d'écran choisi dans Paramètres. Depuis
// l'ajout des fonds animés de palier (voir requiresPlan dans
// src/lib/backgrounds.ts), on revérifie aussi le palier au PATCH.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ background: null }, { status: 200 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { backgroundPreference: true } });
  return NextResponse.json({ background: resolveBackgroundKey(user?.backgroundPreference ?? DEFAULT_BACKGROUND_KEY) });
}

const bodySchema = z.object({ background: z.string() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const background = BACKGROUNDS.find((b) => b.key === parsed.data.background);
  if (!background) {
    return NextResponse.json({ error: "Fond d'écran inconnu." }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;
  const isOwner = isOwnerEmail(session.user.email);
  // Voir /api/settings/cosmetics pour le même raisonnement : bypass complet
  // seulement en mode "tout déverrouillé" (aucun aperçu de palier choisi).
  const previewPlan = isOwner ? resolvePreviewPlan(session.user.email) : null;
  const skipChecks = ownerUnlocksAll(session.user.email);

  if (skipChecks) {
    await prisma.user.update({ where: { id: userId }, data: { backgroundPreference: parsed.data.background } });
    return NextResponse.json({ ok: true });
  }

  if (background.requiresPlan) {
    const plan = previewPlan ?? (await getUserPlan(userId)).plan;
    if (!canUseBackground(background, plan)) {
      return NextResponse.json(
        { error: `Le fond "${background.label}" nécessite le palier ${background.requiresPlan}. Passez sur ce palier dans Facturation pour le débloquer.` },
        { status: 403 }
      );
    }
  } else if (background.requiresEgg) {
    // Fond débloqué par easter egg plutôt que par palier (voir
    // src/lib/backgrounds.ts) — jamais confiance au client.
    // Easter egg ou récompense Réussites (clé « ach:* »).
    if (!(await hasUnlockKey(userId, background.requiresEgg))) {
      return NextResponse.json(
        { error: `Le fond "${background.label}" doit d'abord être débloqué — voir la page Réussites.` },
        { status: 403 }
      );
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { backgroundPreference: parsed.data.background } });
  return NextResponse.json({ ok: true });
}
