import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { isOwnerEmail, resolvePreviewPlan, PLAN_PREVIEW_COOKIE } from "@/lib/dev-preview";

// GET/PATCH /api/dev-preview/plan — "aperçu de palier" de l'onglet privé
// /dev-preview et de Paramètres (voir dev-preview.ts pour le détail de ce
// que ça affecte et pourquoi c'est un cookie plutôt qu'un champ en base).
// Réservé au compte propriétaire : pour tout le monde d'autre, GET renvoie
// toujours { plan: null } et PATCH est refusé.
export async function GET() {
  const session = await getServerSession(authOptions);
  return NextResponse.json({ plan: resolvePreviewPlan(session?.user?.email) });
}

const bodySchema = z.object({ plan: z.enum(["FREE", "PRO", "AGENCY"]).nullable() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isOwnerEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.plan === null) {
    cookies().delete(PLAN_PREVIEW_COOKIE);
  } else {
    // Cookie de session de test, jamais destiné à persister longtemps ni à
    // être lu ailleurs que côté serveur Next — pas de maxAge : il s'efface à
    // la fermeture du navigateur, et reste modifiable à tout moment ici.
    cookies().set(PLAN_PREVIEW_COOKIE, parsed.data.plan, { httpOnly: true, sameSite: "lax", path: "/" });
  }

  return NextResponse.json({ ok: true, plan: parsed.data.plan });
}
