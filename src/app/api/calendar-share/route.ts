import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { assertBrandMembership } from "@/lib/brand-access";
import { getBrandPlan } from "@/lib/billing/plan";
import { prisma } from "@/lib/prisma";
import { getOrCreateCalendarShare, computeUpcomingPosts } from "@/lib/calendar-share";

// GET/PATCH /api/calendar-share?brandId=... — configuration du calendrier
// client public de la marque active, éditée depuis /calendar-share (voir ce
// dossier pour l'UI). Créé à la volée au premier GET, comme /api/reports
// pour les rapports clients. Réservé aux paliers Pro/Agence
// (calendarShareEnabled) — le GET reste accessible pour afficher le bandeau
// de mise à niveau, mais "allowed: false" et aucune donnée métier.
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
  if (!limits.calendarShareEnabled) {
    return NextResponse.json({ allowed: false });
  }

  const share = await getOrCreateCalendarShare(brandId);
  const posts = await computeUpcomingPosts(brandId, share.windowDays);

  return NextResponse.json({ allowed: true, share, posts });
}

const bodySchema = z.object({
  brandId: z.string().min(1),
  enabled: z.boolean().optional(),
  windowDays: z.number().int().refine((v) => [14, 30, 60].includes(v), "Fenêtre invalide.").optional()
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
  if (!limits.calendarShareEnabled) {
    return NextResponse.json({ error: "Le calendrier client fait partie des paliers payants de Nebula." }, { status: 403 });
  }

  await getOrCreateCalendarShare(brandId);

  const share = await prisma.calendarShare.update({
    where: { brandId },
    data: {
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.windowDays !== undefined ? { windowDays: data.windowDays } : {})
    }
  });

  return NextResponse.json({ share });
}
