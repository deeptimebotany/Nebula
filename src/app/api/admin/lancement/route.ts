import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerUserId } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { LAUNCH_WAITLIST } from "@/lib/launch";
import { addToLaunchList, launchListCsv, parseEmailList, sendLaunchAnnouncement } from "@/lib/launch-list";

// /api/admin/lancement — liste « Prévenez-moi du lancement » (pré-lancement,
// 30/09/2026). Réservé au compte propriétaire (404 sinon).
//   GET    → export CSV de la liste
//   POST   { action: "add", emails } → ajoute les adresses reçues par e-mail
//   POST   { action: "announce" } → annonce de l'ouverture (90 au plus par
//          appel, seulement une fois le site ouvert)
//   DELETE { email } → retire une adresse (demande de suppression)
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const csv = await launchListCsv();
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nebula-liste-lancement-${day}.csv"`,
      "Cache-Control": "private, no-store"
    }
  });
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), emails: z.string().max(100_000) }),
  z.object({ action: z.literal("announce") })
]);

export async function POST(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  if (parsed.data.action === "add") {
    const emails = parseEmailList(parsed.data.emails);
    if (emails.length === 0) return NextResponse.json({ error: "Aucune adresse e-mail valide trouvée." }, { status: 400 });
    const added = await addToLaunchList(emails);
    return NextResponse.json({ ok: true, found: emails.length, added });
  }
  const result = await sendLaunchAnnouncement();
  return NextResponse.json({ ok: !result.error || result.sent > 0, ...result }, { status: result.sent === 0 && result.error ? 409 : 200 });
}

const deleteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

export async function DELETE(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Adresse invalide." }, { status: 400 });
  const { count } = await prisma.networkWaitlist.deleteMany({ where: { email: parsed.data.email, network: LAUNCH_WAITLIST } });
  return NextResponse.json({ ok: true, removed: count });
}
