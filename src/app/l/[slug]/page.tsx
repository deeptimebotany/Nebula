import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedPublicLinkPage } from "@/lib/link-in-bio-cache";
import { PublicLinkInBioClient } from "./link-in-bio-client";

// Page « link in bio » d'une marque, rendue CÔTÉ SERVEUR : le nom, la bio et
// les liens sont dans le HTML dès la première réponse (aperçu de partage,
// moteurs de recherche, lecteurs d'écran), avec un titre d'onglet propre à
// la marque. L'ancienne version ne renvoyait qu'une coquille vide remplie
// après coup par le navigateur.
//
// Données lues depuis le cache (voir src/lib/link-in-bio-cache.ts) : une
// visite ne touche plus la base, sauf juste après une modification de la
// page ou toutes les 5 minutes au plus (audit performance, lot 4). Le rendu
// reste dynamique à cause du nonce de la CSP.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await getCachedPublicLinkPage(params.slug);
  if (!page) return { title: "Page introuvable", robots: { index: false, follow: false } };
  const description = page.bio?.trim() ? page.bio.trim().slice(0, 160) : `Les liens de ${page.brandName}.`;
  return {
    title: page.brandName,
    description,
    openGraph: { title: page.brandName, description, type: "profile", ...(page.avatarUrl ? { images: [page.avatarUrl] } : {}) },
    twitter: { card: "summary", title: page.brandName, description }
  };
}

export default async function PublicLinkInBioPage({ params }: { params: { slug: string } }) {
  const page = await getCachedPublicLinkPage(params.slug);
  // Adresse inconnue ou page non publiée : vraie réponse 404 (et non une
  // page « vide » en 200), pour les moteurs de recherche comme pour l'humain.
  if (!page) notFound();
  return <PublicLinkInBioClient slug={params.slug} initialData={page} />;
}
