import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteEngagementItem } from "@/lib/engagement/actions";

// DELETE /api/engagement/[id] — supprime un commentaire reçu sur le réseau
// (Instagram, Facebook ; 10/10/2026), puis dans Nebula. Définitif.
export const maxDuration = 30;

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const outcome = await deleteEngagementItem((session.user as { id: string }).id, params.id);
  if (!outcome.ok) {
    const { status, ...rest } = outcome;
    return NextResponse.json(rest, { status });
  }
  return NextResponse.json(outcome);
}
