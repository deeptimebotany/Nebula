import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/owner";
import { currentFeatured } from "@/lib/reussites/featured";

export const dynamic = "force-dynamic";

// GET /api/community/featured — « À la une » de la Communauté (Réussites v2,
// lot C) : 3 vidéos déjà partagées par des créateurs d'accord, 7 jours
// chacune. `canRemove` : le créateur de la vidéo, ou le propriétaire du site.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const owner = isOwnerEmail(session.user.email);
  const featured = await currentFeatured();
  return NextResponse.json(
    { featured: featured.map((f) => ({ ...f, canRemove: f.source !== "auto" && (owner || f.author.id === userId) })) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
