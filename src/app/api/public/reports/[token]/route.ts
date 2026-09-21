import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeReportData } from "@/lib/reports";

// GET /api/public/reports/[token] — consultée par la page publique
// /rapport/[token] (aucune authentification, comme /api/public/approvals/[token]
// et /api/public/link-in-bio/[slug] : le token, déjà unique, sert
// d'identifiant public). Ne renvoie jamais un rapport désactivé, même si son
// contenu existe déjà en base (permet à l'agence de préparer la
// configuration avant de rendre le lien public).
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const report = await prisma.brandReport.findUnique({
    where: { token: params.token },
    select: { brandId: true, enabled: true, periodDays: true }
  });

  if (!report || !report.enabled) {
    return NextResponse.json({ error: "Ce rapport n'existe pas ou n'est plus disponible." }, { status: 404 });
  }

  const [brand, data] = await Promise.all([
    prisma.brand.findUnique({ where: { id: report.brandId }, select: { name: true } }),
    computeReportData(report.brandId, report.periodDays)
  ]);

  return NextResponse.json({
    brandName: brand?.name ?? "Marque",
    data
  });
}
