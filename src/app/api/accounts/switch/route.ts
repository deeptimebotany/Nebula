import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { switchToAccount } from "@/lib/multi-account";

const bodySchema = z.object({ uid: z.string().min(1) });

// POST /api/accounts/switch — bascule instantanément vers un autre compte
// déjà connecté dans ce navigateur (voir account-switcher.tsx et
// switchToAccount dans multi-account.ts). Ne fonctionne QUE pour un compte
// dont ce navigateur possède déjà un jeton de session valide — impossible
// de basculer vers un compte auquel on ne s'est jamais connecté ici. La
// vérification de session ci-dessous n'est qu'une défense en profondeur :
// le cookie httpOnly + sameSite=lax du compte ciblé ne part de toute façon
// jamais vers une requête cross-site.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Compte invalide." }, { status: 400 });

  const ok = await switchToAccount(parsed.data.uid);
  if (!ok) {
    return NextResponse.json(
      { error: "Ce compte n'est plus disponible ici — reconnectez-vous." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
