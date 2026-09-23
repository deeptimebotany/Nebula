import { NextRequest, NextResponse } from "next/server";
import { getPublicLinkPage } from "@/lib/link-in-bio-public";

// GET /api/public/link-in-bio/[slug] — même source que la page /l/[slug]
// (rendue côté serveur) ; conservée pour les clients qui rafraîchissent les
// données sans recharger la page. Aucune authentification : le slug de la
// marque, déjà unique, sert d'identifiant public.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const page = await getPublicLinkPage(params.slug);
  if (!page) {
    return NextResponse.json({ error: "Cette page n'existe pas ou n'est pas publiée." }, { status: 404 });
  }
  return NextResponse.json(page);
}
