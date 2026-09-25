import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listNetworkControls } from "@/lib/social/network-control";

// GET /api/network-status — réseaux suspendus en ce moment (lot 5), pour
// prévenir dans Publier : « TikTok suspendu : votre publication partira
// automatiquement à la reprise ». Rien de sensible : pas de message
// d'erreur technique, seulement l'état et le message prévu pour les
// utilisateurs.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const now = Date.now();
  const paused = (await listNetworkControls())
    .map((c) => {
      const tripped = c.trippedUntil !== null && c.trippedUntil.getTime() > now;
      return {
        network: c.network,
        publishPaused: !c.publishEnabled || tripped,
        syncPaused: !c.syncEnabled || tripped,
        reason: !c.publishEnabled || !c.syncEnabled ? "manual" : tripped ? "incident" : null,
        until: tripped ? c.trippedUntil : null,
        message: c.message
      };
    })
    .filter((c) => c.publishPaused || c.syncPaused);
  return NextResponse.json({ paused }, { headers: { "Cache-Control": "private, max-age=60" } });
}
