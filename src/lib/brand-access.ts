import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Vérifie, côté serveur, que l'utilisateur connecté a bien une Membership
// (n'importe quel rôle) sur cette marque — jamais faire confiance à un
// brandId envoyé par le client seul. Partagé entre plusieurs fonctionnalités
// (page "link in bio", outil de rétention vidéo, ...) qui ont chacune besoin
// de la même vérification d'appartenance à une marque.
export async function assertBrandMembership(userId: string, brandId: string): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_brandId: { userId, brandId } }
  });
  return Boolean(membership);
}

// Réponse standard renvoyée quand l'utilisateur n'est pas membre de la
// marque visée. 404 plutôt que 403, volontairement : ne pas confirmer à un
// tiers qu'une marque (ou un post, un média...) existe sous cet identifiant.
export function brandNotFound() {
  return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
}

// Raccourci pour les routes qui reçoivent un brandId : renvoie la réponse
// 404 à retourner telle quelle si l'utilisateur n'est pas membre, ou null si
// tout va bien. Usage : `const denied = await requireBrandMembership(userId,
// brandId); if (denied) return denied;`
export async function requireBrandMembership(userId: string, brandId: string): Promise<NextResponse | null> {
  return (await assertBrandMembership(userId, brandId)) ? null : brandNotFound();
}

// Clause Prisma réutilisable pour restreindre une requête aux marques dont
// l'utilisateur est membre : `where: { id, brand: ownedBy(userId) }` sur un
// Post, un MediaAsset, un CompetitorTrack, une SocialConnection, etc.
export function ownedBy(userId: string) {
  return { memberships: { some: { userId } } };
}

// Champs d'une SocialConnection qu'une réponse API peut renvoyer au
// navigateur. Les jetons OAuth (accessToken / refreshToken) n'en font
// JAMAIS partie : ils ne servent que côté serveur (publication, synchro) et
// leur fuite permettrait de publier sur le compte social d'un client.
export const PUBLIC_CONNECTION_SELECT = {
  id: true,
  network: true,
  displayName: true,
  handle: true,
  avatarUrl: true,
  status: true
} as const;
