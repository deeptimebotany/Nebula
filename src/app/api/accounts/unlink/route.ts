import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { forgetAccount } from "@/lib/multi-account";

const bodySchema = z.object({ uid: z.string().min(1) });

// POST /api/accounts/unlink — retire un compte du sélecteur de CE
// navigateur (voir account-switcher.tsx). N'affecte pas sa session ailleurs
// et, si c'était le compte actif, ne le déconnecte pas immédiatement — voir
// forgetAccount dans multi-account.ts.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Compte invalide." }, { status: 400 });

  forgetAccount(parsed.data.uid);
  return NextResponse.json({ ok: true });
}
