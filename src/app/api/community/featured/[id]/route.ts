import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/owner";
import { removeFeatured } from "@/lib/reussites/featured";

// DELETE /api/community/featured/[id] — retirer une vidéo de la une : son
// créateur, ou le propriétaire du site (droit de retrait, lot C).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const res = await removeFeatured(params.id, { userId, admin: isOwnerEmail(session.user.email) });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
