import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mergeUiPrefs, sanitizeUiPrefs } from "@/lib/ui-prefs";

const schema = z.object({ changes: z.record(z.string().max(160), z.string().max(4000).nullable()) });

// PATCH /api/me/prefs { changes: { clé: valeur | null } } — préférences
// d'affichage enregistrées dans le compte (29/09/2026, voir lib/ui-prefs.ts).
// Liste fermée de clés ; l'écriture relit la valeur en base pour ne jamais
// écraser un changement fait entre-temps depuis un autre appareil.
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Préférences invalides." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { uiPrefs: true } });
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  const merged = mergeUiPrefs(sanitizeUiPrefs(user.uiPrefs), parsed.data.changes);
  if (!merged.ok) return NextResponse.json({ error: merged.error }, { status: 400 });
  await prisma.user.update({ where: { id: userId }, data: { uiPrefs: merged.prefs } });
  return NextResponse.json({ ok: true });
}
