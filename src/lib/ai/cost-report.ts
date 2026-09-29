// Rapport des coûts de l'IA pour la page propriétaire /admin/ia (lot E5,
// brief « Essai 14 jours », 29/09/2026). Tout est ESTIMÉ (jetons × prix de
// src/lib/ai/pricing.ts) : les montants facturés par Google font foi dans
// Google Cloud → Facturation.
//
//   - coût des 30 derniers jours par palier et par type (AiUsageDaily) ;
//   - budgets globaux de l'Essai et du Gratuit utilisés aujourd'hui ;
//   - les 20 comptes les plus coûteux de la semaine (identifiant et palier
//     seulement), calculés à la volée depuis les historiques existants :
//     compteurs du jour par compte (PublicToolUsage, gardés 8 jours) et
//     générations du Studio ;
//   - lien avec la conversion : taux essai → payant (lot G0) et coût IA des
//     essais d'un mois divisé par les abonnés gagnés ce mois-là.
import { prisma } from "@/lib/prisma";
import { accountCounterKey, parisDay } from "@/lib/ai/counters";
import { AI_PRICING } from "@/lib/ai/pricing";
import { BUDGET_KEY, globalAiBudget } from "@/lib/ai/guard";
import { dailyCostAlertUsd, rowCostUsd } from "@/lib/ai/usage";
import { getUserPlan } from "@/lib/billing/plan";

const DAY = 86_400_000;
const KINDS = ["text", "image", "studio", "assistant", "retention"] as const;
/** Estimations de repli par appel (brief, à revérifier) quand la semaine n'a pas de mesure. */
const FALLBACK_COST_PER_CALL: Record<string, number> = { text: 0.0035, image: 0.04, studio: 0.006, assistant: 0.004, retention: 0.006 };

export interface CostRow {
  plan: string;
  kind: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  images: number;
  costUsd: number;
}

export interface AiCostReport {
  pricingVerifiedAt: string;
  alertUsd: number;
  today: { day: string; costUsd: number };
  last30: { rows: CostRow[]; totalUsd: number; byDay: { day: string; costUsd: number }[] };
  budgets: { bucket: "trial" | "free"; type: "image" | "text"; used: number; limit: number }[];
  topAccounts: { userId: string; plan: string; costUsd: number; calls: number }[];
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

  // 30 jours, par palier et par type.
  const grouped = new Map<string, CostRow>();
  for (const r of rows) {
    const key = `${r.plan}:${r.kind}`;
    const g = grouped.get(key) ?? { plan: r.plan, kind: r.kind, calls: 0, inputTokens: 0, outputTokens: 0, images: 0, costUsd: 0 };
    g.calls += r.calls;
    g.inputTokens += r.inputTokens;
    g.outputTokens += r.outputTokens;
    g.images += r.images;
    g.costUsd += rowCostUsd(r);
    grouped.set(key, g);
  }
  const costRows = Array.from(grouped.values()).sort((a, b) => b.costUsd - a.costUsd);
  const byDay = days30.map((day) => ({ day, costUsd: rows.filter((r) => r.day === day).reduce((s, r) => s + rowCostUsd(r), 0) }));

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

  // Coût moyen par appel de la semaine, par type (mesuré, sinon estimation).
  const days7 = daysBack(now, 7);
  const weekRows = rows.filter((r) => r.day >= days7[0]);
  const perCall: Record<string, number> = {};
  for (const kind of KINDS) {
    const kr = weekRows.filter((r) => r.kind === kind);
    const calls = kr.reduce((s, r) => s + r.calls, 0);
    perCall[kind] = calls > 0 ? kr.reduce((s, r) => s + rowCostUsd(r), 0) / calls : FALLBACK_COST_PER_CALL[kind];
  }

  // Comptes de la semaine : compteurs par compte (empreintes) + Studio.
  const counters = await prisma.publicToolUsage.findMany({
    where: { day: { gte: days7[0] }, tool: { in: ["ai-text", "ai-image", "ai-assistant", "ai-retention"] } },
    select: { ipHash: true, tool: true, count: true }
  });
  const studio = await prisma.studioGeneration.groupBy({ by: ["userId"], where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } }, _count: { _all: true } });
  const byKey = new Map<string, { costUsd: number; calls: number }>();
  for (const c of counters) {
    const kind = c.tool.slice(3);
    const e = byKey.get(c.ipHash) ?? { costUsd: 0, calls: 0 };
    e.costUsd += c.count * (perCall[kind] ?? 0);
    e.calls += c.count;
    byKey.set(c.ipHash, e);
  }
  const accounts = new Map<string, { costUsd: number; calls: number }>();
  if (byKey.size > 0) {
    // Les compteurs ne gardent qu'une empreinte du compte : on la recalcule
    // pour chaque compte (les plus récents d'abord) et on fait le lien.
    const candidates = await prisma.user.findMany({ select: { id: true }, take: 20_000, orderBy: { createdAt: "desc" } });
    for (const u of candidates) {
      const e = byKey.get(accountCounterKey(u.id));
      if (e) accounts.set(u.id, { ...e });
    }
  }
  for (const s of studio) {
    const e = accounts.get(s.userId) ?? { costUsd: 0, calls: 0 };
    e.costUsd += s._count._all * perCall.studio;
    e.calls += s._count._all;
    accounts.set(s.userId, e);
  }
  const top = Array.from(accounts.entries())
    .sort((a, b) => b[1].costUsd - a[1].costUsd)
    .slice(0, 20);
  const topAccounts = await Promise.all(top.map(async ([userId, e]) => ({ userId, plan: (await getUserPlan(userId)).plan as string, costUsd: e.costUsd, calls: e.calls })));

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
    last30: { rows: costRows, totalUsd: costRows.reduce((s, r) => s + r.costUsd, 0), byDay },
    budgets,
    topAccounts,
    conversion: { trialsEnded: trials.length, trialsConverted, rate: trials.length ? trialsConverted / trials.length : null, months }
  };
}
