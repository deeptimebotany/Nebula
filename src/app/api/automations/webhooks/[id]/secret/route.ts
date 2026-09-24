import { NextRequest, NextResponse } from "next/server";
import { webhookEndpointDb } from "@/lib/prisma-extra";
import { automationSession } from "@/lib/api/session";

export const dynamic = "force-dynamic";

// GET /api/automations/webhooks/{id}/secret — afficher le secret de signature.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await automationSession(false);
  if (!s.ok) return s.res;
  const endpoint = await webhookEndpointDb.findFirst({ where: { id: params.id, userId: s.userId } });
  if (!endpoint) return NextResponse.json({ error: "Webhook introuvable." }, { status: 404 });
  return NextResponse.json({ secret: endpoint.secret }, { headers: { "Cache-Control": "no-store" } });
}
