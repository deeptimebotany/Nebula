// Rapport des coûts de l'IA pour la page propriétaire /admin/ia (lot E5,
// brief « Essai 14 jours », 29/09/2026). Tout est ESTIMÉ (jetons × prix de
// src/lib/ai/pricing.ts) : les montants facturés par Google font foi dans
// Google Cloud → Facturation.
//
//   - modèles utilisés (variables GEMINI_*), prix en vigueur et prochain
//     changement connu (gemini-3.8-flash double le 01/01/2027) ;
//   - coût des 30 derniers jours par palier et par type (AiUsageDaily), avec
//     les jetons de vidéo (Rétention) et le coût moyen PAR ACTION (une
//     analyse, une image, un message, une génération du Studio) ;
//   - budgets globaux de l'Essai et du Gratuit utilisés aujourd'hui ;
//   - les 20 comptes les plus coûteux du mois (identifiant et palier
//     seulement) : quotas du mois par compte (AiMonthlyUsage : Rétention,
//     images, Studio, assistant) + textes des 7 derniers jours (compteurs du
//     jour, gardés 8 jours), × coût moyen mesuré par action ;
//   - lien avec la conversion : taux essai → payant (lot G0) et coût IA des
//     essais d'un mois divisé par les abonnés gagnés ce mois-là.
import { prisma } from "@/lib/prisma";
import { accountCounterKey, parisDay, parisMonth } from "@/lib/ai/counters";
import { AI_PRICING, pricesInForce, type ModelPrice } from "@/lib/ai/pricing";
import { configuredModels } from "@/lib/ai/gemini";
import { BUDGET_KEY, globalAiBudget } from "@/lib/ai/guard";
import { dailyCostAlertUsd, rowCostUsd } from "@/lib/ai/usage";
import { getUserPlan } from "@/lib/billing/plan";

const DAY = 86_400_000;
const KINDS = ["text", "image", "studio", "assistant", "retention"] as const;
/**
 * Estimations de repli PAR ACTION (prix du 30/09/2026, à revérifier) quand
 * les 30 derniers jours n'ont pas de mesure : un texte ≈ 1 500 jetons en
 * entrée et 1 500 en sortie (pensée comprise) ; une image 1K ≈ 0,067 $ ; une
 * analyse Rétention d'une vidéo de 10 min en basse résolution ≈ 60 000 jetons.
 */
const FALLBACK_COST_PER_ACTION: Record<string, number> = { text: 0.007, image: 0.07, studio: 0.012, assistant: 0.006, retention: 0.06 };

export interface CostRow {
  plan: string;
  kind: string;
  calls: number;
  /** Actions abouties (analyses, images, messages, générations). */
  actions: number;
  inputTokens: number;
  /** Dont jetons de vidéo (Rétention). */
  videoTokens: number;
  outputTokens: number;
  images: number;
  costUsd: number;
  /** Coût moyen par action (null sans action comptée). */
  perActionUsd: number | null;
}

export interface KindCost {
  kind: string;
  actions: number;
  costUsd: number;
  /** Mesuré sur 30 jours, sinon estimation de repli. */
  perActionUsd: number;
  measured: boolean;
}

export interface ModelInfo {
  /** Rôle : textes, Rétention, images (variables GEMINI_*). */
  roles: string[];
  model: string;
  price: ModelPrice;
  next: (ModelPrice & { from: string }) | null;
  calls30: number;
  costUsd30: number;
}

export interface AiCostReport {
  pricingVerifiedAt: string;
  alertUsd: number;
  today: { day: string; costUsd: number };
  last30: { rows: CostRow[]; totalUsd: number; byDay: { day: string; costUsd: number }[]; byKind: KindCost[] };
  models: ModelInfo[];
  budgets: { bucket: "trial" | "free"; type: "image" | "text"; used: number; limit: number }[];
  topAccounts: { userId: string; plan: string; costUsd: number; actions: number }[];
  conversion: {
    trialsEnded: number;
    trialsConverted: number;
    rate: number | null;
    months: { month: string; trialAiCostUsd: number; newSubscribers: number; costPerSubscriber: number | null }[];
  };
}

function daysBack(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => parisDay(new Date(now.getTime() - (n - 1 - i) * DAY)));
}

function monthKey(d: Date): string {
  return parisDay(d).slice(0, 7);
}

export async function loadAiCostReport(now: Date = new Date()): Promise<AiCostReport> {
  const days30 = daysBack(now, 30);
  const today = parisDay(now);
  const rows = await prisma.aiUsageDaily.findMany({ where: { day: { gte: days30[0] } } });

  // Lignes d'avant le 30/09/2026 : sans modèle ni actions comptées. Elles
  // restent dans les coûts, mais pas dans le coût moyen PAR ACTION (sinon
  // leur coût serait divisé par des actions qu'elles n'ont jamais comptées).
  const measured = (r: { model: string }) => r.model !== "";

  // 30 jours, par palier et par type.
  const grouped = new Map<string, CostRow>();
  const measuredCost = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.plan}:${r.kind}`;
    const g = grouped.get(key) ?? { plan: r.plan, kind: r.kind, calls: 0, actions: 0, inputTokens: 0, videoTokens: 0, outputTokens: 0, images: 0, costUsd: 0, perActionUsd: null };
    g.calls += r.calls;
    g.actions += r.actions;
    g.inputTokens += r.inputTokens;
    g.videoTokens += r.videoTokens;
    g.outputTokens += r.outputTokens;
    g.images += r.images;
    g.costUsd += rowCostUsd(r);
    grouped.set(key, g);
    if (measured(r)) measuredCost.set(key, (measuredCost.get(key) ?? 0) + rowCostUsd(r));
  }
  const costRows = Array.from(grouped.values())
    .map((g) => ({ ...g, perActionUsd: g.actions > 0 ? (measuredCost.get(`${g.plan}:${g.kind}`) ?? 0) / g.actions : null }))
    .sort((a, b) => b.costUsd - a.costUsd);
  const byDay = days30.map((day) => ({ day, costUsd: rows.filter((r) => r.day === day).reduce((s, r) => s + rowCostUsd(r), 0) }));

  // Coût moyen par action, par type, tous paliers (30 jours ; sinon repli).
  const byKind: KindCost[] = KINDS.map((kind) => {
    const kr = rows.filter((r) => r.kind === kind && measured(r));
    const actions = kr.reduce((s, r) => s + r.actions, 0);
    const costUsd = kr.reduce((s, r) => s + rowCostUsd(r), 0);
    return { kind, actions, costUsd, perActionUsd: actions > 0 ? costUsd / actions : FALLBACK_COST_PER_ACTION[kind], measured: actions > 0 };
  });
  const perAction: Record<string, number> = Object.fromEntries(byKind.map((k) => [k.kind, k.perActionUsd]));

  // Modèles : ceux des variables GEMINI_* et ceux vus sur 30 jours.
  const cfg = configuredModels();
  const roles = new Map<string, string[]>();
  const addRole = (model: string, role: string) => roles.set(model, [...(roles.get(model) ?? []), role]);
  addRole(cfg.text, "Textes, Studio, assistant");
  addRole(cfg.retention, "Rétention");
  addRole(cfg.image, "Images");
  for (const r of rows) if (r.model && !roles.has(r.model)) roles.set(r.model, ["Historique"]);
  const models: ModelInfo[] = pricesInForce(Array.from(roles.keys()), today).map((p) => {
    const mr = rows.filter((r) => r.model === p.model);
    return { ...p, roles: roles.get(p.model) ?? [], calls30: mr.reduce((s, r) => s + r.calls, 0), costUsd30: mr.reduce((s, r) => s + rowCostUsd(r), 0) };
  });

  // Budgets du jour.
  const budgetRows = await prisma.publicToolUsage.findMany({ where: { ipHash: BUDGET_KEY, day: today }, select: { tool: true, count: true } });
  const budgets = (["trial", "free"] as const).flatMap((bucket) =>
    (["image", "text"] as const).map((type) => ({
      bucket,
      type,
      used: budgetRows.find((b) => b.tool === `budget:${bucket}:${type}`)?.count ?? 0,
      limit: globalAiBudget(bucket)[type]
    }))
  );

  // Comptes du mois : quotas du mois par compte (empreintes), textes sur 7 jours.
  const days7 = daysBack(now, 7);
  const [y, m] = parisMonth(now).split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1) - 2 * 3600_000); // minuit à Paris, au plus tôt
  const monthly = await prisma.aiMonthlyUsage.findMany({
    where: { OR: [{ period: parisMonth(now) }, { period: { startsWith: "essai:" }, updatedAt: { gte: monthStart } }], count: { gt: 0 } },
    select: { keyHash: true, kind: true, count: true }
  });
  const texts = await prisma.publicToolUsage.findMany({ where: { day: { gte: days7[0] }, tool: "ai-text" }, select: { ipHash: true, count: true } });
  const byKey = new Map<string, { costUsd: number; actions: number }>();
  const add = (keyHash: string, kind: string, count: number) => {
    const e = byKey.get(keyHash) ?? { costUsd: 0, actions: 0 };
    e.costUsd += count * (perAction[kind] ?? 0);
    e.actions += count;
    byKey.set(keyHash, e);
  };
  for (const c of monthly) add(c.keyHash, c.kind, c.count);
  for (const c of texts) add(c.ipHash, "text", c.count);
  const accounts = new Map<string, { costUsd: number; actions: number }>();
  if (byKey.size > 0) {
    // Les compteurs ne gardent qu'une empreinte du compte : on la recalcule
    // pour chaque compte (les plus récents d'abord) et on fait le lien.
    const candidates = await prisma.user.findMany({ select: { id: true }, take: 20_000, orderBy: { createdAt: "desc" } });
    for (const u of candidates) {
      const e = byKey.get(accountCounterKey(u.id));
      if (e) accounts.set(u.id, { ...e });
    }
  }
  const top = Array.from(accounts.entries())
    .sort((a, b) => b[1].costUsd - a[1].costUsd)
    .slice(0, 20);
  const topAccounts = await Promise.all(top.map(async ([userId, e]) => ({ userId, plan: (await getUserPlan(userId)).plan as string, costUsd: e.costUsd, actions: e.actions })));

  // Conversion (lot G0) et coût IA des essais par abonné gagné.
  const trials = await prisma.user.findMany({ where: { trialEndsAt: { not: null, lte: now } }, select: { firstPaidAt: true } });
  const trialsConverted = trials.filter((t) => t.firstPaidAt).length;
  const thisMonth = monthKey(now);
  const prevMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
  const monthRows = await prisma.aiUsageDaily.findMany({ where: { plan: "TRIAL", day: { gte: `${prevMonth}-01` } } });
  const months = await Promise.all(
    [thisMonth, prevMonth].map(async (month) => {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      const trialAiCostUsd = monthRows.filter((r) => r.day.startsWith(month)).reduce((s, r) => s + rowCostUsd(r), 0);
      const newSubscribers = await prisma.user.count({ where: { firstPaidAt: { gte: start, lt: end } } });
      return { month, trialAiCostUsd, newSubscribers, costPerSubscriber: newSubscribers > 0 ? trialAiCostUsd / newSubscribers : null };
    })
  );

  return {
    pricingVerifiedAt: AI_PRICING.verifiedAt,
    alertUsd: dailyCostAlertUsd(),
    today: { day: today, costUsd: byDay[byDay.length - 1]?.costUsd ?? 0 },
    last30: { rows: costRows, totalUsd: costRows.reduce((s, r) => s + r.costUsd, 0), byDay, byKind },
    models,
    budgets,
    topAccounts,
    conversion: { trialsEnded: trials.length, trialsConverted, rate: trials.length ? trialsConverted / trials.length : null, months }
  };
}
