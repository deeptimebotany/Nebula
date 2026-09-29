import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Plan } from "@/lib/plans";
import { consumePublicQuota } from "@/lib/public-tools-limit";

// Outils IA de /outils (29/09/2026, décision de Lucas) : SANS compte, plus
// aucun appel à l'IA — les pages montrent une démo préparée à l'avance
// (voir lib/tools/demo.ts). La vraie génération demande un compte (gratuit
// ou payant), avec un quota par compte et par jour selon le palier. Pour un
// compte Gratuit, un plafond par adresse IP s'ajoute (plusieurs comptes
// ouverts depuis la même connexion ne multiplient pas le quota).
//
// Les compteurs réutilisent la table PublicToolUsage (déjà purgée chaque
// jour) : l'identifiant du compte y est stocké sous forme d'empreinte, comme
// les adresses IP.

export type ToolKind = "text" | "thumbnail";

/** Générations par jour et par compte. */
export const TOOL_DAILY_LIMITS: Record<Plan, Record<ToolKind, number>> = {
  FREE: { text: 10, thumbnail: 2 },
  PRO: { text: 60, thumbnail: 15 },
  AGENCY: { text: 150, thumbnail: 40 }
};

/** Plafond par adresse IP et par jour, comptes Gratuits seulement. */
export const FREE_IP_DAILY_LIMITS: Record<ToolKind, number> = { text: 30, thumbnail: 6 };

const COUNTER: Record<ToolKind, string> = { text: "acct-text", thumbnail: "acct-thumbnail" };

function accountKey(userId: string): string {
  return createHash("sha256").update(`user:${userId}`).digest("hex");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ToolQuota {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Refus dû au plafond par adresse IP (comptes Gratuits). */
  ipLimited?: boolean;
}

/** Générations restantes aujourd'hui, sans rien consommer. */
export async function toolQuotaStatus(userId: string, plan: Plan): Promise<Record<ToolKind, { limit: number; remaining: number }>> {
  const rows = await prisma.publicToolUsage.findMany({
    where: { ipHash: accountKey(userId), day: todayUtc(), tool: { in: Object.values(COUNTER) } },
    select: { tool: true, count: true }
  });
  const used = (kind: ToolKind) => rows.find((r) => r.tool === COUNTER[kind])?.count ?? 0;
  const limits = TOOL_DAILY_LIMITS[plan];
  return {
    text: { limit: limits.text, remaining: Math.max(0, limits.text - used("text")) },
    thumbnail: { limit: limits.thumbnail, remaining: Math.max(0, limits.thumbnail - used("thumbnail")) }
  };
}

/**
 * Consomme une génération du jour pour ce compte (et, en Gratuit, pour son
 * adresse IP). Un refus ne consomme rien. À appeler AVANT l'appel à l'IA ;
 * en cas d'échec de l'IA, `releaseToolQuota` rend la génération.
 */
export async function consumeToolQuota(req: NextRequest, userId: string, plan: Plan, kind: ToolKind): Promise<ToolQuota> {
  const limit = TOOL_DAILY_LIMITS[plan][kind];
  const where = { ipHash_tool_day: { ipHash: accountKey(userId), tool: COUNTER[kind], day: todayUtc() } };
  const existing = await prisma.publicToolUsage.findUnique({ where });
  if (existing && existing.count >= limit) return { ok: false, limit, remaining: 0 };

  if (plan === "FREE") {
    const ip = await consumePublicQuota(req, `free-ip-${kind}`, FREE_IP_DAILY_LIMITS[kind]);
    if (!ip.ok) return { ok: false, limit, remaining: Math.max(0, limit - (existing?.count ?? 0)), ipLimited: true };
  }

  const updated = await prisma.publicToolUsage.upsert({
    where,
    update: { count: { increment: 1 } },
    create: { ipHash: accountKey(userId), tool: COUNTER[kind], day: todayUtc(), count: 1 }
  });
  return { ok: true, limit, remaining: Math.max(0, limit - updated.count) };
}

/** Rend une génération (l'IA a échoué : rien n'a été produit). */
export async function releaseToolQuota(userId: string, kind: ToolKind): Promise<void> {
  await prisma.publicToolUsage
    .updateMany({ where: { ipHash: accountKey(userId), tool: COUNTER[kind], day: todayUtc(), count: { gt: 0 } }, data: { count: { decrement: 1 } } })
    .catch(() => undefined);
}

/** Message affiché quand le quota du jour est épuisé. */
export function toolQuotaMessage(plan: Plan, kind: ToolKind, quota: ToolQuota): string {
  const what = kind === "thumbnail" ? "miniatures" : "générations";
  if (quota.ipLimited) return `Limite atteinte pour aujourd'hui depuis cette connexion. Revenez demain, ou passez à Pro pour générer davantage.`;
  if (plan === "FREE") return `Vous avez utilisé vos ${quota.limit} ${what} gratuites d'aujourd'hui. Revenez demain, ou passez à Pro pour en avoir ${TOOL_DAILY_LIMITS.PRO[kind]} par jour.`;
  return `Vous avez utilisé vos ${quota.limit} ${what} d'aujourd'hui : le compteur repart à zéro demain.`;
}

/** Réponse commune d'un visiteur sans compte (la page montre une démo à la place). */
export const TOOL_SIGNUP_REQUIRED = "Créez un compte gratuit (ou connectez-vous) pour générer avec l'IA. Sans compte, la page montre une démo préparée à l'avance, sans IA.";
