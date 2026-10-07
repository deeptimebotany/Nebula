import { NextResponse } from "next/server";
import { requireOwnerUserId } from "@/lib/admin";
import { diagnoseGemini } from "@/lib/ai/gemini";

// POST /api/admin/ia/diagnostic — « Tester la connexion à Gemini » (page
// /admin/ia, 07/10/2026) : deux appels courts avec la clé et le modèle de CE
// déploiement, pour savoir pourquoi l'IA échoue (clé refusée, modèle
// introuvable, crédits épuisés, Google qui ne répond pas…). Compte
// propriétaire uniquement (404 sinon). La clé n'est jamais renvoyée : ses
// 4 derniers caractères seulement, pour la reconnaître dans AI Studio.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(await diagnoseGemini(), { headers: { "Cache-Control": "no-store" } });
}
