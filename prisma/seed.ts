import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Les guides de la Communauté ne sont plus créés ici (10/10/2026) : ils sont
// dans le code (src/lib/community/guides.ts) et s'affichent partout dès le
// déploiement, sans commande à lancer. Les anciennes copies en base, aux
// mêmes identifiants, sont simplement ignorées (le code l'emporte).
async function main() {
  console.log("Rien à créer : les guides sont dans src/lib/community/guides.ts.");
  // Il n'y a plus de compte de démonstration créé ici : chaque utilisateur
  // crée son propre compte gratuit Nebula depuis /register, puis ajoute
  // lui-même ses marques et connecte ses comptes réseaux.
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
