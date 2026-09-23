import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { getBrandPlan } from "@/lib/billing/plan";
import { randomBytes } from "crypto";
import { z } from "zod";

// GET /api/approvals?brandId=... — liens d'approbation client existants
// pour cette marque (palier Agence, voir calendar/page.tsx).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const links = await prisma.approvalLink.findMany({
    where: { brandId, revokedAt: null },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ links });
}

const bodySchema = z.object({ brandId: z.string(), label: z.string().max(80).optional() });

// POST /api/approvals — génère un nouveau lien externe (token secret, comme
// un lien de partage classique) donnant accès en lecture/réponse (sans
// compte Nebula) aux publications à venir de cette marque. Réservé au
// palier Agence, conformément à la demande.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { brandId, label } = parsed.data;
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const { plan } = await getBrandPlan(brandId);
  if (plan !== "AGENCY") {
    return NextResponse.json(
      { error: "Le workflow d'approbation client est réservé au palier Agence." },
      { status: 403 }
    );
  }

  const token = randomBytes(24).toString("hex");
  const link = await prisma.approvalLink.create({
    data: { brandId, token, label: label?.trim() || "Lien client" }
  });

  return NextResponse.json({ ok: true, link });
}
