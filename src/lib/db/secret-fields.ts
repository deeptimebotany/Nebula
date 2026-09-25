// Chiffrement transparent des secrets en base (audit sécurité, lot 1).
//
// Extension Prisma branchée sur le client unique (src/lib/prisma.ts) :
//  - À l'ÉCRITURE (create, update, upsert, createMany, updateMany… y compris
//    les écritures imbriquées), toute valeur d'un champ accessToken,
//    refreshToken ou secret est chiffrée (voir crypto/secret-box.ts).
//  - À la LECTURE, toute valeur chiffrée de ces champs est déchiffrée, où
//    qu'elle se trouve dans le résultat (relations incluses : une
//    publication qui inclut ses cibles puis leur connexion reçoit des jetons
//    déjà déchiffrés).
// Le reste du code manipule donc des jetons en clair, comme avant, sans
// pouvoir oublier de chiffrer.
//
// Limites connues : les requêtes SQL brutes ($queryRaw) ne passent pas par
// l'extension (il n'y en a aucune sur ces tables) ; un filtre « where » sur
// la valeur d'un jeton ne peut pas fonctionner (le chiffrement est aléatoire).
import { Prisma, type PrismaClient } from "@prisma/client";
import { currentSecretPrefix, isSealed, openSecret, sealSecret } from "@/lib/crypto/secret-box";

/** Champs secrets, par modèle (nullable = colonne facultative). */
export const SECRET_FIELDS = {
  socialConnection: [
    { field: "accessToken", nullable: false },
    { field: "refreshToken", nullable: true }
  ],
  integrationAccount: [
    { field: "accessToken", nullable: false },
    { field: "refreshToken", nullable: true }
  ],
  adAccount: [
    { field: "accessToken", nullable: false },
    { field: "refreshToken", nullable: true }
  ],
  pendingAdAuth: [
    { field: "accessToken", nullable: false },
    { field: "refreshToken", nullable: true }
  ],
  webhookEndpoint: [{ field: "secret", nullable: false }]
} as const;

const SECRET_KEYS: ReadonlySet<string> = new Set(Object.values(SECRET_FIELDS).flatMap((list) => list.map((f) => f.field)));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Copie des arguments d'écriture avec les secrets chiffrés (l'objet de l'appelant n'est pas modifié). */
export function sealWriteTree(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sealWriteTree);
  if (!isPlainObject(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "where") {
      out[key] = value;
    } else if (SECRET_KEYS.has(key) && typeof value === "string") {
      out[key] = sealSecret(value, key);
    } else if (SECRET_KEYS.has(key) && isPlainObject(value) && typeof value.set === "string") {
      out[key] = { ...value, set: sealSecret(value.set, key) };
    } else if (Array.isArray(value) || isPlainObject(value)) {
      out[key] = sealWriteTree(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Déchiffre en place les secrets d'un résultat Prisma. */
export function openReadTree(node: unknown): unknown {
  if (Array.isArray(node)) {
    for (const item of node) openReadTree(item);
    return node;
  }
  if (!isPlainObject(node)) return node;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (typeof value === "string") {
      if (SECRET_KEYS.has(key) && isSealed(value)) node[key] = openSecret(value, key);
    } else if (value !== null && typeof value === "object") {
      openReadTree(value);
    }
  }
  return node;
}

export const secretFieldsExtension = Prisma.defineExtension({
  name: "secret-fields",
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const input = args as Record<string, unknown> | undefined;
        let finalArgs = args;
        if (input && (input.data !== undefined || input.create !== undefined || input.update !== undefined)) {
          const next: Record<string, unknown> = { ...input };
          if (input.data !== undefined) next.data = sealWriteTree(input.data);
          if (input.create !== undefined) next.create = sealWriteTree(input.create);
          if (input.update !== undefined) next.update = sealWriteTree(input.update);
          finalArgs = next as typeof args;
        }
        const result = await query(finalArgs);
        return openReadTree(result) as typeof result;
      }
    }
  }
});

interface SecretDelegate {
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>;
  updateMany(args: unknown): Promise<{ count: number }>;
}

/**
 * Chiffre (ou re-chiffre avec la clé actuelle) les valeurs encore en clair.
 * Appelé par le cron, par petits lots : les comptes déjà connectés sont
 * protégés sans intervention, quelques minutes après l'ajout de la clé.
 * Reçoit le client Prisma SANS extension, pour lire et écrire les valeurs
 * brutes. Écriture conditionnelle (la valeur ne doit pas avoir changé
 * entre-temps) : un rafraîchissement de jeton concurrent n'est jamais écrasé.
 */
export async function backfillSecretFields(base: PrismaClient, limit = 100): Promise<{ sealed: number; failed: number }> {
  const prefix = currentSecretPrefix();
  if (!prefix) return { sealed: 0, failed: 0 };
  let sealed = 0;
  let failed = 0;
  for (const [delegateName, fields] of Object.entries(SECRET_FIELDS)) {
    const db = (base as unknown as Record<string, SecretDelegate>)[delegateName];
    for (const { field, nullable } of fields) {
      const remaining = limit - sealed - failed;
      if (remaining <= 0) return { sealed, failed };
      const rows = await db.findMany({
        where: { ...(nullable ? { [field]: { not: null } } : {}), NOT: { [field]: { startsWith: prefix } } },
        select: { id: true, [field]: true },
        take: remaining
      });
      for (const row of rows) {
        const raw = row[field];
        if (typeof raw !== "string") continue;
        try {
          const value = sealSecret(openSecret(raw, field), field);
          const { count } = await db.updateMany({ where: { id: row.id, [field]: raw }, data: { [field]: value } });
          sealed += count;
        } catch (err) {
          failed += 1;
          console.error(`[secrets] ${delegateName}.${field} ${String(row.id)} non chiffré :`, (err as Error).message);
        }
      }
    }
  }
  return { sealed, failed };
}
