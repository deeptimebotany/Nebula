import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { webhookEndpointDb } from "@/lib/prisma-extra";
import { automationSession } from "@/lib/api/session";
import { WEBHOOK_EVENT_IDS } from "@/lib/webhooks";

const patchSchema = z.object({ active: z.boolean().optional(), events: z.array(z.string()).min(1).max(20).optional() });

// PATCH /api/automations/webhooks/{id} — activer / désactiver, ou changer
// les événements. Réactiver remet le compteur d'échecs à zéro.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await automationSession(true);
  if (!s.ok) return s.res;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const events = parsed.data.events?.filter((e) => WEBHOOK_EVENT_IDS.includes(e));
  if (events && events.length === 0) return NextResponse.json({ error: "Choisissez au moins un événement." }, { status: 400 });
  const res = await webhookEndpointDb.updateMany({
    where: { id: params.id, userId: s.userId },
    data: {
      ...(parsed.data.active !== undefined ? { active: parsed.data.active, ...(parsed.data.active ? { failureCount: 0, disabledReason: null } : {}) } : {}),
      ...(events ? { events } : {})
    }
  });
  if (res.count === 0) return NextResponse.json({ error: "Webhook introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/automations/webhooks/{id}
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await automationSession(false);
  if (!s.ok) return s.res;
  const res = await webhookEndpointDb.deleteMany({ where: { id: params.id, userId: s.userId } });
  if (res.count === 0) return NextResponse.json({ error: "Webhook introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
