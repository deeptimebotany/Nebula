import { NextRequest, NextResponse } from "next/server";
import { handleDeauthorize, readSignedRequest, type MetaApp } from "@/lib/meta-callbacks";

export const dynamic = "force-dynamic";

// POST /api/meta/deauthorize — « URL de rappel de désautorisation » à
// renseigner dans le tableau de bord Meta (Facebook Login → Paramètres) ;
// ?app=threads pour l'application Threads. Voir src/lib/meta-callbacks.ts.
export async function POST(req: NextRequest) {
  const app: MetaApp = req.nextUrl.searchParams.get("app") === "threads" ? "threads" : "meta";
  const payload = await readSignedRequest(req, app);
  if (!payload?.user_id) return NextResponse.json({ error: "signed_request invalide" }, { status: 400 });
  const disconnected = await handleDeauthorize(app, payload.user_id);
  return NextResponse.json({ ok: true, disconnected });
}
