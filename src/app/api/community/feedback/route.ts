import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { canModerate, reportedKeys } from "@/lib/community/moderation";
import { createFeedbackRequest, feedbackQuota, listFeedback, type FeedbackOptionInput, type FeedbackScope } from "@/lib/community/feedback";
import { FEEDBACK_MAX_OPTIONS } from "@/lib/community/feedback-rules";

// Avis de la communauté (02/10/2026), voir src/lib/community/feedback.ts.
//  GET ?scope=open|mine|closed : demandes à voter, mes demandes, terminées
//      (+ limite de demandes de la personne, droits de modération).
//  POST (multipart) : kind, context, network, puis pour chaque proposition
//      label<i>, et pour une miniature file<i> (image envoyée) ou source<i>
//      (miniature déjà proposée dans Publier).
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const raw = req.nextUrl.searchParams.get("scope");
  const scope: FeedbackScope = raw === "mine" || raw === "closed" ? raw : "open";
  const [requests, quota] = await Promise.all([listFeedback(userId, scope), feedbackQuota(userId)]);
  const reported = await reportedKeys(userId, requests.map((r) => ({ type: "FEEDBACK" as const, id: r.id })));
  return NextResponse.json({ requests, quota, viewer: { canModerate: canModerate(session.user.email), reported } });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const rate = await consumeRateLimit("feedback-create", userId, 20, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de demandes d'un coup : réessayez dans quelques minutes." }, { status: 429 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const text = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : null;
  };
  const options: FeedbackOptionInput[] = [];
  for (let i = 0; i < FEEDBACK_MAX_OPTIONS + 1; i++) {
    const label = text(`label${i}`);
    const file = form.get(`file${i}`);
    const source = text(`source${i}`);
    if (label === null && !(file instanceof File) && !source) continue;
    options.push({ label, file: file instanceof File ? file : null, sourceUrl: source });
  }
  const result = await createFeedbackRequest(userId, { kind: text("kind") ?? "", context: text("context"), network: text("network"), options });
  if (!result.ok) return NextResponse.json({ error: result.error, reason: result.reason }, { status: result.status });
  return NextResponse.json({ ok: true, id: result.id });
}
