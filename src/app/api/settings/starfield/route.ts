import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getUserPlan } from "@/lib/billing/plan";
import { isOwnerEmail, resolvePreviewPlan } from "@/lib/dev-preview";

// Toujours réévalué à la demande, jamais mis en cache (statiquement au build
// ou par un intermédiaire) — `allowed` doit refléter le palier réel au
// moment de l'appel, pas une réponse figée.
export const dynamic = "force-dynamic";

// GET/PATCH /api/settings/starfield — thème étoilé animé (easter egg),
// réservé aux paliers Pro et Agence. Même schéma que /api/settings/theme et
// /api/settings/background, avec une nuance : `allowed` reflète le PALIER
// ACTUEL (revérifié à chaque GET), pas seulement la préférence enregistrée —
// ainsi l'effet disparaît automatiquement si le compte redescend un jour sur
// le palier Gratuit, sans qu'on ait besoin de toucher à `starfieldEnabled`.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ enabled: false, allowed: false }, { status: 200 });
  const userId = (session.user as { id: string }).id;
  const isOwner = isOwnerEmail(session.user.email);
  const previewPlan = isOwner ? resolvePreviewPlan(session.user.email) : null;

  const [user, { plan: realPlan }] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { starfieldEnabled: true } }),
    getUserPlan(userId)
  ]);
  // Compte propriétaire, aucun aperçu de palier choisi : toujours autorisé
  // (mode "tout déverrouillé", voir dev-preview.ts) ; un aperçu actif suit ce
  // palier simulé exactement comme un vrai compte.
  const plan = isOwner && !previewPlan ? "AGENCY" : (previewPlan ?? realPlan);
  const allowed = plan === "PRO" || plan === "AGENCY";
  return NextResponse.json({ enabled: Boolean(user?.starfieldEnabled), allowed });
}

const bodySchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  const isOwner = isOwnerEmail(session.user.email);
  const previewPlan = isOwner ? resolvePreviewPlan(session.user.email) : null;
  const skipChecks = isOwner && !previewPlan;

  if (parsed.data.enabled && !skipChecks) {
    // Ne jamais faire confiance au client : le thème étoilé reste réservé
    // aux paliers Pro et Agence, revérifié ici comme pour les thèmes de
    // couleurs réservés (voir /api/settings/theme).
    const plan = previewPlan ?? (await getUserPlan(userId)).plan;
    if (plan !== "PRO" && plan !== "AGENCY") {
      return NextResponse.json(
        {
          error:
            "Le thème étoilé animé nécessite le palier Pro ou Agence. Passez sur ce palier dans Facturation pour le débloquer."
        },
        { status: 403 }
      );
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { starfieldEnabled: parsed.data.enabled } });
  return NextResponse.json({ ok: true });
}
