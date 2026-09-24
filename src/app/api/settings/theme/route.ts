import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { THEMES, canUseTheme } from "@/lib/themes";
import { getUserPlan } from "@/lib/billing/plan";
import { isOwnerEmail, ownerUnlocksAll, resolvePreviewPlan } from "@/lib/dev-preview";

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
  const theme = THEMES.find((t) => t.key === parsed.data.theme);
  if (!theme) {
    return NextResponse.json({ error: "Thème inconnu." }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;
  const isOwner = isOwnerEmail(session.user.email);
  // Compte propriétaire (voir dev-preview.ts) : mêmes deux modes que pour
  // les cosmétiques/fonds d'écran — tout déverrouillé par défaut, ou
  // revérifié contre le palier choisi si un aperçu est actif.
  const previewPlan = isOwner ? resolvePreviewPlan(session.user.email) : null;
  const skipChecks = ownerUnlocksAll(session.user.email);

  // Ne jamais faire confiance au client pour les thèmes réservés à un palier
  // (voir requiresPlan dans src/lib/themes.ts) : on revérifie ici.
  if (theme.requiresPlan && !skipChecks) {
    const plan = previewPlan ?? (await getUserPlan(userId)).plan;
    if (!canUseTheme(theme, plan)) {
      return NextResponse.json(
        { error: `Le thème "${theme.label}" nécessite le palier ${theme.requiresPlan}. Passez sur ce palier dans Facturation pour le débloquer.` },
        { status: 403 }
      );
    }
  }

  // Thème easter egg (Nova) : seulement si l'egg a vraiment été trouvé.
  if (theme.requiresEgg && !skipChecks) {
    const found = await prisma.easterEggFound.findUnique({ where: { userId_key: { userId, key: theme.requiresEgg } }, select: { id: true } });
    if (!found) return NextResponse.json({ error: `Le thème "${theme.label}" se débloque en trouvant son easter egg.` }, { status: 403 });
  }

  await prisma.user.update({ where: { id: userId }, data: { themePreference: parsed.data.theme } });
  return NextResponse.json({ ok: true });
}
