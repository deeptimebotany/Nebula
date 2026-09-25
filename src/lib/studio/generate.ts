// Studio IA (produit n°9) — génération d'idées + accroches et de scripts,
// à partir des faits de la marque (facts.ts). Serveur uniquement.
//
// Règles :
//  - l'IA ne reçoit que les faits calculés (jamais les jetons, ni le texte
//    brut des comptes) et répond en JSON, vérifié par un contrat (zod) ;
//  - les chiffres montrés à côté d'un résultat viennent des faits : l'IA
//    cite seulement le numéro de la publication qui l'inspire (`basedOn`) ;
//  - les repères de rétention d'un script (« relance ici ») sont placés
//    d'après les VRAIES courbes (annotateScript), pas par l'IA ;
//  - quota par jour et par compte (Pro 15, Agence 40), compté sur
//    l'historique : un échec de l'IA ne consomme rien ;
//  - historique gardé (50 par marque) : revoir un résultat est gratuit.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { GeminiQuotaError, generateStudioJson, isAiEnabled } from "@/lib/ai/gemini";
import { getBrandPlan, type UserPlanInfo } from "@/lib/billing/plan";
import { consumeRateLimit } from "@/lib/rate-limit";
import { DEFAULT_TIMEZONE, utcToWallClock, wallClockToUtc } from "@/lib/timezone";
import { PLAN_LIMITS } from "@/lib/plans";
import { NETWORKS, NETWORK_META, type Network } from "@/lib/types";
import { factsForPrompt, type StudioFacts, type TopPost } from "./facts";
import { loadStudioFacts } from "./load";
import {
  generationTitle,
  type IdeasInput,
  type ScriptInput,
  type StudioGenerationDTO,
  type StudioHistoryItem,
  type StudioIdea,
  type StudioKind,
  type StudioOutput,
  type StudioQuota,
  type StudioScript,
  type VideoFormat
} from "./types";

export const IDEAS_COUNT = 5;
export const HISTORY_KEEP = 50;
/** Rafale : quelques essais de suite au plus (une IA en panne ne doit pas être relancée en boucle). */
const BURST_LIMIT = 8;
const BURST_WINDOW_MIN = 10;

// --- Accès à la table (types minimaux, comme prisma-extra.ts) -------------------

export interface StudioGenerationRow {
  id: string;
  brandId: string;
  userId: string;
  kind: string;
  input: unknown;
  output: unknown;
  sources: unknown;
  createdAt: Date;
}

interface StudioDelegate {
  create(args: unknown): Promise<StudioGenerationRow>;
  findMany(args: unknown): Promise<StudioGenerationRow[]>;
  findFirst(args: unknown): Promise<StudioGenerationRow | null>;
  count(args: unknown): Promise<number>;
  deleteMany(args: unknown): Promise<{ count: number }>;
}
export const studioDb = (prisma as unknown as { studioGeneration: StudioDelegate }).studioGeneration;

// --- Quota -----------------------------------------------------------------------

/** Générations par jour pour ce palier (essai IA du parrainage : comme Pro). */
export function studioLimitFor(info: Pick<UserPlanInfo, "limits">): number {
  if (!info.limits.aiEnabled) return 0;
  return info.limits.studioDailyLimit > 0 ? info.limits.studioDailyLimit : PLAN_LIMITS.PRO.studioDailyLimit;
}

/** Minuit (heure de Paris) du jour de `now`, en UTC. */
export function startOfParisDay(now: Date): Date {
  const w = utcToWallClock(now, DEFAULT_TIMEZONE);
  return wallClockToUtc({ ...w, hour: 0, minute: 0 }, DEFAULT_TIMEZONE);
}

export async function studioQuota(userId: string, info: Pick<UserPlanInfo, "limits">, now: Date = new Date()): Promise<StudioQuota> {
  const limit = studioLimitFor(info);
  const used = limit > 0 ? await studioDb.count({ where: { userId, createdAt: { gte: startOfParisDay(now) } } }) : 0;
  return { limit, used, remaining: Math.max(0, limit - used), aiConfigured: isAiEnabled() };
}

// --- Contrats des réponses de l'IA ------------------------------------------------

const clip = (max: number) => z.string().transform((s) => s.replace(/\s+/g, " ").replace(/^["«\s]+|["»\s]+$/g, "").trim().slice(0, max));
const formatSchema = z.string().transform((s): VideoFormat => (/court|short|60/i.test(s) ? "court" : "long"));

const ideasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: clip(90),
        angle: clip(400),
        format: formatSchema.catch("court"),
        network: z.string().nullish().catch(null),
        basedOn: z.union([z.number(), z.string()]).nullish().catch(null),
        hooks: z.array(clip(160)).catch([])
      })
    )
    .min(1)
});

const scriptSchema = z.object({
  title: clip(90),
  hook: clip(300),
  sections: z.array(z.object({ label: clip(80), content: clip(900) })).min(2),
  cta: clip(300),
  description: clip(900),
  hashtags: z.array(z.string()).catch([])
});

function asNetwork(value: unknown, allowed: Network[]): Network | null {
  if (typeof value !== "string") return null;
  const up = value.trim().toUpperCase();
  const found = (NETWORKS as readonly string[]).find((n) => n === up || NETWORK_META[n as Network].label.toUpperCase() === up);
  return found && (allowed.length === 0 || allowed.includes(found as Network)) ? (found as Network) : null;
}

/** Lecture des idées renvoyées par l'IA (références vérifiées, accroches bornées). */
export function parseIdeas(raw: string, facts: StudioFacts): StudioIdea[] {
  const data = ideasSchema.parse(JSON.parse(raw));
  const refs = new Set(facts.topPosts.map((p) => p.ref));
  return data.ideas
    .filter((i) => i.title.length >= 4 && i.hooks.filter((h) => h.length >= 8).length >= 1)
    .slice(0, IDEAS_COUNT + 1)
    .map((i) => {
      const ref = i.basedOn === null || i.basedOn === undefined ? null : Number(String(i.basedOn).replace(/\D/g, ""));
      return {
        title: i.title,
        angle: i.angle,
        format: i.format,
        network: asNetwork(i.network, facts.networks),
        basedOn: ref !== null && refs.has(ref) ? ref : null,
        hooks: i.hooks.filter((h) => h.length >= 8).slice(0, 3)
      };
    })
    .slice(0, IDEAS_COUNT);
}

export function parseScript(raw: string, format: VideoFormat): StudioScript {
  const data = scriptSchema.parse(JSON.parse(raw));
  const hashtags = Array.from(
    new Set(
      data.hashtags
        .map((h) => h.trim().replace(/^#+/, "").replace(/\s+/g, ""))
        .filter((h) => /^[\p{L}\p{N}_]{2,40}$/u.test(h))
        .map((h) => `#${h}`)
    )
  ).slice(0, 6);
  return {
    title: data.title,
    format,
    hook: data.hook,
    sections: data.sections.slice(0, 8).map((s) => ({ label: s.label, content: s.content, retentionNote: null })),
    cta: data.cta,
    description: data.description,
    hashtags
  };
}

const pctText = (ratio: number) => `${Math.round(ratio * 100)} %`;

/**
 * Repères de rétention placés d'après les vraies courbes de la marque :
 *  - public perdu tôt (≥ 25 % dans les 10 premiers %) → l'accroche est notée ;
 *  - moment où la moitié du public est partie → relance sur la section juste
 *    avant (sections supposées réparties selon leur longueur).
 */
export function annotateScript(script: StudioScript, facts: StudioFacts): StudioScript {
  const r = facts.retention;
  if (!r) return script;
  const sections = script.sections.map((s) => ({ ...s }));
  if (r.earlyLoss !== null && r.earlyLoss >= 0.25 && sections[0]) {
    sections[0].retentionNote = `Vos vidéos perdent ${pctText(r.earlyLoss)} du public dans les 10 premiers % : tenez la promesse de l'accroche dès maintenant.`;
  }
  if (r.halfAudienceAt !== null && sections.length >= 2) {
    const lengths = sections.map((s) => Math.max(1, s.content.length));
    const total = lengths.reduce((a, b) => a + b, 0);
    let cursor = 0;
    let target = sections.length - 1;
    for (let i = 0; i < sections.length; i++) {
      const end = (cursor + lengths[i]) / total;
      if (end >= r.halfAudienceAt) {
        target = Math.max(0, i === 0 ? 0 : i - 1);
        break;
      }
      cursor += lengths[i];
    }
    const note = `La moitié de votre public part vers ${pctText(r.halfAudienceAt)} de la vidéo : placez ici une relance (question, aperçu de la suite, changement de rythme).`;
    sections[target].retentionNote = sections[target].retentionNote ? `${sections[target].retentionNote} ${note}` : note;
  }
  return { ...script, sections };
}

// --- Consignes -----------------------------------------------------------------------

const COMMON_RULES = [
  "Écris en français, pour des créateurs francophones.",
  "N'invente AUCUN chiffre, aucune statistique, aucune moyenne du secteur, aucune promesse de résultat.",
  "Pas de markdown, pas de listes à puces dans les textes, émojis rares.",
  "Appuie-toi sur ce qui a déjà marché (titres, réseaux, formats) et sur les observations de rétention fournies."
].join("\n");

export function ideasPrompt(facts: StudioFacts, brandName: string, input: IdeasInput): { system: string; prompt: string } {
  const system = [
    "Tu es stratège de contenu vidéo pour une marque ou un créateur.",
    `Propose ${IDEAS_COUNT} idées de publications NOUVELLES (jamais une copie d'un titre existant), chacune inspirée si possible d'un succès réel de la marque.`,
    "Pour chaque idée : un titre de 70 caractères au plus, un angle (2 phrases : quoi montrer et pourquoi ça devrait marcher chez CE public), un format (« court » : 60 secondes ou moins, ou « long »), le réseau visé, le numéro `ref` de la publication qui l'inspire (ou null), et 3 accroches différentes pour les 3 premières secondes (120 caractères au plus chacune, qui donnent envie de rester).",
    COMMON_RULES,
    'Réponds UNIQUEMENT par un objet JSON : {"ideas": [{"title": "", "angle": "", "format": "court", "network": "YOUTUBE", "basedOn": 1, "hooks": ["", "", ""]}]}.'
  ].join("\n");
  const prompt = [
    `Faits calculés par Nebula (JSON) :\n${JSON.stringify(factsForPrompt(facts, brandName))}`,
    input.network ? `Réseau visé : ${NETWORK_META[input.network].label}.` : "Réseau visé : au choix, parmi les réseaux connectés.",
    input.theme ? `Thème souhaité : ${input.theme}` : "Thème : libre, dans la continuité de ce qui marche."
  ].join("\n\n");
  return { system, prompt };
}

export function scriptPrompt(facts: StudioFacts, brandName: string, input: ScriptInput): { system: string; prompt: string } {
  const long = input.format === "long";
  const system = [
    `Tu écris le plan détaillé d'une vidéo ${long ? "longue (8 à 12 minutes)" : "courte (60 secondes au plus)"} pour une marque ou un créateur.`,
    `Structure : une accroche (ce qui est dit ET montré dans les 3 premières secondes), ${long ? "4 à 7" : "3 ou 4"} sections (pour chacune : un titre court et ce qu'il faut dire et montrer, concrètement), un appel à l'action, un titre de 70 caractères au plus, une description de 2 ou 3 phrases avec les mots que le public cherche, et 3 à 5 hashtags.`,
    "Si le public décroche tôt, promesse forte dès l'accroche ; prévois des relances (question, aperçu de la suite, changement de rythme) au fil de la vidéo.",
    COMMON_RULES,
    'Réponds UNIQUEMENT par un objet JSON : {"title": "", "hook": "", "sections": [{"label": "", "content": ""}], "cta": "", "description": "", "hashtags": [""]}.'
  ].join("\n");
  const prompt = [
    `Faits calculés par Nebula (JSON) :\n${JSON.stringify(factsForPrompt(facts, brandName))}`,
    `Sujet de la vidéo : ${input.subject}`,
    input.network ? `Réseau principal : ${NETWORK_META[input.network].label}.` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, prompt };
}

// --- Génération ------------------------------------------------------------------------

export type LlmCall = (system: string, prompt: string, maxOutputTokens: number) => Promise<string>;

export type GenerateResult =
  | { ok: true; generation: StudioGenerationDTO; quota: StudioQuota }
  | { ok: false; status: number; error: string; reason?: "studio" };

function toDTO(row: StudioGenerationRow): StudioGenerationDTO {
  return {
    id: row.id,
    kind: row.kind as StudioKind,
    createdAt: new Date(row.createdAt).toISOString(),
    input: row.input as IdeasInput | ScriptInput,
    output: row.output as StudioOutput,
    sources: (row.sources as TopPost[] | null) ?? []
  };
}

export async function generateStudio(params: {
  userId: string;
  brandId: string;
  brandName: string;
  kind: StudioKind;
  input: IdeasInput | ScriptInput;
  now?: Date;
  llm?: LlmCall;
  plan?: Pick<UserPlanInfo, "limits">;
}): Promise<GenerateResult> {
  const now = params.now ?? new Date();
  const plan = params.plan ?? (await getBrandPlan(params.brandId));
  const quota = await studioQuota(params.userId, plan, now);
  if (quota.limit === 0) {
    return { ok: false, status: 402, reason: "studio", error: "Le Studio IA écrit vos idées et vos scripts à partir de vos chiffres : il fait partie des paliers Pro et Agence." };
  }
  if (!params.llm && !isAiEnabled()) return { ok: false, status: 503, error: "L'IA n'est pas configurée sur ce site (GEMINI_API_KEY manquant)." };
  if (quota.remaining <= 0) {
    return {
      ok: false,
      status: 429,
      error: `Vous avez utilisé vos ${quota.limit} générations du jour : elles reviennent à minuit (heure de Paris). Vos résultats restent dans l'historique.`
    };
  }
  const burst = await consumeRateLimit("studio", params.userId, BURST_LIMIT, BURST_WINDOW_MIN);
  if (!burst.ok) return { ok: false, status: 429, error: `Beaucoup de demandes d'un coup : réessayez dans ${Math.ceil(burst.retryAfterSeconds / 60)} min.` };

  const facts = await loadStudioFacts(params.brandId, now);
  const llm: LlmCall = params.llm ?? generateStudioJson;
  let output: StudioOutput;
  try {
    if (params.kind === "ideas") {
      const { system, prompt } = ideasPrompt(facts, params.brandName, params.input as IdeasInput);
      output = { kind: "ideas", ideas: parseIdeas(await llm(system, prompt, 2_000), facts) };
      if (output.ideas.length === 0) throw new Error("aucune idée lisible");
    } else {
      const input = params.input as ScriptInput;
      const { system, prompt } = scriptPrompt(facts, params.brandName, input);
      output = { kind: "script", script: annotateScript(parseScript(await llm(system, prompt, input.format === "long" ? 2_600 : 1_600), input.format), facts) };
    }
  } catch (err) {
    if (err instanceof GeminiQuotaError) return { ok: false, status: 429, error: err.message };
    console.warn("[studio] génération :", (err as Error).message);
    // Réponse illisible (JSON cassé, contrat non respecté, aucune idée) : message
    // de relance. Sinon, le message du client Gemini (déjà rédigé pour l'utilisateur).
    const unreadable = err instanceof SyntaxError || err instanceof z.ZodError || (err as Error).message === "aucune idée lisible";
    return {
      ok: false,
      status: 502,
      error: unreadable ? "L'IA a répondu dans un format inattendu : relancez, cela passe en général du premier coup. Rien n'a été décompté." : `${(err as Error).message} Rien n'a été décompté.`
    };
  }

  const cited = new Set(output.kind === "ideas" ? output.ideas.map((i) => i.basedOn).filter((r): r is number => r !== null) : []);
  const sources = facts.topPosts.filter((p) => cited.has(p.ref));
  const row = await studioDb.create({ data: { brandId: params.brandId, userId: params.userId, kind: params.kind, input: params.input, output, sources } });

  // Historique borné : les plus anciennes générations de la marque au-delà de 50.
  // Jamais celles du jour : le quota se compte dessus (sinon, à plusieurs sur
  // une marque, effacer les lignes du jour rendrait des générations).
  const dayStart = startOfParisDay(now);
  const old = await studioDb.findMany({ where: { brandId: params.brandId }, orderBy: { createdAt: "desc" }, skip: HISTORY_KEEP, select: { id: true, createdAt: true } });
  const removable = old.filter((o) => new Date(o.createdAt).getTime() < dayStart.getTime());
  if (removable.length) await studioDb.deleteMany({ where: { id: { in: removable.map((o) => o.id) } } });

  return { ok: true, generation: toDTO(row), quota: { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) } };
}

export async function studioHistory(brandId: string, take = 20): Promise<StudioHistoryItem[]> {
  const rows = await studioDb.findMany({ where: { brandId }, orderBy: { createdAt: "desc" }, take, select: { id: true, kind: true, createdAt: true, output: true } });
  return rows.map((r) => ({ id: r.id, kind: r.kind as StudioKind, createdAt: new Date(r.createdAt).toISOString(), title: generationTitle(r.output as StudioOutput) }));
}

export async function studioGeneration(brandId: string, id: string): Promise<StudioGenerationDTO | null> {
  const row = await studioDb.findFirst({ where: { id, brandId } });
  return row ? toDTO(row) : null;
}
