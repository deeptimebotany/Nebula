// Session des routes internes de la page Automatisations (lot 4).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasApiAccess } from "./access";

export async function automationSession(requireAccess: boolean): Promise<{ ok: true; userId: string; access: boolean } | { ok: false; res: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, res: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  const userId = (session.user as { id: string }).id;
  const access = await hasApiAccess(userId);
  if (requireAccess && !access) {
    return { ok: false, res: NextResponse.json({ error: "L'API et les webhooks sont réservés au palier Agence.", reason: "plan_required" }, { status: 402 }) };
  }
  return { ok: true, userId, access };
}
