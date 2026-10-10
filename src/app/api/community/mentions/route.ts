import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listMentions, markMentionsRead } from "@/lib/community/mentions";

// Onglet « Mentions » de la Communauté (10/10/2026) : où l'on vous a
// mentionné (@pseudo). GET : les 50 dernières et le nombre de non lues.
// POST { action: "read" } : toutes vues (ouverture de l'onglet).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  return NextResponse.json(await listMentions((session.user as { id: string }).id));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "read") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const count = await markMentionsRead((session.user as { id: string }).id);
  return NextResponse.json({ ok: true, count });
}
