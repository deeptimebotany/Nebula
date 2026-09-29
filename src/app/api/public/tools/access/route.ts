import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/plan";
import { isAiEnabled } from "@/lib/ai/gemini";
import { toolQuotaStatus } from "@/lib/tools/quota";

// GET /api/public/tools/access — ce que la page d'un outil de /outils doit
// afficher (29/09/2026) : démo sans IA pour un visiteur, vraie génération
// pour un compte, avec les générations restantes aujourd'hui. Les pages de
// /outils sont pré-générées (vitrine) : elles ne connaissent la session
// qu'en appelant cette route depuis le navigateur.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "private, no-store" } });
  const { plan } = await getUserPlan(userId);
  const quota = await toolQuotaStatus(userId, plan);
  return NextResponse.json({ signedIn: true, plan, aiEnabled: isAiEnabled(), quota }, { headers: { "Cache-Control": "private, no-store" } });
}
