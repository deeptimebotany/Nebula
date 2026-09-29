import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBrandMembership } from "@/lib/brand-access";
import { composerDraftSchema } from "@/lib/composer-draft-schema";

// /api/composer/draft — brouillon du Composer enregistré dans le compte
// (29/09/2026 : avant, seulement dans le navigateur, perdu d'un appareil à
// l'autre). Un brouillon par compte et par marque ; membre de la marque
// obligatoire (404 sinon).
//   GET    ?brandId=… → { draft | null }
//   PUT    { brandId, draft } → enregistre
//   DELETE ?brandId=… → efface (publication envoyée, texte vidé)
async function userIdOf(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;
  const row = await prisma.composerDraft.findUnique({ where: { userId_brandId: { userId, brandId } }, select: { data: true } });
  const parsed = row ? composerDraftSchema.safeParse(row.data) : null;
  return NextResponse.json({ draft: parsed?.success ? parsed.data : null }, { headers: { "Cache-Control": "private, no-store" } });
}

const putSchema = z.object({ brandId: z.string().min(1).max(64), draft: composerDraftSchema });

export async function PUT(req: NextRequest) {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Brouillon invalide." }, { status: 400 });
  const { brandId, draft } = parsed.data;
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;
  await prisma.composerDraft.upsert({
    where: { userId_brandId: { userId, brandId } },
    update: { data: draft },
    create: { userId, brandId, data: draft }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  await prisma.composerDraft.deleteMany({ where: { userId, brandId } });
  return NextResponse.json({ ok: true });
}
