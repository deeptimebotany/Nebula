import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { automationSession } from "@/lib/api/session";
import { accessibleBrands } from "@/lib/api/access";
import { createWebhookEndpoint, webhookView, WebhookInputError } from "@/lib/api/webhook-endpoints";

const bodySchema = z.object({
  url: z.string().trim().url().max(2048),
  events: z.array(z.string()).min(1).max(20),
  brandId: z.string().min(1).nullable().optional(),
  description: z.string().max(120).optional()
});

// POST /api/automations/webhooks — ajoute une adresse de webhook.
export async function POST(req: NextRequest) {
  const s = await automationSession(true);
  if (!s.ok) return s.res;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Adresse https et au moins un événement requis." }, { status: 400 });
  if (parsed.data.brandId) {
    const [brand] = await accessibleBrands(s.userId, parsed.data.brandId);
    if (!brand) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }
  try {
    const endpoint = await createWebhookEndpoint(s.userId, parsed.data);
    return NextResponse.json({ webhook: webhookView(endpoint, true) });
  } catch (err) {
    if (err instanceof WebhookInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
