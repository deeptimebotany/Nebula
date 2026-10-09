import { NextRequest, NextResponse } from "next/server";
import { unsubscribeMonthlySummary, verifySummaryUnsubscribeToken } from "@/lib/monthly-summary/send";

// Désinscription du bilan du mois (03/10/2026), sans connexion :
//  - GET : page de confirmation avec un bouton (un antivirus qui ouvre les
//    liens d'un e-mail ne désinscrit donc personne par erreur) ;
//  - POST : désinscription. Gmail et Yahoo l'envoient directement depuis leur
//    bouton « Se désabonner » (en-têtes List-Unsubscribe, RFC 8058).
function page(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Nebula</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#05070f;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><main style="max-width:440px;padding:32px;text-align:center"><h1 style="font-size:20px;margin:0 0 12px">${title}</h1>${body}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

const muted = (text: string) => `<p style="color:#9ca3af;font-size:14px;line-height:1.5;margin:0">${text}</p>`;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!verifySummaryUnsubscribeToken(token)) return page("Lien invalide", muted("Ce lien de désinscription n'est pas valide ou a été altéré."), 400);
  const action = `/api/email/bilan/unsubscribe?token=${encodeURIComponent(token)}`;
  return page(
    "Ne plus recevoir le bilan du mois ?",
    `${muted("Vous ne recevrez plus le bilan mensuel de vos réseaux. Vous pourrez le réactiver à tout moment dans Paramètres → Notifications.")}
<form method="post" action="${action.replace(/"/g, "&quot;")}" style="margin-top:20px"><button type="submit" style="background:#8646ff;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer">Me désinscrire</button></form>`
  );
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const userId = verifySummaryUnsubscribeToken(token);
  if (!userId) return page("Lien invalide", muted("Ce lien de désinscription n'est pas valide ou a été altéré."), 400);
  await unsubscribeMonthlySummary(userId);
  return page("C'est noté", muted("Vous ne recevrez plus le bilan du mois. Vos chiffres restent dans Nebula, page Analytics → Bilan du mois."));
}
