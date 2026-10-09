import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBrandMembership } from "@/lib/brand-access";
import { connectionLimitState } from "@/lib/billing/connection-limit";
import { disconnectConnection } from "@/lib/social/revoke";

export const dynamic = "force-dynamic";

// Fenêtre « Trop de comptes connectés » (09/10/2026, voir
// src/lib/billing/connection-limit.ts et connection-limit-gate.tsx).
//
// GET  ?brandId=…  → comptes de la marque, limite du palier, comptes proposés.
// POST { brandId, connectionIds } → déconnecte ces comptes (jetons effacés,
//      accès retiré chez le réseau, données YouTube effacées, comme le bouton
//      « Déconnecter »), puis renvoie le nouvel état.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;
  return NextResponse.json(await connectionLimitState(brandId), { headers: { "Cache-Control": "no-store" } });
}

const bodySchema = z.object({
  brandId: z.string().min(1),
  connectionIds: z.array(z.string().min(1)).min(1).max(50)
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choisissez au moins un compte à déconnecter." }, { status: 400 });
  const { brandId, connectionIds } = parsed.data;
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  // Seulement des comptes de CETTE marque, encore reliés.
  const targets = await prisma.socialConnection.findMany({
    where: { id: { in: connectionIds }, brandId, status: { not: "DISCONNECTED" } },
    select: { id: true }
  });
  if (targets.length === 0) return NextResponse.json({ error: "Ces comptes sont déjà déconnectés." }, { status: 400 });
  for (const t of targets) await disconnectConnection(t.id);
  return NextResponse.json({ disconnected: targets.length, state: await connectionLimitState(brandId) });
}
