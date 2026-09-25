import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { assertBrandMembership } from "@/lib/link-in-bio";
import { linkUrlSchema } from "@/lib/safe-url-schema";
import { invalidateLinkPage } from "@/lib/link-in-bio-cache";

// PATCH/DELETE /api/link-in-bio/links/[id] — édite ou supprime un lien
// précis. L'appartenance à la marque de l'utilisateur connecté est
// revérifiée via linkPage.brandId (jamais faire confiance à un brandId
// envoyé par le client pour ces routes-ci : l'id du lien fait déjà foi).
async function resolveOwnedLink(id: string, userId: string) {
  const link = await prisma.linkItem.findUnique({ where: { id }, include: { linkPage: true } });
  if (!link) return null;
  const allowed = await assertBrandMembership(userId, link.linkPage.brandId);
  return allowed ? link : null;
}

const patchSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  url: linkUrlSchema(500).optional(),
  enabled: z.boolean().optional()
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const link = await resolveOwnedLink(params.id, userId);
  if (!link) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const updated = await prisma.linkItem.update({ where: { id: params.id }, data: parsed.data });
  await invalidateLinkPage(link.linkPage.brandId);
  return NextResponse.json({ ok: true, link: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const link = await resolveOwnedLink(params.id, userId);
  if (!link) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });

  await prisma.linkItem.delete({ where: { id: params.id } });
  await invalidateLinkPage(link.linkPage.brandId);
  return NextResponse.json({ ok: true });
}
