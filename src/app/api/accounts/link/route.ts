import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rememberCurrentSession } from "@/lib/multi-account";
import { safeRelativePath } from "@/lib/safe-redirect";

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

  // Chemin interne uniquement : ?next=//autre-site.com redirigeait ailleurs.
  const next = safeRelativePath(req.nextUrl.searchParams.get("next"), "/dashboard");
  return NextResponse.redirect(new URL(next, req.url));
}

// POST — même mémorisation, mais déclenchée côté client (voir
// account-switcher.tsx, au chargement) pour couvrir aussi une connexion
// NORMALE depuis /login (credentials ou Google), qui ne passe jamais par le
// flux "+" ci-dessus. Une Route Handler peut écrire des cookies ; une mise
// en page (Server Component) ne le peut pas — voir (dashboard)/layout.tsx.
export async function POST() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (uid) rememberCurrentSession(uid);
  return NextResponse.json({ ok: Boolean(uid) });
}
