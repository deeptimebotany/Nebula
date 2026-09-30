// Mesure de l'usage de l'IA (lot E5, 29/09/2026 ; modèle, jetons vidéo et
// actions depuis le 30/09/2026). Chaque appel réussi à Gemini ajoute ses
// jetons (usageMetadata de la réponse) et ses images au compteur du jour de
// AiUsageDaily, rangé par palier, type d'appel et MODÈLE (le prix dépend du
// modèle et de la date). Chaque action aboutie de l'utilisateur (une
// analyse, une image, un message, une génération du Studio) est comptée à
// part : /admin/ia en tire le coût moyen PAR ACTION.
//
// Le palier et le type viennent du contexte posé par la porte de l'IA
// (guard.ts, runWithAiContext) ; un appel hors de toute porte (audit public)
// est rangé sous « PUBLIC ». Aucun contenu ni identifiant de compte.
//
// Le même contexte sait si Google a répondu (appel facturé) : la porte ne
// rend une réservation de quota que si aucun appel n'a été facturé.
import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/prisma";
import { parisDay } from "@/lib/ai/counters";
import { DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, estimateCostUsd } from "@/lib/ai/pricing";
import { alertOwner } from "@/lib/owner-alerts";

export interface AiCallContext {
  plan: string;
  kind: string;
  /** Au moins une réponse de Google reçue pendant ce contexte. */
  billed: boolean;
  /** Dernier modèle appelé dans ce contexte (pour ranger l'action). */
  model: string | null;
  /** Jetons cumulés dans ce contexte (Rétention les enregistre avec l'analyse). */
  usage?: { input: number; video: number; output: number };
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

export interface AiUsageInput {
  model: string;
  /** Jetons envoyés (texte, images, vidéo, outils du mode vidéo « agentique »). */
  inputTokens: number;
  /** Dont jetons de vidéo et d'audio de la vidéo (Rétention). */
  videoTokens?: number;
  /** Jetons produits HORS images (réponse et « pensée »). */
  outputTokens: number;
  /** Images finales produites. */
  images: number;
  imageModel: boolean;
}

/**
 * Appelé par la porte commune de Gemini (gemini.ts) après chaque réponse.
 * Ne lève jamais : la mesure ne doit pas casser une génération réussie.
 */
export async function recordAiUsage(usage: AiUsageInput, now: Date = new Date()): Promise<void> {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.billed = true;
    ctx.model = usage.model;
    ctx.usage = {
      input: (ctx.usage?.input ?? 0) + usage.inputTokens,
      video: (ctx.usage?.video ?? 0) + (usage.videoTokens ?? 0),
      output: (ctx.usage?.output ?? 0) + usage.outputTokens
    };
  }
  const day = parisDay(now);
  const plan = ctx?.plan ?? "PUBLIC";
  const kind = ctx?.kind ?? (usage.imageModel ? "image" : "text");
  const model = usage.model;
  const videoTokens = usage.videoTokens ?? 0;
  try {
    await prisma.aiUsageDaily.upsert({
      where: { day_plan_kind_model: { day, plan, kind, model } },
      update: {
        calls: { increment: 1 },
        inputTokens: { increment: usage.inputTokens },
        videoTokens: { increment: videoTokens },
        outputTokens: { increment: usage.outputTokens },
        images: { increment: usage.images }
      },
      create: { day, plan, kind, model, calls: 1, inputTokens: usage.inputTokens, videoTokens, outputTokens: usage.outputTokens, images: usage.images }
    });
    await maybeAlertDailyCost(day);
  } catch (err) {
    console.warn("[ia] mesure de l'usage :", (err as Error).message);
  }
}

/** Une action aboutie de l'utilisateur (porte de l'IA, après l'appel). Ne lève jamais. */
export async function recordAiAction(ctx: AiCallContext, count = 1, now: Date = new Date()): Promise<void> {
  const day = parisDay(now);
  const model = ctx.model ?? "";
  try {
    await prisma.aiUsageDaily.upsert({
      where: { day_plan_kind_model: { day, plan: ctx.plan, kind: ctx.kind, model } },
      update: { actions: { increment: count } },
      create: { day, plan: ctx.plan, kind: ctx.kind, model, actions: count }
    });
  } catch (err) {
    console.warn("[ia] mesure des actions :", (err as Error).message);
  }
}

/** Coût estimé d'une ligne de AiUsageDaily (prix du modèle, le jour de la ligne). */
export function rowCostUsd(row: { day?: string; kind: string; model?: string | null; inputTokens: number; outputTokens: number; images: number }): number {
  const fallback = row.images > 0 || row.kind === "image" ? DEFAULT_IMAGE_MODEL : DEFAULT_TEXT_MODEL;
  return estimateCostUsd(row, row.model || fallback, row.day);
}

async function maybeAlertDailyCost(day: string): Promise<void> {
  const rows = await prisma.aiUsageDaily.findMany({ where: { day }, select: { day: true, kind: true, model: true, inputTokens: true, outputTokens: true, images: true } });
  const total = rows.reduce((sum, r) => sum + rowCostUsd(r), 0);
  const threshold = dailyCostAlertUsd();
  if (total < threshold) return;
  await alertOwner({
    title: "IA : coût du jour élevé",
    body: `Le coût estimé de l'IA aujourd'hui dépasse ${threshold.toFixed(2)} $ (${total.toFixed(2)} $ estimés). Détail par palier, type et modèle dans /admin/ia.`,
    dedupeKey: `ai-cost:${day}`,
    href: "/admin/ia",
    actionLabel: "Voir le détail"
  });
}
