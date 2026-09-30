import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/plan";
import { isAiEnabled } from "@/lib/ai/gemini";
import { aiQuotaSnapshot } from "@/lib/ai/guard";

// GET /api/public/tools/access — ce que la page d'un outil de /outils doit
// afficher (29/09/2026) : démo sans IA pour un visiteur, vraie génération
// pour un compte, avec ce qu'il reste (textes : aujourd'hui ; miniatures :
// ce mois-ci ou pendant l'essai, aucune en Gratuit depuis le 30/09/2026 —
// quotas de la porte unique de l'IA). Les pages de /outils sont pré-générées
// (vitrine) : elles ne connaissent la session qu'en appelant cette route.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "private, no-store" } });
  const info = await getUserPlan(userId);
  const snap = await aiQuotaSnapshot(userId, info);
  const quota = {
    text: { limit: snap.text.limit, remaining: snap.text.remaining },
    thumbnail: { limit: snap.image.limit, remaining: snap.image.remaining, per: snap.image.per }
  };
  return NextResponse.json({ signedIn: true, plan: info.plan, aiEnabled: isAiEnabled(), quota }, { headers: { "Cache-Control": "private, no-store" } });
}
