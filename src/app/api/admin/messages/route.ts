import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerUserId } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// /api/admin/messages — messages du formulaire de contact (29/09/2026).
// Réservé au compte propriétaire (404 sinon, comme les autres pages admin).
//   GET    ?filtre=a-traiter|traites|tous → 200 derniers messages
//   PATCH  { id, handled } → marquer traité / à traiter
//   DELETE { id } → supprimer
export async function GET(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const filter = req.nextUrl.searchParams.get("filtre") ?? "a-traiter";
  const where = filter === "traites" ? { handledAt: { not: null } } : filter === "tous" ? {} : { handledAt: null };
  const [messages, pending] = await Promise.all([
    prisma.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.contactMessage.count({ where: { handledAt: null } })
  ]);
  return NextResponse.json({
    pending,
    messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), handledAt: m.handledAt?.toISOString() ?? null }))
  });
}

const patchSchema = z.object({ id: z.string().min(1).max(64), handled: z.boolean() });

export async function PATCH(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const { count } = await prisma.contactMessage.updateMany({ where: { id: parsed.data.id }, data: { handledAt: parsed.data.handled ? new Date() : null } });
  if (!count) return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string" || !body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await prisma.contactMessage.deleteMany({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
