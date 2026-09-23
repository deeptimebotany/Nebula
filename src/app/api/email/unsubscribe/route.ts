import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/emails/lifecycle";

// GET /api/email/unsubscribe?token= — lien « ne plus recevoir ces conseils »
// des emails de cycle de vie (jeton signé, brief growth lot G3). Désactive
// User.lifecycleEmails pour l'adresse ; pour un lead sans compte, retire le
// consentement de ses lignes ToolLead. Répond par une page HTML minimale
// (pas de session nécessaire).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const email = verifyUnsubscribeToken(token);
  const page = (title: string, body: string, status = 200) =>
    new NextResponse(
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Nebula</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#05070f;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><main style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:20px;margin:0 0 12px">${title}</h1><p style="color:#9ca3af;font-size:14px;line-height:1.5;margin:0">${body}</p></main></body></html>`,
      { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  if (!email) return page("Lien invalide", "Ce lien de désinscription n'est pas valide ou a été altéré.", 400);

  await prisma.user.updateMany({ where: { email }, data: { lifecycleEmails: false } });
  await prisma.toolLead.updateMany({ where: { email }, data: { consent: false } });
  return page("C'est noté", "Vous ne recevrez plus nos emails de conseils. Les informations de service liées à votre compte (essai, facturation) continuent d'arriver.");
}
