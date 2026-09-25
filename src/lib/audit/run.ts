// Audit de présence — exécution et enregistrement (serveur uniquement).
//
// Parcours d'un audit (POST /api/public/audit) :
//  1. mêmes comptes analysés dans les 24 h → le rapport existant est
//     resservi, sans nouvel appel aux plateformes ni quota consommé (sauf
//     si un e-mail est demandé : l'envoi compte alors comme un audit) ;
//  2. quota : 3 audits par jour et par IP (empreinte, jamais l'IP) ;
//  3. les sources en parallèle, 8 s au plus chacune ; une source en échec
//     donne un bloc « non analysable », jamais un rapport en erreur ;
//  4. score et recommandations par règles (score.ts), enregistrement pour
//     30 jours sous un jeton secret ;
//  5. e-mail facultatif (lien du rapport, l'adresse n'est pas conservée)
//     et, sur case cochée à part, inscription aux conseils Nebula (double
//     confirmation, tool-leads.ts).
// Les conseils de Gemini sont écrits après coup (ensureAdvice), à
// l'ouverture du rapport : le rapport s'affiche sans les attendre.
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { EMAIL_COLORS, emailButton, emailFrame } from "@/lib/emails/brand";
import { publicAppUrl } from "@/lib/account-security";
import { recordToolLead } from "@/lib/tool-leads";
import { trackGrowth } from "@/lib/growth";
import type { QuotaResult } from "@/lib/public-tools-limit";
import { GeminiQuotaError, isAiEnabled } from "@/lib/ai/gemini";
import { inputKeyText } from "./parse-input";
import { buildResult, readableSources } from "./score";
import { generateAdvice } from "./advice";
import { auditYoutube } from "./sources/youtube";
import { auditInstagram } from "./sources/instagram";
import { auditTiktok } from "./sources/tiktok";
import { auditWebsite } from "./sources/website";
import {
  AUDIT_CACHE_HOURS,
  AUDIT_DAILY_LIMIT,
  AUDIT_RETENTION_DAYS,
  type AuditAdvice,
  type AuditInput,
  type AuditResult,
  type AuditSourceKey,
  type AuditSources,
  type SourceOutcome,
  type SourceStatus
} from "./types";

const DAY = 86_400_000;
export const SOURCE_DEADLINE_MS = 8_000;
/** Essais sans aucune source lisible rendus au quota, par jour et par IP (au-delà, ils comptent). */
export const AUDIT_MISS_LIMIT = 10;
export const MAX_ADVICE_ATTEMPTS = 2;

// --- Accès à la table (types minimaux, comme prisma-extra.ts) -------------------

export interface PublicAuditRow {
  id: string;
  token: string;
  inputKey: string;
  input: unknown;
  result: unknown;
  score: number | null;
  sources: string;
  advice: unknown;
  adviceAttempts: number;
  ipHash: string;
  emailSentAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}

interface PublicAuditDelegate {
  findFirst(args: unknown): Promise<PublicAuditRow | null>;
  findUnique(args: unknown): Promise<PublicAuditRow | null>;
  create(args: unknown): Promise<PublicAuditRow>;
  update(args: unknown): Promise<PublicAuditRow>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
  count(args?: unknown): Promise<number>;
}
export const publicAuditDb = (prisma as unknown as { publicAudit: PublicAuditDelegate }).publicAudit;

// --- Sources ----------------------------------------------------------------------

export interface SourceRunners {
  youtube: typeof auditYoutube;
  instagram: typeof auditInstagram;
  tiktok: typeof auditTiktok;
  website: typeof auditWebsite;
}

const DEFAULT_RUNNERS: SourceRunners = { youtube: auditYoutube, instagram: auditInstagram, tiktok: auditTiktok, website: auditWebsite };

/** Une source qui dépasse le délai devient « indisponible » ; les autres continuent. */
async function withDeadline<T>(work: Promise<SourceOutcome<T>>, ms: number): Promise<SourceOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<SourceOutcome<T>>((resolve) => {
    timer = setTimeout(() => resolve({ status: "unavailable", message: `Pas de réponse en ${Math.round(ms / 1000)} secondes : réessayez dans un instant.` }), ms);
  });
  try {
    return await Promise.race([work.catch((): SourceOutcome<T> => ({ status: "unavailable", message: "Lecture impossible pour le moment." })), late]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runSources(input: AuditInput, runners: SourceRunners = DEFAULT_RUNNERS, deadlineMs = SOURCE_DEADLINE_MS): Promise<AuditSources> {
  const perCall = Math.max(1_000, deadlineMs - 2_000);
  const [youtube, instagram, tiktok, website] = await Promise.all([
    input.youtube ? withDeadline(runners.youtube(input.youtube, perCall), deadlineMs) : undefined,
    input.instagram ? withDeadline(runners.instagram(input.instagram, perCall), deadlineMs) : undefined,
    input.tiktok ? withDeadline(runners.tiktok(input.tiktok, perCall), deadlineMs) : undefined,
    input.website ? withDeadline(runners.website(input.website, perCall), deadlineMs) : undefined
  ]);
  const out: AuditSources = {};
  if (youtube) out.youtube = youtube;
  if (instagram) out.instagram = instagram;
  if (tiktok) out.tiktok = tiktok;
  if (website) out.website = website;
  return out;
}

export type SourceSummary = Partial<Record<AuditSourceKey, { status: SourceStatus; message?: string }>>;

function summarize(sources: AuditSources): SourceSummary {
  const out: SourceSummary = {};
  for (const key of Object.keys(sources) as AuditSourceKey[]) {
    const s = sources[key];
    if (s) out[key] = { status: s.status, ...(s.message ? { message: s.message } : {}) };
  }
  return out;
}

// --- Création ----------------------------------------------------------------------

export function inputKey(input: AuditInput): string {
  return createHash("sha256").update(inputKeyText(input)).digest("hex");
}

export type CreateAuditResult =
  | { ok: true; token: string; cached: boolean; sources: SourceSummary }
  | { ok: false; status: number; error: string; sources?: SourceSummary };

export async function createAudit(params: {
  input: AuditInput;
  ipHash: string;
  consumeQuota: () => Promise<QuotaResult>;
  /**
   * Aucune source lisible (faute de frappe, compte introuvable) : l'essai est
   * rendu au quota, dans la limite de AUDIT_MISS_LIMIT essais ratés par jour
   * (au-delà, il compte : les sources ont bien été appelées).
   */
  refundMiss?: () => Promise<void>;
  email?: string | null;
  tips?: boolean;
  now?: Date;
  runners?: SourceRunners;
}): Promise<CreateAuditResult> {
  const now = params.now ?? new Date();
  const key = inputKey(params.input);
  const email = params.email?.trim().toLowerCase() || null;

  const cached = await publicAuditDb.findFirst({
    where: { inputKey: key, createdAt: { gte: new Date(now.getTime() - AUDIT_CACHE_HOURS * 3_600_000) }, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" }
  });
  if (cached && !email) {
    return { ok: true, token: cached.token, cached: true, sources: summarize((cached.result as AuditResult).sources) };
  }

  const quota = await params.consumeQuota();
  if (!quota.ok) {
    return {
      ok: false,
      status: 429,
      error: `Limite gratuite atteinte (${AUDIT_DAILY_LIMIT} audits par jour). Revenez demain, ou créez un compte Nebula gratuit pour suivre vos comptes chaque jour.`
    };
  }

  let row = cached;
  if (!row) {
    const sources = await runSources(params.input, params.runners);
    const readable = readableSources(sources);
    if (readable.length === 0) {
      await params.refundMiss?.().catch(() => undefined);
      return { ok: false, status: 422, error: "Aucune des sources n'a pu être lue : vérifiez les adresses, ou réessayez dans un instant.", sources: summarize(sources) };
    }
    const result = buildResult(params.input, sources, now);
    row = await publicAuditDb.create({
      data: {
        token: randomBytes(18).toString("base64url"),
        inputKey: key,
        input: params.input,
        result,
        score: result.score.global,
        sources: readable.join(","),
        ipHash: params.ipHash,
        expiresAt: new Date(now.getTime() + AUDIT_RETENTION_DAYS * DAY)
      }
    });
    void trackGrowth("audit_created", { sources: readable.join(","), score: result.score.global ?? -1, axes: result.score.basedOn });
  }

  if (email) {
    const sent = await sendAuditEmail(email, row.token, row.result as AuditResult).catch(() => ({ ok: false }));
    if (sent.ok) await publicAuditDb.update({ where: { id: row.id }, data: { emailSentAt: new Date() } }).catch(() => undefined);
    if (params.tips) await recordToolLead({ email, tool: "audit", consent: true, ipHash: params.ipHash }).catch(() => undefined);
  }

  return { ok: true, token: row.token, cached: Boolean(cached), sources: summarize((row.result as AuditResult).sources) };
}

export function auditUrl(token: string): string {
  return `${publicAppUrl()}/audit/${token}`;
}

async function sendAuditEmail(to: string, token: string, result: AuditResult): Promise<{ ok: boolean }> {
  const url = auditUrl(token);
  const who = [
    result.sources.youtube?.facts?.title,
    result.sources.instagram?.facts ? `@${result.sources.instagram.facts.username}` : null,
    result.sources.tiktok?.facts ? `@${result.sources.tiktok.facts.username}` : null,
    result.sources.website?.facts?.host
  ].filter(Boolean)[0];
  const score = result.score.global === null ? "" : `${result.score.global}/100 — ${result.score.label}`;
  const top = result.recommendations.slice(0, 3);
  const text = [
    `Votre audit de présence${who ? ` (${who})` : ""} est prêt.`,
    score ? `Score de présence : ${score}.` : "",
    "",
    ...top.map((r) => `- ${r.text}`),
    "",
    `Voir le rapport complet (30 jours) : ${url}`,
    "",
    "Vous recevez ce message parce que cette adresse a été indiquée sur nebulahub.space/outils/audit. Elle n'est pas conservée."
  ].join("\n");
  const html = emailFrame(`
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111827">Votre audit de présence est prêt</h1>
    ${score ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">Score de présence${who ? ` de <strong>${escapeHtml(String(who))}</strong>` : ""} : <strong>${escapeHtml(score)}</strong></p>` : ""}
    ${top.length ? `<ul style="margin:0 0 14px;padding-left:18px;font-size:14px;line-height:1.55">${top.map((r) => `<li style="margin:0 0 6px">${escapeHtml(r.text)}</li>`).join("")}</ul>` : ""}
    <p style="margin:22px 0">${emailButton("Voir le rapport complet", url)}</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;word-break:break-all">Lien direct (valable 30 jours) : ${escapeHtml(url)}</p>
    <p style="margin:26px 0 0;padding-top:14px;border-top:1px solid ${EMAIL_COLORS.border};color:${EMAIL_COLORS.muted};font-size:12px">
      Vous recevez ce message parce que cette adresse a été indiquée sur l'outil d'audit gratuit de Nebula. Elle n'est pas conservée.
    </p>
  `);
  return sendEmail({ to, subject: score ? `Votre audit de présence : ${score}` : "Votre audit de présence est prêt", text, html });
}

// --- Lecture, suppression, purge --------------------------------------------------------

export type AuditLookup = { state: "found"; row: PublicAuditRow; result: AuditResult; advice: AuditAdvice | null } | { state: "expired" } | { state: "missing" };

export async function findAudit(token: string, now: Date = new Date()): Promise<AuditLookup> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { state: "missing" };
  const row = await publicAuditDb.findUnique({ where: { token } });
  if (!row) return { state: "missing" };
  if (row.expiresAt.getTime() <= now.getTime()) return { state: "expired" };
  return { state: "found", row, result: row.result as AuditResult, advice: (row.advice as AuditAdvice | null) ?? null };
}

/** Suppression demandée depuis le rapport (quiconque a le lien, dont la personne analysée). */
export async function deleteAudit(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return false;
  const { count } = await publicAuditDb.deleteMany({ where: { token } });
  if (count > 0) void trackGrowth("audit_deleted", {});
  return count > 0;
}

export async function purgeExpiredAudits(now: Date = new Date()): Promise<number> {
  const { count } = await publicAuditDb.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}

// --- Conseils de Gemini ------------------------------------------------------------------

export type AdviceOutcome = { ok: true; advice: AuditAdvice } | { ok: false; status: number; reason: "missing" | "not_configured" | "unavailable" | "busy" };

/** Conseils de l'IA : écrits une fois par rapport, 2 essais au plus (jamais d'appels répétés). */
export async function ensureAdvice(token: string, now: Date = new Date(), generate: typeof generateAdvice = generateAdvice): Promise<AdviceOutcome> {
  const found = await findAudit(token, now);
  if (found.state !== "found") return { ok: false, status: 404, reason: "missing" };
  if (found.advice) return { ok: true, advice: found.advice };
  if (!isAiEnabled()) return { ok: false, status: 503, reason: "not_configured" };
  const claimed = await publicAuditDb.updateMany({ where: { id: found.row.id, adviceAttempts: { lt: MAX_ADVICE_ATTEMPTS } }, data: { adviceAttempts: { increment: 1 } } });
  if (claimed.count === 0) return { ok: false, status: 503, reason: "unavailable" };
  try {
    const advice = await generate(found.result);
    if (!advice) return { ok: false, status: 503, reason: "unavailable" };
    await publicAuditDb.update({ where: { id: found.row.id }, data: { advice } });
    return { ok: true, advice };
  } catch (err) {
    console.warn("[audit] conseils IA :", (err as Error).message);
    return { ok: false, status: 503, reason: err instanceof GeminiQuotaError ? "busy" : "unavailable" };
  }
}
