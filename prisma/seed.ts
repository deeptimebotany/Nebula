import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Les guides de la Communauté ont été retirés le 10/10/2026 (demande de
// Lucas : les questions passent par « Demander à Nebula »). La table Guide
// reste en base, inutilisée ; il n'y a plus rien à créer ici.
async function main() {
  console.log("Rien à créer.");
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
