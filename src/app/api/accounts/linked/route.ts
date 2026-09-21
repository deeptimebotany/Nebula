import { NextResponse } from "next/server";
import { listLinkedAccounts } from "@/lib/multi-account";

// GET /api/accounts/linked — comptes Nebula déjà connectés dans CE
// navigateur (voir multi-account.ts), pour remplir le sélecteur en haut à
// droite (voir account-switcher.tsx).
export async function GET() {
  const accounts = await listLinkedAccounts();
  return NextResponse.json({ accounts });
}
