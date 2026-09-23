import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { assertBrandMembership } from "@/lib/brand-access";
import { getBrandPlan } from "@/lib/billing/plan";
import { prisma } from "@/lib/prisma";
import { getOrCreateBrandReport, computeReportData } from "@/lib/reports";
import { sendReportEmail } from "@/lib/email";

// POST /api/reports/send-test — envoie immédiatement un email de rapport à
// l'adresse indiquée, sans toucher à la programmation automatique
// (lastSentAt/nextSendAt restent inchangés) : sert uniquement à vérifier que
// l'email arrive bien et que le rendu est correct avant d'activer l'envoi
// périodique depuis /reports.
const bodySchema = z.object({
  brandId: z.string().min(1),
  recipientEmail: z.string().email().max(200)
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  const { brandId, recipientEmail } = parsed.data;

  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  const { limits } = await getBrandPlan(brandId);
  if (!limits.reportsEnabled) {
    return NextResponse.json({ error: "Les rapports clients font partie des paliers payants de Nebula.", reason: "reports" }, { status: 403 });
  }

  const report = await getOrCreateBrandReport(brandId);
  const [data, brand] = await Promise.all([
    computeReportData(brandId, report.periodDays),
    prisma.brand.findUnique({ where: { id: brandId }, select: { name: true, slug: true } })
  ]);

  const baseUrl = process.env.NEXTAUTH_URL || "";
  const result = await sendReportEmail({
    to: recipientEmail,
    brandName: brand?.name || "Votre marque",
    reportUrl: `${baseUrl}/rapport/${report.token}`,
    periodLabel: "de test",
    followers: data.totals.followers,
    followersDelta: data.totals.followersDelta,
    brandSlug: brand?.slug ?? null
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Envoi impossible." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
