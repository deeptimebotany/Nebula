import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const MAX_COMPETITORS_PER_BRAND = 3;

// GET /api/competitors?brandId=... — sous-onglet Analytics → "Concurrence" :
// liste les concurrents suivis avec leur historique de relevés (saisis
// manuellement, voir POST /api/competitors/[id]/snapshots — aucune API
// publique ne permettant de récupérer légalement et automatiquement les
// stats d'un compte tiers arbitraire sur ces réseaux).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  const tracks = await prisma.competitorTrack.findMany({
    where: { brandId },
    orderBy: { createdAt: "asc" },
    include: { snapshots: { orderBy: { capturedAt: "asc" } } }
  });

  return NextResponse.json({ tracks });
}

const bodySchema = z.object({
  brandId: z.string(),
  network: z.string(),
  handle: z.string().min(1).max(60),
  label: z.string().max(80).optional()
});

// POST /api/competitors — ajoute un concurrent à suivre (max 3 par marque,
// comme demandé). Ne crée aucun relevé initial : le premier relevé
// (abonnés constatés) est ajouté ensuite via l'UI.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { brandId, network, handle, label } = parsed.data;

  const count = await prisma.competitorTrack.count({ where: { brandId } });
  if (count >= MAX_COMPETITORS_PER_BRAND) {
    return NextResponse.json(
      { error: `Limite de ${MAX_COMPETITORS_PER_BRAND} concurrents suivis par marque atteinte.` },
      { status: 403 }
    );
  }

  const track = await prisma.competitorTrack.create({
    data: { brandId, network, handle: handle.trim(), label: label?.trim() || null }
  });

  return NextResponse.json({ ok: true, track: { ...track, snapshots: [] } });
}
