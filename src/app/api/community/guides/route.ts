import { NextResponse } from "next/server";

// Guides de la Communauté retirés le 10/10/2026 (demande de Lucas) : les
// questions passent par « Demander à Nebula ». La route répond « parti »
// pour les anciennes pages encore ouvertes.
export async function GET() {
  return NextResponse.json({ guides: [], error: "Les guides ont été retirés : posez votre question à « Demander à Nebula »." }, { status: 410 });
}
