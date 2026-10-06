import { NextRequest, NextResponse } from "next/server";
import { requireOwnerUserId } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { loadMonthlySummary } from "@/lib/monthly-summary/data";
import { renderSummaryEmail } from "@/lib/monthly-summary/email";
import { isMonthKey } from "@/lib/monthly-summary/period";
import { summaryLinks } from "@/lib/monthly-summary/send";

// GET /api/admin/monthly-summary?brandId=…&month=2026-09 — aperçu de l'e-mail
// « bilan du mois » d'une marque, tel qu'il partirait (propriétaire du site
// seulement, 404 sinon). Les Réussites affichées sont celles du propriétaire
// de la marque.
export async function GET(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!brandId || !isMonthKey(month)) return NextResponse.json({ error: "brandId et month (AAAA-MM) requis" }, { status: 400 });
  const owner = await prisma.membership.findFirst({ where: { brandId, role: "OWNER" }, orderBy: { id: "asc" }, select: { userId: true } });
  if (!owner) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
  const data = await loadMonthlySummary(brandId, month, { userId: owner.userId, withReussites: true });
  if (!data) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
  if (req.nextUrl.searchParams.get("format") === "json") return NextResponse.json(data);
  const { html } = renderSummaryEmail(data, summaryLinks(owner.userId, brandId, month));
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
