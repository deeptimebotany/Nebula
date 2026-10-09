import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteConversation, getConversation } from "@/lib/ai/assistant-conversations";

export const dynamic = "force-dynamic";

// GET /api/ai/conversations/[id] — rouvrir une conversation (09/10/2026).
// DELETE — la supprimer. Seulement les conversations de la personne connectée.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const conversation = await getConversation((session.user as { id: string }).id, params.id);
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const ok = await deleteConversation((session.user as { id: string }).id, params.id);
  if (!ok) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
