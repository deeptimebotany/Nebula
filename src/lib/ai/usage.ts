// Mesure de l'usage de l'IA (lot E5, 29/09/2026). Chaque appel réussi à
// Gemini ajoute ses jetons (usageMetadata de la réponse) et ses images au
// compteur du jour de AiUsageDaily, rangé par palier et par type d'appel.
// Le palier et le type viennent du contexte posé par la porte de l'IA
// (guard.ts, runWithAiContext) ; un appel hors de toute porte (audit public)
// est rangé sous « PUBLIC ». Aucun contenu ni identifiant de compte.
//
// Le même contexte sait si Google a répondu (appel facturé) : la porte ne
// rend une réservation de quota que si aucun appel n'a été facturé.
import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/prisma";
import { parisDay } from "@/lib/ai/counters";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { alertOwner } from "@/lib/owner-alerts";

export interface AiCallContext {
  plan: string;
  kind: string;
  /** Au moins une réponse de Google reçue pendant ce contexte. */
  billed: boolean;
}

const storage = new AsyncLocalStorage<AiCallContext>();

export function currentAiContext(): AiCallContext | undefined {
  return storage.getStore();
}

/** Exécute `fn` dans un contexte d'appel IA (palier, type). */
export function runWithAiContext<T>(ctx: AiCallContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

/** Seuil d'alerte du coût estimé du jour (dollars), réglable sur Vercel. */
export function dailyCostAlertUsd(): number {
  const v = Number(process.env.AI_DAILY_COST_ALERT_USD);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

/**
 * Appelé par la porte commune de Gemini (gemini.ts) après chaque réponse.
 * Ne lève jamais : la mesure ne doit pas casser une génération réussie.
 */
export async function recordAiUsage(usage: { inputTokens: number; outputTokens: number; images: number; imageModel: boolean }, now: Date = new Date()): Promise<void> {
  const ctx = storage.getStore();
  if (ctx) ctx.billed = true;
  const day = parisDay(now);
  const plan = ctx?.plan ?? "PUBLIC";
  const kind = ctx?.kind ?? (usage.imageModel ? "image" : "text");
  try {
    await prisma.aiUsageDaily.upsert({
      where: { day_plan_kind: { day, plan, kind } },
      update: { calls: { increment: 1 }, inputTokens: { increment: usage.inputTokens }, outputTokens: { increment: usage.outputTokens }, images: { increment: usage.images } },
      create: { day, plan, kind, calls: 1, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, images: usage.images }
    });
    await maybeAlertDailyCost(day);
  } catch (err) {
    console.warn("[ia] mesure de l'usage :", (err as Error).message);
  }
}

/** Coût estimé d'une ligne de AiUsageDaily. */
export function rowCostUsd(row: { kind: string; inputTokens: number; outputTokens: number; images: number }): number {
  return estimateCostUsd(row, row.images > 0 || row.kind === "image" ? "image" : "text");
}

async function maybeAlertDailyCost(day: string): Promise<void> {
  const rows = await prisma.aiUsageDaily.findMany({ where: { day }, select: { kind: true, inputTokens: true, outputTokens: true, images: true } });
  const total = rows.reduce((sum, r) => sum + rowCostUsd(r), 0);
  const threshold = dailyCostAlertUsd();
  if (total < threshold) return;
  await alertOwner({
    title: "IA : coût du jour élevé",
    body: `Le coût estimé de l'IA aujourd'hui dépasse ${threshold.toFixed(2)} $ (${total.toFixed(2)} $ estimés). Détail par palier et par type dans /admin/ia.`,
    dedupeKey: `ai-cost:${day}`,
    href: "/admin/ia",
    actionLabel: "Voir le détail"
  });
}
