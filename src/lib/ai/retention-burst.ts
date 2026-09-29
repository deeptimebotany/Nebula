import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";

// Rafale de l'analyse de rétention (lot E2, brief « Essai 14 jours ») : en
// plus des analyses du jour (plans.ts, aiDaily.retention), au plus 8
// analyses par compte et par 10 minutes, tous paliers confondus. Coupe court
// à un double clic répété ou à une boucle côté navigateur.
export const RETENTION_BURST = { limit: 8, windowMinutes: 10 } as const;

/** null si l'analyse peut partir, sinon la réponse 429 à renvoyer. */
export async function consumeRetentionBurst(userId: string): Promise<NextResponse | null> {
  const r = await consumeRateLimit("ai-retention", userId, RETENTION_BURST.limit, RETENTION_BURST.windowMinutes);
  if (r.ok) return null;
  const minutes = Math.max(1, Math.ceil(r.retryAfterSeconds / 60));
  return NextResponse.json(
    { error: `Beaucoup d'analyses d'un coup : la suivante est possible dans ${minutes} min.`, retryAfterSeconds: r.retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } }
  );
}
