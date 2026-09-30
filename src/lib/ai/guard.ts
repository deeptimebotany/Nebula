// Porte unique de l'IA (lot E2, brief « Essai 14 jours », 29/09/2026 ; quotas
// MENSUELS depuis le passage de Gemini au palier payant, 30/09/2026).
//
// Tout appel à Gemini déclenché par un compte passe par assertAiAllowed(),
// qui vérifie DANS L'ORDRE, avant d'appeler Google :
//   1. le palier inclut ce type d'IA (limite > 0, src/lib/plans.ts) ;
//   2. le compte a confirmé avoir 18 ans ou plus (conditions de l'API
//      Gemini) → sinon 403 `age_unconfirmed` ; Gratuit et Essai : adresse
//      email confirmée (Google, Apple et Facebook comptent comme confirmées)
//      → sinon 403 `email_unverified` ;
//   3. le quota du compte, réservé atomiquement :
//        - analyses Rétention, images, Studio, messages de l'assistant : PAR
//          MOIS du calendrier (heure de Paris), pour tous les paliers ;
//          pendant un essai, sur toute sa durée ; une fois le quota du mois
//          atteint, Rétention puise dans les analyses achetées (Pro, Agence) ;
//        - textes : PAR JOUR, en Gratuit et en Essai partout, et sur les
//          outils de /outils pour tous (non décomptés dans l'application en
//          Pro et Agence) ;
//   4. Gratuit et Essai, outils de /outils : plafond par adresse IP et par jour ;
//   5. Gratuit et Essai : budget global du jour, un par palier (images,
//      textes), réglable par variables d'environnement → sinon 429
//      `trial_ai_busy` (ou `free_ai_busy`), et une alerte au propriétaire.
// Les comptes payants ne sont jamais comptés ni bloqués par ce budget.
//
// L'appel lui-même passe par `allowance.run(fn)` : il est rangé dans la
// mesure des coûts (usage.ts) sous le bon palier, compté comme UNE action
// s'il a abouti, et si rien n'a été facturé par Google (erreur réseau, refus
// avant réponse), les réservations sont rendues. Seuls l'audit public (quota
// par IP) et les pages sans compte restent hors de cette porte.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, RETENTION_PACK, formatEuroCents, type Plan } from "@/lib/plans";
import { getBrandPlan, getUserPlan, type UserPlanInfo } from "@/lib/billing/plan";
import {
  accountCounterKey,
  giveBackRetentionCredit,
  nextParisMonthStart,
  parisDay,
  parisMonth,
  readCounters,
  readMonthly,
  releaseCounter,
  releaseMonthly,
  reserveCounter,
  reserveMonthly,
  takeRetentionCredit,
  trialPeriod
} from "@/lib/ai/counters";
import { recordAiAction, runWithAiContext, type AiCallContext } from "@/lib/ai/usage";
import { ipHashFromHeaders } from "@/lib/public-tools-limit";
import { alertOwner } from "@/lib/owner-alerts";

export type AiKind = "text" | "image" | "studio" | "assistant" | "retention";
export type MonthlyAiKind = Exclude<AiKind, "text">;
export type AiSource = "app" | "tool";

export const MONTHLY_AI_KINDS: MonthlyAiKind[] = ["retention", "image", "studio", "assistant"];

export type AiRefusalReason =
  | "ai_assistant"
  | "studio"
  | "retention"
  | "email_unverified"
  | "age_unconfirmed"
  | "trial_ai_limit"
  | "ai_daily_limit"
  | "ai_monthly_limit"
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
  /** Rétention : une recharge peut être achetée (Pro, Agence). */
  retentionPack?: boolean;
}

export interface AiAllowance {
  ok: true;
  plan: Plan;
  /** Limite comptée pour ce compte (null = non décompté). */
  limit: number | null;
  /** Restant après cette réservation (null = non décompté). */
  remaining: number | null;
  /** « jour », « mois » ou « essai » (null = non décompté). */
  per: "day" | "month" | "trial" | null;
  /** Rétention : l'analyse utilise une analyse achetée (quota du mois atteint). */
  usedCredit: boolean;
  /** Exécute l'appel à l'IA ; réservations rendues si rien n'a été facturé. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Rend les réservations (appel annulé avant Gemini). */
  release(): Promise<void>;
  /**
   * Rend le quota du COMPTE seulement (réponse de Google reçue mais
   * inutilisable : rien n'est décompté à l'utilisateur ; le budget global
   * garde ce qui a été facturé).
   */
  refundAccount(): Promise<void>;
}

type PlanForAi = Pick<UserPlanInfo, "plan" | "limits"> & Partial<Pick<UserPlanInfo, "aiTrialUntil">>;

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

export function isMonthlyKind(kind: AiKind): kind is MonthlyAiKind {
  return kind !== "text";
}

/** Limite de ce type d'IA pour ce palier : par jour (textes) ou par mois. */
export function aiLimit(limits: UserPlanInfo["limits"], kind: AiKind): number {
  return kind === "text" ? limits.aiDaily.text : limits.aiMonthly[kind];
}

/**
 * Période des quotas mensuels : le mois du calendrier (« AAAA-MM », heure
 * de Paris), ou toute la durée d'un essai (Essai, ancien essai IA du
 * parrainage) — sinon un essai à cheval sur deux mois aurait deux quotas.
 */
export function aiPeriodFor(plan: PlanForAi, now: Date = new Date()): { key: string; per: "month" | "trial" } {
  // Seulement pour un palier sans paiement (Essai, Gratuit avec l'IA du parrainage).
  if (plan.aiTrialUntil && !plan.limits.purchasable) return { key: trialPeriod(plan.aiTrialUntil), per: "trial" };
  return { key: parisMonth(now), per: "month" };
}

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « le 1er novembre » : date de remise à zéro des quotas du mois. */
export function monthlyResetLabel(now: Date = new Date()): string {
  const [, m] = nextParisMonthStart(now).split("-").map(Number);
  return `le 1er ${MONTHS_FR[m - 1]}`;
}

const KIND_LABEL: Record<AiKind, { many: string; unit: string }> = {
  text: { many: "générations de texte", unit: "textes" },
  image: { many: "images", unit: "miniatures" },
  studio: { many: "générations du Studio", unit: "générations du Studio" },
  assistant: { many: "messages à l'assistant", unit: "messages" },
  retention: { many: "analyses Rétention", unit: "analyses Rétention" }
};

const MISSING_REASON: Record<AiKind, AiRefusalReason> = { text: "ai_assistant", image: "ai_assistant", studio: "studio", assistant: "ai_assistant", retention: "retention" };

/** L'adresse compte comme confirmée pour l'IA (lien cliqué, ou Google / Apple / Facebook). */
export function aiEmailConfirmed(user: { emailVerifiedAt: Date | null; passwordHash: string | null; facebookLoginId: string | null } | null): boolean {
  if (!user) return false;
  return Boolean(user.emailVerifiedAt) || Boolean(user.facebookLoginId) || user.passwordHash === null;
}

function refuse(plan: Plan, status: number, reason: AiRefusalReason, error: string, extra: { limit?: number; retentionPack?: boolean } = {}): AiRefusal {
  return { ok: false, status, reason, error, plan, ...extra };
}

/** Réponse HTTP d'un refus (la raison ouvre la bonne fenêtre côté navigateur). */
export function aiRefusalResponse(r: AiRefusal): NextResponse {
  return NextResponse.json(
    { error: r.error, reason: r.reason, plan: r.plan, ...(r.limit !== undefined ? { limit: r.limit } : {}), ...(r.retentionPack ? { retentionPack: true } : {}) },
    { status: r.status }
  );
}

/** Message d'un quota atteint (mois, essai ou jour). */
function quotaMessage(limits: UserPlanInfo["limits"], kind: AiKind, limit: number, per: "day" | "month" | "trial", now: Date, canBuyPack: boolean): string {
  const label = KIND_LABEL[kind];
  const next = limits.upgradeTo ? PLAN_LIMITS[limits.upgradeTo] : null;
  const nextLimit = next ? aiLimit(next, kind) : 0;
  if (per === "trial") {
    return `Pendant l'essai, ${limit} ${label.unit} en tout : c'est atteint.${next && nextLimit > 0 ? ` En ${next.label}, ${nextLimit} par mois.` : ""}`;
  }
  if (per === "day") {
    if (next && limits.aiGuardrails) return `En ${limits.label}, ${limit} ${label.unit} par jour : c'est atteint pour aujourd'hui (retour à minuit, heure de Paris). En ${next.label}, ${aiLimit(next, kind)}.`;
    return `Vous avez utilisé vos ${limit} ${label.many} d'aujourd'hui : le compteur repart à zéro à minuit (heure de Paris).`;
  }
  const base = `Vous avez utilisé vos ${limit} ${label.many} de ce mois-ci : le compteur repart ${monthlyResetLabel(now)}.`;
  if (canBuyPack) return `${base} Vous pouvez ajouter ${RETENTION_PACK.credits} analyses pour ${formatEuroCents(RETENTION_PACK.priceCents)}, sans date limite.`;
  if (next && nextLimit > limit) return `${base} En ${next.label}, ${nextLimit} par mois.`;
  return base;
}

export async function assertAiAllowed(params: {
  /** Compte qui déclenche l'appel (âge, adresse vérifiée, quota compté ici). */
  userId: string;
  /** Palier applicable (getUserPlan du compte, ou getBrandPlan de la marque). */
  plan: PlanForAi;
  kind: AiKind;
  source?: AiSource;
  /** En-têtes de la requête : plafond par adresse IP des outils. */
  headers?: Headers;
  /** Nombre d'unités (ex. plusieurs images d'un coup). */
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
  const limit = aiLimit(limits, kind);

  // 1. Inclus dans le palier ?
  if (limit <= 0) {
    return refuse(planId, 402, MISSING_REASON[kind], `Cette fonction IA fait partie des paliers Pro et Agence. Passez à un palier supérieur dans Facturation.`);
  }

  // 2. Âge (tous les paliers) et adresse confirmée (Gratuit, Essai).
  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { emailVerifiedAt: true, passwordHash: true, facebookLoginId: true, ageConfirmedAt: true } });
  if (!user?.ageConfirmedAt) {
    return refuse(planId, 403, "age_unconfirmed", "Nebula est réservé aux personnes de 18 ans et plus : confirmez votre âge (fenêtre à l'ouverture de Nebula) pour utiliser l'IA.");
  }
  if (limits.aiGuardrails && !aiEmailConfirmed(user)) {
    return refuse(planId, 403, "email_unverified", "Confirmez votre adresse email pour utiliser l'IA : cliquez sur le lien reçu à l'inscription, ou demandez-en un nouveau.");
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
  const key = accountCounterKey(params.userId);
  let remaining: number | null = null;
  let per: AiAllowance["per"] = null;
  let usedCredit = false;
  if (isMonthlyKind(kind)) {
    const period = aiPeriodFor(plan, now);
    per = period.per;
    const total = await reserveMonthly(key, period.key, kind, limit, amount);
    if (total === null) {
      // Rétention en Pro / Agence : analyses achetées, après le quota du mois.
      const packs = kind === "retention" && limits.retentionPacks;
      if (packs && amount === 1 && (await takeRetentionCredit(params.userId))) {
        usedCredit = true;
        remaining = 0;
        accountReleases.push(() => giveBackRetentionCredit(params.userId));
      } else {
        return refuse(planId, 429, per === "trial" ? "trial_ai_limit" : "ai_monthly_limit", quotaMessage(limits, kind, limit, per, now, packs), { limit, ...(packs ? { retentionPack: true } : {}) });
      }
    } else {
      remaining = Math.max(0, limit - total);
      accountReleases.push(() => releaseMonthly(key, period.key, kind, amount));
    }
  } else if (limits.aiGuardrails || source === "tool") {
    per = "day";
    const counter = `ai-${kind}`;
    const total = await reserveCounter(key, counter, day, limit, amount);
    if (total === null) {
      return refuse(planId, 429, limits.aiBudgetBucket === "trial" ? "trial_ai_limit" : "ai_daily_limit", quotaMessage(limits, kind, limit, "day", now, false), { limit });
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

  const counted = per !== null;
  return {
    ok: true,
    plan: planId,
    limit: counted ? limit : null,
    remaining,
    per,
    usedCredit,
    release: releaseAll,
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const ctx: AiCallContext = { plan: planId, kind, billed: false, model: null };
      let result: T;
      try {
        result = await runWithAiContext(ctx, fn);
      } catch (err) {
        // Échec : rien n'est décompté au compte ; le budget global garde ce
        // que Google a facturé (réponse reçue mais inutilisable).
        if (ctx.billed) await releaseAccount();
        else await releaseAll();
        throw err;
      }
      // Une action aboutie (une analyse, une image, un message…) : base du
      // coût moyen par action de /admin/ia (seulement si Google a répondu).
      if (ctx.billed) await recordAiAction(ctx, amount, now);
      return result;
    },
    refundAccount: releaseAccount
  };
}

export interface AiQuotaEntry {
  limit: number;
  used: number;
  remaining: number;
  /** « day » (textes), « month » ou « trial » (toute la durée de l'essai). */
  per: "day" | "month" | "trial";
}

export type AiQuotaSnapshot = Record<AiKind, AiQuotaEntry> & {
  /** Analyses Rétention achetées restantes (recharges). */
  retentionCredits: number;
  /** Recharges achetables et utilisables avec ce palier. */
  retentionPacks: boolean;
  /** Remise à zéro des quotas du mois (« AAAA-MM-01 »), null pendant un essai. */
  resetsOn: string | null;
};

/**
 * Ce qu'il reste à ce compte, par type d'IA (pour /api/me, la page
 * Facturation, Rétention, le Studio et les outils).
 */
export async function aiQuotaSnapshot(userId: string, plan: PlanForAi, now: Date = new Date()): Promise<AiQuotaSnapshot> {
  const key = accountCounterKey(userId);
  const period = aiPeriodFor(plan, now);
  const [daily, monthly, user] = await Promise.all([
    readCounters(key, ["ai-text"], parisDay(now)),
    readMonthly(key, period.key, MONTHLY_AI_KINDS),
    prisma.user.findUnique({ where: { id: userId }, select: { retentionCredits: true } })
  ]);
  const entry = (limit: number, used: number, per: AiQuotaEntry["per"]): AiQuotaEntry => ({ limit, used, remaining: Math.max(0, limit - used), per });
  const m = plan.limits.aiMonthly;
  return {
    text: entry(plan.limits.aiDaily.text, daily["ai-text"], "day"),
    retention: entry(m.retention, monthly.retention, period.per),
    image: entry(m.image, monthly.image, period.per),
    studio: entry(m.studio, monthly.studio, period.per),
    assistant: entry(m.assistant, monthly.assistant, period.per),
    retentionCredits: user?.retentionCredits ?? 0,
    retentionPacks: plan.limits.retentionPacks,
    resetsOn: period.per === "month" ? nextParisMonthStart(now) : null
  };
}

const NOT_INCLUDED: Record<AiKind, { reason: AiRefusalReason; error: string }> = {
  text: { reason: "ai_assistant", error: "L'assistant IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." },
  image: { reason: "ai_assistant", error: "La génération d'images fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." },
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
