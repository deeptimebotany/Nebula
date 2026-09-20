import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/premium/reactions — liste le pack d'emojis exclusifs Premium déjà
// généré (voir POST .../generate). Visible par tout compte connecté (pour
// afficher le pack, même verrouillé/grisé, aux comptes Gratuit à titre
// d'aperçu) — seule l'ÉCRITURE d'une réaction exclusive est réservée aux
// membres Premium, vérifiée dans /api/community/reactions.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const reactions = await prisma.premiumReaction.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ reactions });
}
