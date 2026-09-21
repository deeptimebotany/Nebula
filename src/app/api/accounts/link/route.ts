import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rememberCurrentSession } from "@/lib/multi-account";

// Page de retour utilisée comme callbackUrl après une connexion Google
// déclenchée depuis le "+" du sélecteur de comptes (voir
// account-switcher.tsx) : à ce stade NextAuth vient de poser la session du
// compte qui vient de se connecter (nouveau OU déjà existant, peu importe),
// on la mémorise dans son propre slot (voir rememberCurrentSession) pour
// qu'il apparaisse ensuite dans le sélecteur, puis on repart vers le
// tableau de bord.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (uid) rememberCurrentSession(uid);

  const next = req.nextUrl.searchParams.get("next") || "/dashboard";
  return NextResponse.redirect(new URL(next, req.url));
}
