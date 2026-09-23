import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/public/drafts/[id] — lu par le Composer (session requise) pour
// pré-remplir titre/description/média depuis un outil gratuit ; DELETE une
// fois consommé. Un brouillon expiré n'est jamais servi.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const draft = await prisma.publicDraft.findUnique({ where: { id: params.id } });
  if (!draft || draft.expiresAt < new Date()) return NextResponse.json({ error: "Ce brouillon n'existe plus." }, { status: 404 });
  return NextResponse.json({ id: draft.id, kind: draft.kind, network: draft.network, content: draft.content });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  await prisma.publicDraft.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
