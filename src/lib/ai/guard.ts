// Porte unique de l'IA (lot E2, brief « Essai 14 jours », 29/09/2026).
//
// Tout appel à Gemini déclenché par un compte passe par assertAiAllowed(),
// qui vérifie DANS L'ORDRE, avant d'appeler Google :
//   1. le palier inclut ce type d'IA (limite du jour > 0, src/lib/plans.ts) ;
//   2. Gratuit et Essai : adresse email confirmée (les inscriptions Google,
//      Apple et Facebook comptent comme confirmées) → sinon 403
//      `email_unverified` ;
//   3. le quota du compte (heure de Paris), réservé atomiquement :
//        - Gratuit et Essai : TOUT usage compté, par compte, toutes marques
//          confondues (créer une 2e marque ne double pas le quota) ;
//        - Pro et Agence : comptage d'avant — outils gratuits, assistant et
//          Rétention ; les textes et images dans l'application ne sont pas
//          décomptés (Studio : son propre compteur, voir studio/generate.ts) ;
//   4. Gratuit et Essai, outils de /outils : plafond par adresse IP ;
//   5. Gratuit et Essai : budget global du jour, un par palier (images,
//      textes), réglable par variables d'environnement → sinon 429
//      `trial_ai_busy` (ou `free_ai_busy`), et une alerte au propriétaire.
// Les comptes payants ne sont jamais comptés ni bloqués par ce budget.
//
// L'appel lui-même passe par `allowance.run(fn)` : il est rangé dans la
// mesure des coûts (usage.ts) sous le bon palier, et si rien n'a été facturé
// par Google (erreur réseau, refus avant réponse), les réservations sont
// rendues. Seuls l'audit public (quota par IP) et les pages sans compte
// restent hors de cette porte.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type Plan } from "@/lib/plans";
import { getBrandPlan, getUserPlan, type UserPlanInfo } from "@/lib/billing/plan";
import { accountCounterKey, parisDay, readCounters, releaseCounter, reserveCounter } from "@/lib/ai/counters";
import { runWithAiContext, type AiCallContext } from "@/lib/ai/usage";
import { ipHashFromHeaders } from "@/lib/public-tools-limit";
import { alertOwner } from "@/lib/owner-alerts";
import { DEFAULT_TIMEZONE, utcToWallClock, wallClockToUtc } from "@/lib/timezone";

export type AiKind = "text" | "image" | "studio" | "assistant" | "retention";
export type AiSource = "app" | "tool";

export type AiRefusalReason =
  | "ai_assistant"
  | "studio"
  | "retention"
  | "email_unverified"
  | "trial_ai_limit"
  | "ai_daily_limit"
  | "ai_ip_limit"
  | "trial_ai_busy"
  | "free_ai_busy";

export interface AiRefusal {
  ok: false;
  status: number;
  reason: AiRefusalReason;
  error: string;
  plan: Plan;
  limit?: number;
}

export interface AiAllowance {
  ok: true;
  plan: Plan;
  /** Limite du jour comptée pour ce compte (null = non décompté). */
  limit: number | null;
  /** Restant après cette réservation (null = non décompté). */
  remaining: number | null;
  /** Exécute l'appel à l'IA ; réservations rendues si rien n'a été facturé. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Rend les réservations (appel annulé avant Gemini). */
  release(): Promise<void>;
}

/** Plafond par adresse IP et par jour (outils, Gratuit et Essai). */
export const TOOL_IP_DAILY_LIMITS = { text: 30, image: 6 } as const;

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/** Budget global du jour (tous comptes du palier confondus). */
export function globalAiBudget(bucket: "trial" | "free"): { image: number; text: number } {
  return bucket === "trial"
    ? { image: envInt("TRIAL_AI_DAILY_IMAGES", 100), text: envInt("TRIAL_AI_DAILY_TEXT_CALLS", 1000) }
    : { image: envInt("FREE_AI_DAILY_IMAGES", 100), text: envInt("FREE_AI_DAILY_TEXT_CALLS", 1000) };
}

export const BUDGET_KEY = "budget";

/** Limite du jour de ce type d'IA pour ce palier. */
export function aiDailyLimit(limits: UserPlanInfo["limits"], kind: AiKind): number {
  if (kind === "studio") return limits.studioDailyLimit;
  return limits.aiDaily[kind];
}

const KIND_LABEL: Record<AiKind, { many: string; unit: string }> = {
  text: { many: "générations de texte", unit: "textes" },
  image: { many: "images", unit: "miniatures" },
  studio: { many: "générations du Studio", unit: "générations du Studio" },
  assistant: { many: "messages de l'assistant", unit: "messages" },
  retention: { many: "analyses de rétention", unit: "analyses" }
};

const MISSING_REASON: Record<AiKind, AiRefusalReason> = { text: "ai_assistant", image: "ai_assistant", studio: "studio", assistant: "ai_assistant", retention: "retention" };

/** L'adresse compte comme confirmée pour l'IA (lien cliqué, ou Google / Apple / Facebook). */
export function aiEmailConfirmed(user: { emailVerifiedAt: Date | null; passwordHash: string | null; facebookLoginId: string | null } | null): boolean {
  if (!user) return false;
  return Boolean(user.emailVerifiedAt) || Boolean(user.facebookLoginId) || user.passwordHash === null;
}

function refuse(plan: Plan, status: number, reason: AiRefusalReason, error: string, limit?: number): AiRefusal {
  return { ok: false, status, reason, error, plan, ...(limit !== undefined ? { limit } : {}) };
}

/** Réponse HTTP d'un refus (la raison ouvre la bonne fenêtre côté navigateur). */
export function aiRefusalResponse(r: AiRefusal): NextResponse {
  return NextResponse.json({ error: r.error, reason: r.reason, plan: r.plan, ...(r.limit !== undefined ? { limit: r.limit } : {}) }, { status: r.status });
}

export async function assertAiAllowed(params: {
  /** Compte qui déclenche l'appel (adresse vérifiée, quota compté ici). */
  userId: string;
  /** Palier applicable (getUserPlan du compte, ou getBrandPlan de la marque). */
  plan: Pick<UserPlanInfo, "plan" | "limits">;
  kind: AiKind;
  source?: AiSource;
  /** En-têtes de la requête : plafond par adresse IP des outils. */
  headers?: Headers;
  /** Nombre d'unités (ex. une planche de stickers = plusieurs images). */
  amount?: number;
  now?: Date;
}): Promise<AiAllowance | AiRefusal> {
  const { plan, kind } = params;
  const planId = plan.plan;
  const limits = plan.limits;
  const source = params.source ?? "app";
  const amount = Math.max(1, params.amount ?? 1);
  const now = params.now ?? new Date();
  const day = parisDay(now);
  const limit = aiDailyLimit(limits, kind);

  // 1. Inclus dans le palier ?
  if (limit <= 0) {
    return refuse(planId, 402, MISSING_REASON[kind], `Cette fonction IA fait partie des paliers Pro et Agence. Passez à un palier supérieur dans Facturation.`);
  }

  // 2. Adresse confirmée (Gratuit, Essai).
  if (limits.aiGuardrails) {
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { emailVerifiedAt: true, passwordHash: true, facebookLoginId: true } });
    if (!aiEmailConfirmed(user)) {
      return refuse(planId, 403, "email_unverified", "Confirmez votre adresse email pour utiliser l'IA : cliquez sur le lien reçu à l'inscription, ou demandez-en un nouveau.");
    }
  }

  // Réservations à rendre : celles du compte (et de l'adresse IP) sont
  // rendues à tout échec — un échec n'est jamais décompté à l'utilisateur ;
  // celle du budget global seulement si Google n'a rien facturé.
  const accountReleases: (() => Promise<void>)[] = [];
  const budgetReleases: (() => Promise<void>)[] = [];
  const releaseAccount = async () => {
    for (const r of accountReleases.splice(0)) await r();
  };
  const releaseAll = async () => {
    await releaseAccount();
    for (const r of budgetReleases.splice(0)) await r();
  };

  // 3. Quota du compte.
  const counted = kind !== "studio" && (limits.aiGuardrails || source === "tool" || kind === "assistant" || kind === "retention");
  let remaining: number | null = null;
  if (counted) {
    const key = accountCounterKey(params.userId);
    const counter = `ai-${kind}`;
    const total = await reserveCounter(key, counter, day, limit, amount);
    if (total === null) {
      const label = KIND_LABEL[kind];
      if (limits.upgradeTo && limits.aiGuardrails) {
        const next = PLAN_LIMITS[limits.upgradeTo];
        const nextLimit = aiDailyLimit(next, kind);
        const trial = limits.aiBudgetBucket === "trial";
        const during = trial ? "Pendant l'essai" : `En ${limits.label}`;
        return refuse(
          planId,
          429,
          trial ? "trial_ai_limit" : "ai_daily_limit",
          `${during}, ${limit} ${label.unit} par jour : c'est atteint pour aujourd'hui (retour à minuit, heure de Paris). En ${next.label}, ${nextLimit}.`,
          limit
        );
      }
      return refuse(planId, 429, "ai_daily_limit", `Vous avez utilisé vos ${limit} ${label.many} d'aujourd'hui : le compteur repart à zéro à minuit (heure de Paris).`, limit);
    }
    remaining = Math.max(0, limit - total);
    accountReleases.push(() => releaseCounter(key, counter, day, amount));
  }

  // 4. Plafond par adresse IP (outils, Gratuit et Essai).
  if (limits.aiGuardrails && source === "tool" && params.headers && (kind === "text" || kind === "image")) {
    const ipKey = ipHashFromHeaders(params.headers);
    const counter = `ai-ip-${kind}`;
    const total = await reserveCounter(ipKey, counter, day, TOOL_IP_DAILY_LIMITS[kind], amount);
    if (total === null) {
      await releaseAll();
      return refuse(planId, 429, "ai_ip_limit", "Limite atteinte pour aujourd'hui depuis cette connexion. Revenez demain, ou passez à Pro pour générer davantage.");
    }
    accountReleases.push(() => releaseCounter(ipKey, counter, day, amount));
  }

  // 5. Budget global du jour (Gratuit, Essai).
  if (limits.aiBudgetBucket) {
    const bucket = limits.aiBudgetBucket;
    const type = kind === "image" ? "image" : "text";
    const budget = globalAiBudget(bucket)[type];
    const counter = `budget:${bucket}:${type}`;
    const units = type === "image" ? amount : 1;
    const total = await reserveCounter(BUDGET_KEY, counter, day, budget, units);
    if (total === null) {
      await releaseAll();
      void alertOwner({
        title: `IA : budget du jour atteint (${bucket === "trial" ? "Essai" : "Gratuit"}, ${type === "image" ? "images" : "textes"})`,
        body: `Le budget global de l'IA ${bucket === "trial" ? "des essais" : "du Gratuit"} est atteint aujourd'hui (${budget} ${type === "image" ? "images" : "appels texte"}). Les comptes concernés retrouvent l'IA à minuit ; les comptes payants ne sont pas touchés. Réglage : ${bucket === "trial" ? "TRIAL" : "FREE"}_AI_DAILY_${type === "image" ? "IMAGES" : "TEXT_CALLS"} sur Vercel.`,
        dedupeKey: `ai-budget:${bucket}:${type}:${day}`,
        href: "/admin/ia",
        actionLabel: "Voir les coûts"
      });
      return refuse(
        planId,
        429,
        bucket === "trial" ? "trial_ai_busy" : "free_ai_busy",
        bucket === "trial"
          ? "L'IA de l'essai a atteint sa limite du jour. Elle revient à minuit. En Pro, elle reste disponible."
          : "L'IA gratuite a atteint sa limite du jour. Elle revient à minuit. En Pro, elle reste disponible."
      );
    }
    budgetReleases.push(() => releaseCounter(BUDGET_KEY, counter, day, units));
  }

  return {
    ok: true,
    plan: planId,
    limit: counted ? limit : null,
    remaining,
    release: releaseAll,
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const ctx: AiCallContext = { plan: planId, kind, billed: false };
      try {
        return await runWithAiContext(ctx, fn);
      } catch (err) {
        // Échec : rien n'est décompté au compte ; le budget global garde ce
        // que Google a facturé (réponse reçue mais inutilisable).
        if (ctx.billed) await releaseAccount();
        else await releaseAll();
        throw err;
      }
    }
  };
}

export type AiQuotaSnapshot = Record<AiKind, { limit: number; used: number; remaining: number }>;

/**
 * Quotas du jour de ce compte, par type d'IA (pour /api/me, la page
 * Facturation et les écrans d'IA). Le Studio se compte sur ses générations
 * du jour (voir studio/generate.ts).
 */
export async function aiQuotaSnapshot(userId: string, plan: Pick<UserPlanInfo, "limits">, now: Date = new Date()): Promise<AiQuotaSnapshot> {
  const day = parisDay(now);
  const kinds: Exclude<AiKind, "studio">[] = ["text", "image", "assistant", "retention"];
  const counters = await readCounters(accountCounterKey(userId), kinds.map((k) => `ai-${k}`), day);
  const w = utcToWallClock(now, DEFAULT_TIMEZONE);
  const since = wallClockToUtc({ ...w, hour: 0, minute: 0 }, DEFAULT_TIMEZONE);
  const studioUsed = plan.limits.studioDailyLimit > 0 ? await prisma.studioGeneration.count({ where: { userId, createdAt: { gte: since } } }) : 0;
  const entry = (limit: number, used: number) => ({ limit, used, remaining: Math.max(0, limit - used) });
  return {
    text: entry(plan.limits.aiDaily.text, counters["ai-text"]),
    image: entry(plan.limits.aiDaily.image, counters["ai-image"]),
    assistant: entry(plan.limits.aiDaily.assistant, counters["ai-assistant"]),
    retention: entry(plan.limits.aiDaily.retention, counters["ai-retention"]),
    studio: entry(plan.limits.studioDailyLimit, studioUsed)
  };
}

const NOT_INCLUDED: Record<AiKind, { reason: AiRefusalReason; error: string }> = {
  text: { reason: "ai_assistant", error: "L'assistant IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." },
  image: { reason: "ai_assistant", error: "L'assistant IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." },
  assistant: { reason: "ai_assistant", error: "L'assistant IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." },
  retention: { reason: "retention", error: "L'analyse de rétention fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." },
  studio: { reason: "studio", error: "Le Studio fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." }
};

/**
 * Porte des appels d'IA DANS l'application (Composer, assistant, Rétention,
 * miniatures…) : le palier est celui de la marque (celui de son
 * propriétaire) quand l'appel porte sur une marque, sinon celui du compte.
 * L'IA de l'application reste réservée aux paliers qui l'incluent
 * (aiEnabled : Essai, Pro, Agence) ; le Gratuit n'a que les outils de
 * /outils. Le quota est compté sur le compte qui déclenche l'appel.
 */
export async function gateAppAi(params: { userId: string; brandId?: string | null; kind: AiKind; amount?: number; now?: Date }): Promise<
  { ok: true; allowance: AiAllowance; info: UserPlanInfo } | { ok: false; response: NextResponse }
> {
  const info = params.brandId ? await getBrandPlan(params.brandId) : await getUserPlan(params.userId);
  if (!info.limits.aiEnabled) {
    const n = NOT_INCLUDED[params.kind];
    return { ok: false, response: NextResponse.json({ error: n.error, reason: n.reason, plan: info.plan }, { status: 402 }) };
  }
  const gate = await assertAiAllowed({ userId: params.userId, plan: info, kind: params.kind, source: "app", amount: params.amount, now: params.now });
  if (!gate.ok) return { ok: false, response: aiRefusalResponse(gate) };
  return { ok: true, allowance: gate, info };
}
