import { NextResponse } from "next/server";

// Guides de la Communauté retirés le 10/10/2026 (voir ../route.ts).
export async function GET() {
  return NextResponse.json({ error: "Les guides ont été retirés : posez votre question à « Demander à Nebula »." }, { status: 410 });
}
