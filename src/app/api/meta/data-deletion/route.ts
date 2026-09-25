import { NextRequest, NextResponse } from "next/server";
import { handleDataDeletion, readSignedRequest, type MetaApp } from "@/lib/meta-callbacks";
import { publicAppUrl } from "@/lib/account-security";

export const dynamic = "force-dynamic";

// POST /api/meta/data-deletion — « URL de demande de suppression des
// données » à renseigner dans le tableau de bord Meta (Paramètres →
// Général) ; ?app=threads pour l'application Threads. Réponse attendue par
// Meta : { url, confirmation_code } — l'adresse permet à la personne de
// suivre sa demande. Voir src/lib/meta-callbacks.ts.
export async function POST(req: NextRequest) {
  const app: MetaApp = req.nextUrl.searchParams.get("app") === "threads" ? "threads" : "meta";
  const payload = await readSignedRequest(req, app);
  if (!payload?.user_id) return NextResponse.json({ error: "signed_request invalide" }, { status: 400 });
  const { code } = await handleDataDeletion(app, payload.user_id);
  return NextResponse.json({ url: `${publicAppUrl()}/suppression-donnees?code=${code}`, confirmation_code: code });
}
