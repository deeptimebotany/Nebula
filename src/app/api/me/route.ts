import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMe } from "@/lib/me";

// Toujours réévalué à la demande : le palier et les droits d'apparence
// doivent refléter l'état réel au moment de l'appel.
export const dynamic = "force-dynamic";

// GET /api/me — « bootstrap » de l'application connectée : TOUT ce que le
// shell et les fournisseurs de préférences ont besoin de savoir au
// démarrage, en UNE requête (calcul : src/lib/me.ts, partagé avec le layout
// qui le prépare dès le premier affichage depuis le lot 10). Avant, l'ouverture du tableau de
// bord déclenchait sept appels séparés (thème, fond, mode, thème étoilé,
// cosmétiques, palier, marque blanche) qui répétaient chacun la vérification
// de session et la lecture du même enregistrement User.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const body = await buildMe(session);
  if (!body) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

// PATCH /api/me { avatarUrl } — photo de profil choisie dans « Mon profil »
// (envoyée d'abord via /api/media/thumbnails/upload). null = retirer.
const patchSchema = z.object({ avatarUrl: z.string().url().max(2048).nullable() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Photo invalide." }, { status: 400 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: parsed.data.avatarUrl }, select: { avatarUrl: true } });
  return NextResponse.json({ avatarUrl: user.avatarUrl ?? null });
}
