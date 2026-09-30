import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteCommunityContent } from "@/lib/community/moderation";

// DELETE /api/community/videos/[id] — retire un lien partagé : son auteur, ou
// le propriétaire du site (modération, 30/09/2026).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const result = await deleteCommunityContent({ userId: (session.user as { id: string }).id, email: session.user.email }, "VIDEO", params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
