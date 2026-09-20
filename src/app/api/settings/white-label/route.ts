import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/billing/plan";
import { z } from "zod";

// Marque blanche (palier Agence) — voir topnav.tsx, qui affiche ces champs à
// la place de "Nebula"/du logo par défaut quand ils sont renseignés.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ brandName: null, logoUrl: null }, { status: 200 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { whiteLabelBrandName: true, whiteLabelLogoUrl: true }
  });
  return NextResponse.json({ brandName: user?.whiteLabelBrandName ?? null, logoUrl: user?.whiteLabelLogoUrl ?? null });
}

const bodySchema = z.object({
  brandName: z.string().max(40).nullable().optional(),
  logoUrl: z.string().url().nullable().optional()
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const { plan } = await getUserPlan(userId);
  if (plan !== "AGENCY") {
    return NextResponse.json({ error: "La marque blanche est réservée au palier Agence." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(parsed.data.brandName !== undefined ? { whiteLabelBrandName: parsed.data.brandName || null } : {}),
      ...(parsed.data.logoUrl !== undefined ? { whiteLabelLogoUrl: parsed.data.logoUrl || null } : {})
    }
  });

  return NextResponse.json({ ok: true });
}
