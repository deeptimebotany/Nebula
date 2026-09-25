import { PrismaClient } from "@prisma/client";
import { backfillSecretFields, secretFieldsExtension } from "@/lib/db/secret-fields";

// Client Prisma unique de l'application.
//
// Il porte l'extension de chiffrement des secrets (voir db/secret-fields.ts) :
// les jetons OAuth et secrets de webhooks sont chiffrés à l'écriture et
// déchiffrés à la lecture, sans que le reste du code ait à s'en soucier.
// Toujours importer `prisma` depuis ce fichier, jamais `new PrismaClient()`.
function createClients() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
  return { base, prisma: base.$extends(secretFieldsExtension) };
}

type Clients = ReturnType<typeof createClients>;

// Évite de recréer une connexion Prisma à chaque hot-reload en dev.
const globalForPrisma = globalThis as unknown as { nebulaPrisma?: Clients };
const clients = globalForPrisma.nebulaPrisma ?? createClients();
if (process.env.NODE_ENV !== "production") globalForPrisma.nebulaPrisma = clients;

export const prisma = clients.prisma;

/** Chiffre par petits lots les secrets encore en clair (appelé par le cron). */
export function backfillSecrets(limit = 100) {
  return backfillSecretFields(clients.base, limit);
}
