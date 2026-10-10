// Pseudo de la Communauté — côté serveur (voir handle-rules.ts).
import { prisma } from "@/lib/prisma";
import { handleError, normalizeHandle, randomHandle } from "./handle-rules";

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === "P2002";

/**
 * Pseudo du compte ; en attribue un s'il n'en a pas encore (inscription,
 * comptes créés avant le 10/10/2026 sans la migration). Ne lève jamais.
 */
export async function ensureHandle(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
    if (!user) return null;
    if (user.handle) return user.handle;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = randomHandle(attempt < 4 ? 4 : 6);
      try {
        const { count } = await prisma.user.updateMany({ where: { id: userId, handle: null }, data: { handle: candidate } });
        if (count === 1) return candidate;
        // Attribué entre-temps (deux onglets) : on relit.
        return (await prisma.user.findUnique({ where: { id: userId }, select: { handle: true } }))?.handle ?? null;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    return null;
  } catch (err) {
    console.warn("[pseudo] attribution impossible :", (err as Error).message);
    return null;
  }
}

export type SetHandleResult = { ok: true; handle: string } | { ok: false; status: number; error: string };

/** Change le pseudo (Paramètres → Compte). */
export async function setHandle(userId: string, raw: string): Promise<SetHandleResult> {
  const handle = normalizeHandle(raw);
  const error = handleError(handle);
  if (error) return { ok: false, status: 400, error };
  const taken = await prisma.user.findFirst({ where: { handle, NOT: { id: userId } }, select: { id: true } });
  if (taken) return { ok: false, status: 409, error: "Ce pseudo est déjà pris : essayez-en un autre." };
  try {
    await prisma.user.update({ where: { id: userId }, data: { handle } });
    return { ok: true, handle };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, status: 409, error: "Ce pseudo est déjà pris : essayez-en un autre." };
    throw err;
  }
}
