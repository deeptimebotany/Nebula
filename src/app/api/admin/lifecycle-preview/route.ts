import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireOwnerUserId } from "@/lib/admin";
import { LIFECYCLE_KEYS, type LifecycleKey } from "@/lib/emails/lifecycle-keys";
import { sendLifecyclePreview } from "@/lib/emails/lifecycle";

// POST /api/admin/lifecycle-preview { key } — envoie au propriétaire un
// aperçu de l'email de cycle de vie demandé, avec des données factices
// (bouton « M'envoyer un aperçu » de /admin/acquisition).
export async function POST(req: NextRequest) {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const session = await getServerSession(authOptions);
  const to = session?.user?.email;
  if (!to) return NextResponse.json({ error: "Adresse du propriétaire introuvable." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { key?: string };
  if (!body.key || !(LIFECYCLE_KEYS as readonly string[]).includes(body.key)) {
    return NextResponse.json({ error: "Clé inconnue." }, { status: 400 });
  }
  const result = await sendLifecyclePreview(body.key as LifecycleKey, to);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Envoi impossible." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
