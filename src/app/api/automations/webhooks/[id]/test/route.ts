import { NextRequest, NextResponse } from "next/server";
import { webhookEndpointDb } from "@/lib/prisma-extra";
import { automationSession } from "@/lib/api/session";
import { consumeRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { sendTestWebhook } from "@/lib/webhooks";

export const maxDuration = 30;

// POST /api/automations/webhooks/{id}/test — envoie un événement « ping ».
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await automationSession(true);
  if (!s.ok) return s.res;
  const rate = await consumeRateLimit("webhook-test", s.userId, 20, 10);
  if (!rate.ok) return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  const endpoint = await webhookEndpointDb.findFirst({ where: { id: params.id, userId: s.userId } });
  if (!endpoint) return NextResponse.json({ error: "Webhook introuvable." }, { status: 404 });
  const delivery = await sendTestWebhook(endpoint);
  return NextResponse.json({ ok: delivery?.status === "SUCCESS", responseStatus: delivery?.responseStatus ?? null, error: delivery?.error ?? null });
}
