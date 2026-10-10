import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadMemberProfile } from "@/lib/community/member-profile";

// GET /api/community/members/<pseudo ou identifiant> — profil public d'un
// membre (bulle et page de profil, 10/10/2026). Réservé aux membres connectés.
export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const profile = await loadMemberProfile(params.key);
  if (!profile) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });
  return NextResponse.json({ profile }, { headers: { "Cache-Control": "private, max-age=30" } });
}
