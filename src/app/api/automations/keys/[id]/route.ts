import { NextRequest, NextResponse } from "next/server";
import { apiKeyDb } from "@/lib/prisma-extra";
import { automationSession } from "@/lib/api/session";

// DELETE /api/automations/keys/{id} — révoque la clé (effet immédiat).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await automationSession(false);
  if (!s.ok) return s.res;
  const res = await apiKeyDb.updateMany({ where: { id: params.id, userId: s.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) return NextResponse.json({ error: "Clé introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
