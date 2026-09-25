import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicAppUrl } from "@/lib/account-security";
import { toolPathFor, verifyLeadSignature } from "@/lib/tool-leads";

export const dynamic = "force-dynamic";

// GET /api/public/tools/lead/confirm?id=…&sig=… — lien de l'e-mail
// « Confirmez votre inscription aux conseils » (double confirmation, voir
// src/lib/tool-leads.ts). Lien signé : impossible à fabriquer pour une autre
// inscription.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  const base = publicAppUrl();
  if (!id || !sig || id.length > 64 || !verifyLeadSignature(id, sig)) {
    return NextResponse.redirect(`${base}/outils?inscription=lien-invalide`);
  }
  const lead = await prisma.toolLead.findUnique({ where: { id }, select: { id: true, tool: true, confirmedAt: true } });
  if (!lead) return NextResponse.redirect(`${base}/outils?inscription=lien-invalide`);
  if (!lead.confirmedAt) await prisma.toolLead.update({ where: { id }, data: { confirmedAt: new Date() } });
  return NextResponse.redirect(`${base}${toolPathFor(lead.tool)}?inscription=confirmee`);
}
