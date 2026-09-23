import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";

const bodySchema = z
  .object({
    name: z.string().trim().min(2, "Nom invalide (2 caractères minimum).").max(80, "Nom trop long.").optional(),
    timezone: z.string().refine(isValidTimeZone, "Fuseau horaire inconnu.").optional()
  })
  .refine((b) => b.name !== undefined || b.timezone !== undefined, { message: "Rien à modifier." });

// PATCH /api/brands/[id] { name?, timezone? } — renomme une marque et/ou
// change son fuseau horaire de programmation (voir src/lib/timezone.ts).
// Réservé aux membres de la marque (n'importe quel rôle peut modifier, à
// la différence de la création qui suit le quota d'abonnement).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides." }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;
  const membership = await prisma.membership.findUnique({
    where: { userId_brandId: { userId, brandId: params.id } }
  });
  if (!membership) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

  const brand = await prisma.brand.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.timezone !== undefined ? { timezone: parsed.data.timezone } : {})
    }
  });
  // Nom de la marque = titre de sa Page bio (décision du 24/09/2026) : les
  // deux restent synchronisés dans les deux sens (voir /api/link-in-bio).
  if (parsed.data.name !== undefined) {
    await prisma.linkPage.updateMany({ where: { brandId: params.id }, data: { title: parsed.data.name } }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, brand });
}
