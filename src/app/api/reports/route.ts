import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { assertBrandMembership } from "@/lib/brand-access";
import { getBrandPlan } from "@/lib/billing/plan";
import { prisma } from "@/lib/prisma";
import { getOrCreateBrandReport, computeReportData, computeNextSendAt } from "@/lib/reports";

// GET/PATCH /api/reports?brandId=... — configuration du rapport client
// automatique de la marque active, éditée depuis /reports (voir ce dossier
// pour l'UI). Créé à la volée au premier GET (voir getOrCreateBrandReport),
// comme /api/link-in-bio pour la page "link in bio". Réservé aux paliers
// Pro/Agence (reportsEnabled) — le GET reste accessible pour afficher le
// bandeau de mise à niveau, mais "allowed: false" et aucune donnée métier.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  const { limits } = await getBrandPlan(brandId);
  if (!limits.reportsEnabled) {
    return NextResponse.json({ allowed: false });
  }

  const report = await getOrCreateBrandReport(brandId);
  const preview = await computeReportData(brandId, report.periodDays);

  return NextResponse.json({ allowed: true, report, preview });
}

const bodySchema = z.object({
  brandId: z.string().min(1),
  enabled: z.boolean().optional(),
  periodDays: z.number().int().refine((v) => [7, 30, 90].includes(v), "Période invalide.").optional(),
  recipientEmail: z.string().email().max(200).nullable().optional(),
  frequency: z.enum(["OFF", "WEEKLY", "MONTHLY"]).optional()
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const { brandId, ...data } = parsed.data;

  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  const { limits } = await getBrandPlan(brandId);
  if (!limits.reportsEnabled) {
    return NextResponse.json({ error: "Les rapports clients font partie des paliers payants de Nebula." }, { status: 403 });
  }

  if (data.frequency && data.frequency !== "OFF" && !data.recipientEmail) {
    const existing = await prisma.brandReport.findUnique({ where: { brandId }, select: { recipientEmail: true } });
    if (!existing?.recipientEmail) {
      return NextResponse.json({ error: "Renseignez l'email du destinataire pour activer l'envoi automatique." }, { status: 400 });
    }
  }

  await getOrCreateBrandReport(brandId);

  const current = await prisma.brandReport.findUniqueOrThrow({ where: { brandId } });
  // Reprogramme la prochaine échéance uniquement quand la fréquence change
  // (activation, désactivation, ou changement de cadence) — pas à chaque
  // sauvegarde anodine (ex : juste changer la période affichée).
  const frequencyChanged = data.frequency !== undefined && data.frequency !== current.frequency;
  const nextSendAt = frequencyChanged ? computeNextSendAt(data.frequency!, new Date()) : undefined;

  const report = await prisma.brandReport.update({
    where: { brandId },
    data: {
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.periodDays !== undefined ? { periodDays: data.periodDays } : {}),
      ...(data.recipientEmail !== undefined ? { recipientEmail: data.recipientEmail } : {}),
      ...(data.frequency !== undefined ? { frequency: data.frequency } : {}),
      ...(frequencyChanged ? { nextSendAt } : {})
    }
  });

  return NextResponse.json({ report });
}
