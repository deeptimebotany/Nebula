import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { takeCelebrations } from "@/lib/reussites/view";

export const dynamic = "force-dynamic";

// POST /api/reussites/celebrations — déblocages récents pas encore fêtés à
// l'écran (carte + confettis), marqués comme montrés à la lecture. POST :
// l'appel modifie l'état, il ne doit pas être mis en cache ni préchargé.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const items = await takeCelebrations((session.user as { id: string }).id);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
