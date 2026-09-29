import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/plan";
import type { Plan } from "@/lib/plans";
import { aiRefusalResponse, assertAiAllowed, type AiAllowance } from "@/lib/ai/guard";
import { TOOL_SIGNUP_REQUIRED, type ToolKind } from "@/lib/tools/quota";

export interface ToolAccess {
  userId: string;
  plan: Plan;
  /** Autorisation de la porte de l'IA : `allowance.run(() => appel)`. */
  allowance: AiAllowance;
  quota: { limit: number; remaining: number };
}

/**
 * Garde commune des routes de génération des outils de /outils : compte
 * obligatoire (401 `signupRequired`), puis la porte unique de l'IA (adresse
 * confirmée, quota du compte, plafond IP, budget global). Renvoie la
 * réponse d'erreur à retourner telle quelle, ou l'accès accordé.
 */
export async function requireToolAccess(req: NextRequest, kind: ToolKind): Promise<NextResponse | ToolAccess> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: TOOL_SIGNUP_REQUIRED, signupRequired: true }, { status: 401 });
  const info = await getUserPlan(userId);
  const gate = await assertAiAllowed({ userId, plan: info, kind: kind === "thumbnail" ? "image" : "text", source: "tool", headers: req.headers });
  if (!gate.ok) {
    const res = aiRefusalResponse(gate);
    return gate.status === 429 ? NextResponse.json({ ...(await res.json()), quotaReached: true }, { status: 429 }) : res;
  }
  return { userId, plan: info.plan, allowance: gate, quota: { limit: gate.limit ?? 0, remaining: gate.remaining ?? 0 } };
}
