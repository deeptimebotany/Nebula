import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ consent: z.boolean() });

// PUT /api/settings/stats-consent { consent } — accord facultatif aux
// statistiques de groupe anonymes (29/09/2026), donné ou retiré depuis
// Paramètres → Compte. La date du choix est gardée (preuve du consentement,
// RGPD). Un retrait vaut pour tous les calculs suivants.
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choix invalide." }, { status: 400 });
  const at = new Date();
  await prisma.user.update({ where: { id: userId }, data: { statsConsent: parsed.data.consent, statsConsentAt: at } });
  return NextResponse.json({ ok: true, statsConsent: parsed.data.consent, statsConsentAt: at.toISOString() });
}
