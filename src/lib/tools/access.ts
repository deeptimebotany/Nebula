import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/plan";
import type { Plan } from "@/lib/plans";
import { consumeToolQuota, toolQuotaMessage, TOOL_SIGNUP_REQUIRED, type ToolKind, type ToolQuota } from "@/lib/tools/quota";

export interface ToolAccess {
  userId: string;
  plan: Plan;
  quota: ToolQuota;
}

/**
 * Garde commune des routes de génération des outils de /outils : compte
 * obligatoire (401 `signupRequired`), puis quota du jour (429). Renvoie la
 * réponse d'erreur à retourner telle quelle, ou l'accès accordé.
 */
export async function requireToolAccess(req: NextRequest, kind: ToolKind): Promise<NextResponse | ToolAccess> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: TOOL_SIGNUP_REQUIRED, signupRequired: true }, { status: 401 });
  const { plan } = await getUserPlan(userId);
  const quota = await consumeToolQuota(req, userId, plan, kind);
  if (!quota.ok) return NextResponse.json({ error: toolQuotaMessage(plan, kind, quota), quotaReached: true, plan }, { status: 429 });
  return { userId, plan, quota };
}
