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
