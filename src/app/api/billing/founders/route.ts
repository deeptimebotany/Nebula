import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { foundersSnapshot } from "@/lib/billing/founders";

// GET /api/billing/founders — offres fondateurs (02/10/2026) : places
// restantes (public, lu par la grille des tarifs) et, pour un compte
// connecté, ce à quoi il a droit. Deux comptages légers, jamais en cache :
// le nombre de places doit être juste.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions).catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const data = await foundersSnapshot(userId);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
