import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteIntegration } from "@/lib/integrations/oauth-accounts";

// DELETE /api/integrations/canva — délier le compte (les médias déjà importés restent).
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  await deleteIntegration((session.user as { id: string }).id, "canva");
  return NextResponse.json({ ok: true });
}
