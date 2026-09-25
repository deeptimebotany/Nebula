import { NextResponse } from "next/server";
import { ensureAdvice } from "@/lib/audit/run";

// POST /api/public/audit/<jeton>/advice — trois paragraphes de conseils
// écrits par Gemini à partir des faits du rapport, une seule fois par
// rapport (2 essais au plus, jamais d'appels répétés). Demandé par la page
// du rapport après son affichage : le rapport n'attend jamais l'IA.
export const maxDuration = 60;

const MESSAGES = {
  missing: "Rapport introuvable.",
  not_configured: "Les conseils écrits par l'IA ne sont pas activés sur ce site.",
  unavailable: "Les conseils de l'IA ne sont pas disponibles pour ce rapport : les recommandations ci-dessus restent valables.",
  busy: "L'IA est très demandée en ce moment : rechargez la page dans quelques minutes."
} as const;

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const outcome = await ensureAdvice(params.token);
  if (!outcome.ok) return NextResponse.json({ error: MESSAGES[outcome.reason], reason: outcome.reason }, { status: outcome.status });
  return NextResponse.json({ advice: outcome.advice });
}
