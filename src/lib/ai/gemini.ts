// Client pour l'API Gemini (Google AI Studio) — https://ai.google.dev
//
// Choisi pour son palier gratuit réel (contrairement à l'API Anthropic ou
// OpenAI, payantes dès la première requête), ce qui compte tant que Nebula
// ne génère pas de revenu. Toute la couche IA est OPTIONNELLE : sans
// GEMINI_API_KEY dans .env, `isAiEnabled()` renvoie false et l'UI masque
// simplement les boutons IA — zéro coût, zéro obligation.
//
// Clé gratuite : https://aistudio.google.com/apikey

import { SocialApiError, fetchJson } from "@/lib/social/base";
import { classifyProviderError } from "@/lib/social/errors";
import { opt, soft, textSchema, z } from "@/lib/social/contract";
import { alertOwner, alertOwnerFormatChange } from "@/lib/owner-alerts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Google retire régulièrement les anciens modèles (gemini-2.5-flash a été
// retiré pour les nouvelles clés le 19/09/2026, remplacé par gemini-3.6-flash
// — message d'erreur retourné directement par l'API). Si ça se reproduit,
// pas besoin de redéployer le code : réglez simplement GEMINI_MODEL (ou
// GEMINI_IMAGE_MODEL) dans les variables d'environnement Vercel avec le nom
// du nouveau modèle indiqué par l'erreur.
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
// Modèle avec génération d'image (utilisé uniquement pour les miniatures IA).
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

export function isAiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function requireKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY manquant. Obtenez une clé gratuite sur aistudio.google.com/apikey et ajoutez-la à .env pour activer les fonctions IA."
    );
  }
  return key;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

/** Partie d'une requête (Gemini accepte inline_data en snake_case dans les requêtes). */
interface GenerateContentPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

// --- Contrat de la réponse (lot 9, voir social/contract.ts) ------------------
// Doc : https://ai.google.dev/api/generate-content — les RÉPONSES sont en
// camelCase (inlineData, mimeType). Avant le lot 9, les images générées
// étaient lues dans « inline_data » (forme des requêtes) : jamais trouvées,
// d'où « Gemini n'a renvoyé aucune image » pour les miniatures et stickers.
// Les deux formes sont acceptées. Réponses types : tests/contracts/fixtures/gemini.
const inlineSchema = z.object({ data: z.string().min(1), mimeType: textSchema, mime_type: textSchema });
const responsePartSchema = z.object({ text: textSchema, inlineData: soft(inlineSchema), inline_data: soft(inlineSchema), thought: soft(z.boolean()) });
const generateResponseSchema = z
  .object({
    candidates: opt(z.array(z.object({ content: soft(z.object({ parts: soft(z.array(responsePartSchema)) })), finishReason: textSchema }))),
    promptFeedback: soft(z.object({ blockReason: textSchema }))
  })
  .superRefine((d, ctx) => {
    // Sans candidat, Gemini explique toujours pourquoi (promptFeedback).
    if (!d.candidates && !d.promptFeedback) ctx.addIssue({ code: z.ZodIssueCode.invalid_type, expected: "array", received: "undefined", path: ["candidates"] });
  });
type GenerateResponse = z.output<typeof generateResponseSchema>;

/** Texte de la réponse (les « pensées » du modèle sont ignorées), ou erreur claire. */
function responseText(data: GenerateResponse): string {
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (text) return text;
  throw new Error(emptyReason(data));
}

/** Image générée de la réponse (inlineData, ou inline_data par sécurité). */
function responseImage(data: GenerateResponse): { base64: string; mimeType: string } | null {
  for (const p of data.candidates?.[0]?.content?.parts ?? []) {
    const inline = p.inlineData ?? p.inline_data;
    if (inline?.data) return { base64: inline.data, mimeType: inline.mimeType || inline.mime_type || "image/png" };
  }
  return null;
}

function emptyReason(data: GenerateResponse): string {
  const blocked = data.promptFeedback?.blockReason;
  const finish = data.candidates?.[0]?.finishReason;
  if (blocked || finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST" || finish === "IMAGE_SAFETY") {
    return "Gemini a refusé de traiter cette demande (contenu jugé sensible par ses filtres). Reformulez ou changez d'image, puis réessayez.";
  }
  if (finish === "MAX_TOKENS") return "La réponse de Gemini a été coupée avant d'avoir du contenu (limite de longueur). Réessayez avec une demande plus courte.";
  if (finish === "RECITATION") return "Gemini a interrompu sa réponse (contenu trop proche d'un texte existant). Reformulez la demande.";
  return "Gemini n'a renvoyé aucun contenu. Réessayez dans un instant.";
}

/** Durée maximale d'un appel à Gemini, relances comprises (sous la limite des fonctions). */
const GEMINI_DEADLINE_MS = 55_000;
const GEMINI_ATTEMPT_TIMEOUT_MS = 50_000;

/**
 * Erreur levée quand Gemini refuse pour cause de QUOTA (429 /
 * RESOURCE_EXHAUSTED) après les tentatives automatiques — distinguée d'une
 * simple surcharge pour que /api/ai/chat puisse répondre 429 + délai au
 * navigateur, qui affiche alors un compte à rebours au lieu d'une erreur
 * rouge (le palier gratuit de Gemini a des limites par minute et par jour).
 */
export class GeminiQuotaError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 60) {
    super(message);
    this.name = "GeminiQuotaError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// "This model is currently experiencing high demand" (503/UNAVAILABLE) et
// les quotas temporaires (429/RESOURCE_EXHAUSTED) sont les deux seuls cas où
// Google recommande explicitement de réessayer — c'est une saturation
// passagère côté Google, pas un bug Nebula, et ça repasse souvent en
// quelques secondes. Partagé par callGemini (texte) et les deux générateurs
// d'image ci-dessous : on retente automatiquement avant de renoncer, plutôt
// que de faire remonter tout de suite une erreur brute en anglais à
// l'utilisateur (constaté en prod sur l'analyse de rétention).
//
// Lot 9 : porte commune (délai garanti : 55 s en tout, relances comprises),
// clé d'API dans l'en-tête x-goog-api-key et non plus dans l'adresse (où
// elle pouvait finir dans des journaux), réponse vérifiée par son contrat,
// et le propriétaire prévenu quand la configuration est en cause (modèle
// retiré par Google, clé refusée, format de réponse changé).
async function fetchGeminiWithRetry(model: string, body: unknown): Promise<GenerateResponse> {
  const key = requireKey();
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const maxAttempts = 3;
  const deadline = Date.now() + GEMINI_DEADLINE_MS;

  for (let attempt = 1; ; attempt++) {
    const remaining = deadline - Date.now();
    try {
      return await fetchJson("GEMINI", url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        cache: "no-store",
        timeoutMs: Math.max(1_000, Math.min(GEMINI_ATTEMPT_TIMEOUT_MS, remaining)),
        schema: generateResponseSchema
      });
    } catch (err) {
      if (!(err instanceof SocialApiError)) throw err;
      const status = (err.raw as { error?: { status?: string } } | undefined)?.error?.status;
      const googleMessage = err.message.replace(/^\[GEMINI\] /, "");
      const quota = err.status === 429 || status === "RESOURCE_EXHAUSTED";
      const overloaded = err.status === 503 || err.status === 500 || status === "UNAVAILABLE" || status === "INTERNAL";
      const { category } = classifyProviderError(err);

      if (category === "UNEXPECTED_RESPONSE") {
        void alertOwnerFormatChange("Gemini", "format:gemini", err.message, { where: "src/lib/ai/gemini.ts" });
        throw new Error("Le service IA a répondu dans un format inattendu. L'équipe Nebula est prévenue ; réessayez un peu plus tard.");
      }
      if (category === "TIMEOUT") {
        throw new Error("Le service IA de Google (Gemini) met trop de temps à répondre. Réessayez dans un instant, avec une demande plus courte si possible.");
      }
      // Modèle retiré par Google (déjà arrivé le 19/09/2026) : réglage à changer.
      if (err.status === 404 || status === "NOT_FOUND") {
        void alertOwner({
          title: "Gemini : modèle IA indisponible",
          body: `Google ne trouve plus le modèle « ${model} ». Réglez GEMINI_MODEL (ou GEMINI_IMAGE_MODEL pour les images) sur Vercel avec un modèle actuel (voir ai.google.dev/gemini-api/docs/models). Message : ${googleMessage}`,
          dedupeKey: `gemini-model:${model}`
        });
        throw new Error("Le modèle d'IA configuré n'est plus disponible chez Google. L'équipe Nebula est prévenue et le remplace au plus vite.");
      }
      // Clé refusée ou retirée : aucune fonction IA ne peut marcher.
      if (err.status === 401 || err.status === 403 || /API_KEY_INVALID|API key not valid/i.test(JSON.stringify(err.raw ?? ""))) {
        void alertOwner({
          title: "Gemini : clé d'API refusée",
          body: `Google refuse la clé GEMINI_API_KEY : toutes les fonctions IA sont en panne. Créez une nouvelle clé sur aistudio.google.com/apikey et remplacez-la sur Vercel. Message : ${googleMessage}`,
          dedupeKey: "gemini-key"
        });
        throw new Error("Le service IA est momentanément indisponible (configuration). L'équipe Nebula est prévenue.");
      }

      const retryable = quota || overloaded || category === "TRANSIENT";
      if (!retryable) throw new Error(googleMessage || "Erreur du service IA.");
      const wait = attempt * 1500;
      if (attempt >= maxAttempts || deadline - Date.now() < wait + 5_000) {
        if (quota) {
          // Google indique parfois le délai à respecter ("retry in 42.3s").
          const hinted = /retry in (\d+(?:\.\d+)?)s/i.exec(googleMessage);
          const retryAfter = hinted ? Math.ceil(Number(hinted[1])) : err.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : 60;
          throw new GeminiQuotaError(
            "Le quota gratuit de l'IA est atteint pour le moment (limite par minute de Google Gemini). Ce n'est pas un bug : patientez un instant avant de renvoyer votre question.",
            Math.min(Math.max(retryAfter, 10), 300)
          );
        }
        throw new Error(
          "Le service IA de Google (Gemini) est momentanément surchargé par une forte demande. Ce n'est pas un bug Nebula : réessayez dans une minute ou deux, ça repasse généralement tout seul."
        );
      }
      // Backoff progressif entre les tentatives (1,5 s puis 3 s).
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

async function callGemini(params: {
  contents: { role: string; parts: GenerateContentPart[] }[];
  systemInstruction?: string;
  jsonMode?: boolean;
  model?: string;
  /** Plafond de tokens de la réponse (1024 par défaut). Le chat contextuel
   *  le règle par onglet : plus haut pour une fiche miniature détaillée,
   *  plus bas pour une question d'usage — chaque token de sortie compte
   *  dans le quota gratuit. */
  maxOutputTokens?: number;
  /** 0,8 par défaut ; plus bas pour des textes fidèles à des chiffres donnés. */
  temperature?: number;
}): Promise<string> {
  const model = params.model || DEFAULT_MODEL;

  const body: Record<string, unknown> = {
    contents: params.contents,
    generationConfig: {
      temperature: params.temperature ?? 0.8,
      maxOutputTokens: params.maxOutputTokens ?? 1024,
      ...(params.jsonMode ? { responseMimeType: "application/json" } : {})
    }
  };
  if (params.systemInstruction) {
    body.systemInstruction = { role: "system", parts: [{ text: params.systemInstruction }] };
  }

  const data = await fetchGeminiWithRetry(model, body);
  return responseText(data);
}

/** Chat assistant général : aide à l'usage du site + analyse des stats fournies en contexte. */
export async function chatComplete(messages: ChatMessage[], systemInstruction: string, options?: { maxOutputTokens?: number }): Promise<string> {
  return callGemini({
    systemInstruction,
    maxOutputTokens: options?.maxOutputTokens,
    contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
  });
}

/**
 * Génère un titre ou une description/légende adaptée à un réseau donné.
 * Quand une frame/image réelle du média est fournie (frameBase64), Gemini
 * la reçoit directement (vision) et doit s'appuyer STRICTEMENT sur ce qui y
 * est visible — sans ça (mediaHint texte seul, ex: "vidéo"), le modèle n'a
 * aucune idée du contenu réel et tend à halluciner un texte générique de
 * marque plutôt que de décrire la publication elle-même.
 */
export async function generateCopy(input: {
  field: "title" | "description";
  network?: string;
  maxLength?: number;
  brandName: string;
  existingTitle?: string;
  existingCaption?: string;
  mediaHint?: string; // ex: "vidéo" — utilisé seulement en repli si aucune image n'a pu être extraite
  frameBase64?: string;
  frameMimeType?: string;
}): Promise<string> {
  const { field, network, maxLength, brandName, existingTitle, existingCaption, mediaHint, frameBase64, frameMimeType } = input;

  const promptLines = [
    `Tu es un assistant de community management pour la marque "${brandName}" sur Nebula.`,
    frameBase64
      ? "Voici une image réelle extraite du média que la personne s'apprête à publier. Base-toi STRICTEMENT sur ce que tu vois (sujet, action, décor, ambiance) : n'invente rien qui ne soit pas visible sur cette image, et ne rédige surtout pas un texte de présentation générique de la marque."
      : mediaHint
        ? `Média joint : ${mediaHint} (aucune image n'a pu être analysée cette fois — reste prudent et générique sur le contenu visuel plutôt que d'inventer des détails).`
        : "",
    field === "title"
      ? `Rédige UN SEUL titre accrocheur (sans guillemets, sans hashtag) pour cette publication${network ? ` sur ${network}` : ""}.`
      : `Rédige UNE SEULE description/légende engageante${network ? ` adaptée à ${network}` : ""}, avec 2-3 hashtags pertinents à la fin.`,
    maxLength ? `Reste sous ${maxLength} caractères.` : "",
    existingTitle ? `Titre actuel (à améliorer, pas juste reformuler) : ${existingTitle}` : "",
    existingCaption ? `Description actuelle / contexte : ${existingCaption}` : "",
    "Réponds uniquement avec le texte final, sans préambule ni explication."
  ].filter(Boolean);

  const parts: GenerateContentPart[] = [{ text: promptLines.join("\n") }];
  if (frameBase64 && frameMimeType) {
    parts.push({ inline_data: { mime_type: frameMimeType, data: frameBase64 } });
  }

  const text = await callGemini({ contents: [{ role: "user", parts }] });
  return text.trim().replace(/^"|"$/g, "");
}

/**
 * Version "grand public" de generateCopy(), utilisée par le générateur
 * gratuit sans compte (/outils/legendes, voir /api/public/tools/captions).
 * Différence clé : ici on ne décrit jamais un média réel (le visiteur n'a
 * rien uploadé) mais un simple SUJET tapé au clavier — le prompt doit donc
 * traiter ce texte comme le sujet de la publication, pas comme la légende
 * d'un fichier joint, sans quoi Gemini comprend de travers (voir le
 * "Média joint : ..." de generateCopy, qui suppose toujours un fichier).
 */
export async function generateFreeCaption(input: {
  field: "title" | "description";
  network?: string;
  maxLength?: number;
  brandName: string;
  topic: string;
}): Promise<string> {
  const { field, network, maxLength, brandName, topic } = input;

  const promptLines = [
    `Tu es un assistant de community management qui aide "${brandName}" à rédiger une publication.`,
    `Sujet de la publication, décrit par la personne : ${topic}`,
    field === "title"
      ? `Rédige UN SEUL titre accrocheur (sans guillemets, sans hashtag) pour cette publication${network ? ` sur ${network}` : ""}.`
      : `Rédige UNE SEULE description/légende engageante${network ? ` adaptée à ${network}` : ""}, avec 2-3 hashtags pertinents à la fin.`,
    maxLength ? `Reste sous ${maxLength} caractères.` : "",
    "Réponds uniquement avec le texte final, sans préambule ni explication."
  ].filter(Boolean);

  const text = await callGemini({ contents: [{ role: "user", parts: [{ text: promptLines.join("\n") }] }] });
  return text.trim().replace(/^"|"$/g, "");
}

/**
 * Génération texte libre pour les micro-outils gratuits de /outils (bio
 * Instagram, hashtags, reformulations de titre — brief growth lot G4.c) :
 * un prompt, une réponse JSON (tableau de chaînes) — même quota Gemini que
 * les autres outils publics, via consumePublicQuota côté route.
 */
/**
 * Conseils personnalisés de l'audit de présence (produit n°8) : trois
 * paragraphes rédigés à partir des faits CALCULÉS par Nebula (JSON en
 * entrée, voir src/lib/audit/advice.ts), en mode JSON. Température basse :
 * on veut des conseils fidèles aux chiffres, pas de la créativité.
 */
export async function generateAuditParagraphs(systemInstruction: string, factsJson: string): Promise<string[]> {
  const text = await callGemini({
    jsonMode: true,
    maxOutputTokens: 900,
    temperature: 0.4,
    systemInstruction,
    contents: [{ role: "user", parts: [{ text: `Faits calculés (JSON) :\n${factsJson}\n\nRéponds UNIQUEMENT par un objet JSON {"paragraphs": ["…", "…", "…"]}.` }] }]
  });
  try {
    const parsed = JSON.parse(text) as unknown;
    const list = Array.isArray(parsed) ? parsed : (parsed as { paragraphs?: unknown })?.paragraphs;
    if (!Array.isArray(list)) return [];
    return list.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Studio IA (produit n°9) : réponse JSON brute pour une consigne et des
 * faits donnés (idées et accroches, script de vidéo). Le texte est lu et
 * vérifié par src/lib/studio/generate.ts (contrat zod), jamais utilisé tel quel.
 */
export async function generateStudioJson(systemInstruction: string, prompt: string, maxOutputTokens: number): Promise<string> {
  return callGemini({
    jsonMode: true,
    maxOutputTokens,
    temperature: 0.85,
    systemInstruction,
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });
}

export async function generateFreeList(prompt: string, maxItems = 5): Promise<string[]> {
  const text = await callGemini({
    jsonMode: true,
    maxOutputTokens: 700,
    contents: [{ role: "user", parts: [{ text: `${prompt}\nRéponds UNIQUEMENT par un tableau JSON de ${maxItems} chaînes de caractères, sans autre texte.` }] }]
  });
  try {
    const parsed = JSON.parse(text) as unknown;
    const arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { items?: unknown[] })?.items) ? (parsed as { items: unknown[] }).items : [];
    return arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, maxItems);
  } catch {
    return text
      .split("\n")
      .map((l) => l.replace(/^[-*\d.)\s"]+|"$/g, "").trim())
      .filter(Boolean)
      .slice(0, maxItems);
  }
}

export interface FrameCandidate {
  index: number;
  base64: string;
  mimeType: string;
}

/** Une frame retenue comme miniature, avec le « pourquoi » (notes 1 à 5). */
export interface FramePick {
  index: number;
  reason: string;
  sharpness: number;
  framing: number;
  clickPotential: number;
}

/**
 * Fait choisir à Gemini les meilleures frames parmi plusieurs candidates
 * extraites d'une même vidéo, pour la génération de miniatures (voir
 * "Générer des miniatures" dans composer/page.tsx) — évite de proposer des
 * frames de transition, floues ou sans intérêt visuel qui sortiraient d'un
 * simple échantillonnage à intervalles fixes. Depuis le 24/09/2026, chaque
 * choix est accompagné d'une courte explication et de trois notes
 * (netteté, cadrage, potentiel de clic), présentées dans le chat IA.
 */
export async function pickBestFrames(input: { frames: FrameCandidate[]; count: number }): Promise<FramePick[]> {
  const { frames, count } = input;
  const promptText = [
    "Tu es un directeur artistique qui choisit la meilleure image de couverture (miniature) parmi plusieurs frames extraites de la même vidéo, numérotées dans l'ordre chronologique (index 0 à " +
      (frames.length - 1) +
      ").",
    "Choisis celles qui feraient les meilleures miniatures : nettes (pas de flou de mouvement), bien cadrées, sujet principal clairement visible et reconnaissable, moment ou expression engageant. Évite les frames de transition, noires, floues, ou sans intérêt visuel. Choisis des images différentes les unes des autres (pas trois fois le même plan).",
    `Réponds STRICTEMENT en JSON avec ce format : {"picks": [{"index": 0, "reason": "…", "sharpness": 1-5, "framing": 1-5, "clickPotential": 1-5}, …]}, avec exactement ${count} choix (moins seulement s'il n'y a pas assez de frames exploitables), du meilleur au moins bon.`,
    "« reason » : une ou deux phrases en français, concrètes et adressées à l'utilisateur (vouvoiement), qui expliquent pourquoi CETTE image donne envie de cliquer — ce qu'on y voit, ce qui accroche l'œil (expression, geste, contraste, lisibilité en petit format). Pas de généralités.",
    "sharpness = netteté, framing = cadrage et composition, clickPotential = potentiel de clic ; notes entières de 1 à 5."
  ].join("\n");

  const parts: GenerateContentPart[] = [{ text: promptText }];
  for (const frame of frames) {
    parts.push({ text: `Frame index ${frame.index} :` });
    parts.push({ inline_data: { mime_type: frame.mimeType, data: frame.base64 } });
  }

  const raw = await callGemini({ contents: [{ role: "user", parts }], jsonMode: true });
  const clampNote = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 3);
  try {
    const parsed = JSON.parse(raw);
    const valid = new Set(frames.map((f) => f.index));
    const seen = new Set<number>();
    const picks: FramePick[] = [];
    const list: unknown[] = Array.isArray(parsed.picks) ? parsed.picks : Array.isArray(parsed.bestIndexes) ? parsed.bestIndexes.map((index: unknown) => ({ index })) : [];
    for (const item of list) {
      const p = item as Record<string, unknown>;
      const index = typeof p.index === "number" ? p.index : NaN;
      if (!valid.has(index) || seen.has(index)) continue;
      seen.add(index);
      picks.push({
        index,
        reason: typeof p.reason === "string" ? p.reason.trim().slice(0, 400) : "",
        sharpness: clampNote(p.sharpness),
        framing: clampNote(p.framing),
        clickPotential: clampNote(p.clickPotential)
      });
    }
    return picks.slice(0, count);
  } catch {
    return [];
  }
}

export interface GeneratedThumbnail {
  base64: string;
  mimeType: string;
}

/**
 * Génère une miniature "punchy" à partir d'une frame réelle de la vidéo
 * (extraite côté navigateur, sans ffmpeg — voir composer/page.tsx) : Gemini
 * reçoit l'image et un prompt lui demandant de la rendre plus accrocheuse
 * (contraste, cadrage, éventuellement un court texte d'accroche), et renvoie
 * une image générée qu'on propose comme option de miniature parmi d'autres.
 */
export async function generateThumbnail(input: {
  frameBase64: string;
  frameMimeType: string;
  title: string;
  network?: string;
  /** Brief venu de l'assistant « Demander à Nebula » (bouton « Générer
   *  cette miniature ») : accroche + description de l'image voulue. Quand
   *  il est présent, il PRIME sur les consignes génériques — c'est le
   *  concept que l'utilisateur vient de valider en lisant le « pourquoi ». */
  brief?: { hook: string; imagePrompt: string } | null;
}): Promise<GeneratedThumbnail> {
  const prompt = [
    "Tu vas créer une miniature vidéo accrocheuse à partir de cette image, extraite d'une vraie vidéo.",
    `Titre de la vidéo : "${input.title || "sans titre"}"${input.network ? ` (réseau : ${input.network})` : ""}.`,
    "Garde le sujet principal de l'image reconnaissable, mais rends le cadrage et le contraste plus percutants,",
    "façon miniature YouTube/TikTok qui donne envie de cliquer.",
    input.brief
      ? `Suis ce brief de direction artistique : ${input.brief.imagePrompt}${input.brief.hook ? ` Texte d'accroche à écrire sur l'image, en gros et très lisible : « ${input.brief.hook} ».` : ""}`
      : "Tu peux ajouter un très court texte d'accroche à l'écran si ça sert l'image, mais reste sobre et lisible.",
    "Format 16:9."
  ].join(" ");

  const data = await fetchGeminiWithRetry(IMAGE_MODEL, {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inline_data: { mime_type: input.frameMimeType, data: input.frameBase64 } }]
      }
    ]
  });

  const image = responseImage(data);
  if (!image) throw new Error(data.candidates?.length ? "Gemini n'a renvoyé aucune image cette fois : réessayez." : emptyReason(data));
  return image;
}

/**
 * Génère un sticker/emoji exclusif Premium à partir d'un simple prompt texte
 * (pas d'image en entrée, contrairement à generateThumbnail) — utilisé par
 * /api/premium/reactions/generate pour fabriquer le pack "Or Impérial".
 * Demande un rendu carré, fond transparent, cohérent avec les autres
 * réactions du pack (voir le prompt de style ci-dessous).
 */
export async function generateStickerPack(input: { prompt: string }): Promise<GeneratedThumbnail> {
  const prompt = [
    "Crée un sticker/emoji numérique unique représentant :",
    input.prompt + ".",
    "Style : icône moderne en dégradé d'or scintillant, finition glossy/néon liquide, cohérente avec un thème",
    "'Premium doré' haut de gamme. Cadrage carré, sujet centré et bien visible, fond transparent ou uni sombre",
    "(pas de texte, pas de fond photographique). Le résultat doit ressembler à un emoji/sticker autonome,",
    "utilisable en petite taille (comme une réaction sur un réseau social)."
  ].join(" ");

  const data = await fetchGeminiWithRetry(IMAGE_MODEL, {
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  const image = responseImage(data);
  if (!image) throw new Error(data.candidates?.length ? "Gemini n'a renvoyé aucune image cette fois : réessayez." : emptyReason(data));
  return image;
}

export interface FrameInput {
  timeRatio: number; // 0..1, position dans la vidéo
  base64: string;
  mimeType: string;
}

export interface RetentionPoint {
  timeRatio: number;
  watchRatio: number;
}

export interface VideoAnalysis {
  summary: string;
  dropOffPoints: { timeRatio: number; watchRatio: number; note: string }[];
  recommendations: string[];
}

/**
 * Analyse la rétention d'une vidéo à la manière du "YouTube Studio AI
 * Insights" : on fournit à Gemini la vraie courbe de rétention (récupérée
 * via YouTube Analytics API, voir src/lib/social/youtube.ts::fetchRetention)
 * ainsi que des frames extraites de la vidéo aux points de décrochage
 * (ffmpeg, voir src/lib/video/frames.ts). Gemini "regarde" ces images et
 * corrèle avec la courbe pour expliquer ce qui se passe à l'écran à ces
 * instants et ce qu'il faudrait changer.
 */
export async function analyzeVideoRetention(input: {
  title: string;
  caption: string;
  retentionCurve: RetentionPoint[];
  frames: FrameInput[];
}): Promise<VideoAnalysis> {
  const { title, caption, retentionCurve, frames } = input;

  const curveDescription = retentionCurve
    .map((p) => `t=${Math.round(p.timeRatio * 100)}% → ${Math.round(p.watchRatio * 100)}% de spectateurs restants`)
    .join("\n");

  const promptText = [
    "Tu es un analyste de performance vidéo, comme l'assistant IA de YouTube Studio.",
    `Titre de la vidéo : ${title}`,
    `Description : ${caption}`,
    "Voici la courbe réelle de rétention d'audience (donnée par YouTube Analytics) :",
    curveDescription,
    "Voici des images extraites de la vidéo aux instants correspondant aux plus grosses chutes de rétention (dans l'ordre des frames fournies, timeRatio croissant).",
    "Analyse ce qui se passe visuellement à ces moments et pourquoi les spectateurs partent probablement.",
    "Réponds STRICTEMENT en JSON avec ce format :",
    `{"summary": "résumé en 2-3 phrases", "dropOffPoints": [{"timeRatio": 0.0-1.0, "watchRatio": 0.0-1.0, "note": "explication du décrochage à ce moment, basée sur l'image"}], "recommendations": ["conseil actionnable 1", "conseil actionnable 2", "..."]}`
  ].join("\n\n");

  const parts: GenerateContentPart[] = [{ text: promptText }];
  for (const frame of frames) {
    parts.push({ inline_data: { mime_type: frame.mimeType, data: frame.base64 } });
  }

  const raw = await callGemini({ contents: [{ role: "user", parts }], jsonMode: true });
  try {
    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary ?? "",
      dropOffPoints: Array.isArray(parsed.dropOffPoints) ? parsed.dropOffPoints : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
    };
  } catch {
    return { summary: raw, dropOffPoints: [], recommendations: [] };
  }
}

/**
 * Version "chaîne entière" de analyzeVideoRetention(), utilisée par l'outil
 * autonome /retention (voir produit n°3 de la feuille de route) : contraint
 * à la miniature publique de la vidéo (via l'API YouTube Data) plutôt qu'à
 * des frames extraites au ffmpeg aux instants de décrochage, car on n'a pas
 * forcément le fichier vidéo source stocké dans Nebula (vidéo publiée
 * ailleurs, ou importée avant l'existence de l'outil). Volontairement plus
 * prudent dans le prompt : Gemini n'a qu'UNE SEULE image (la miniature, pas
 * le contenu réel à chaque seconde), donc ses observations "visuelles" sont
 * cadrées comme des hypothèses à vérifier, pas des faits établis — pour ne
 * jamais donner l'impression d'avoir "vu" un instant qu'il n'a pas vu.
 */
export async function analyzeVideoRetentionByThumbnail(input: {
  title: string;
  description: string;
  retentionCurve: RetentionPoint[];
  thumbnailBase64: string;
  thumbnailMimeType: string;
}): Promise<VideoAnalysis> {
  const { title, description, retentionCurve, thumbnailBase64, thumbnailMimeType } = input;

  const curveDescription = retentionCurve
    .map((p) => `t=${Math.round(p.timeRatio * 100)}% → ${Math.round(p.watchRatio * 100)}% de spectateurs restants`)
    .join("\n");

  const promptText = [
    "Tu es un analyste de performance vidéo YouTube, comme l'assistant IA de YouTube Studio.",
    `Titre de la vidéo : ${title}`,
    `Description : ${description || "(aucune)"}`,
    "Voici la courbe RÉELLE de rétention d'audience (donnée par YouTube Analytics) :",
    curveDescription,
    "Tu ne disposes que de la miniature publique de la vidéo (image jointe) — PAS des images du contenu à chaque instant. Base tes hypothèses sur le titre, la description, la forme de la courbe (chute brutale au début = accroche faible, décrochage progressif = rythme qui s'essouffle, plateau = contenu qui retient bien...) et ce que suggère la miniature, sans jamais prétendre avoir vu ce qui se passe réellement à l'écran à un instant précis.",
    "Réponds STRICTEMENT en JSON avec ce format :",
    `{"summary": "résumé en 2-3 phrases", "dropOffPoints": [{"timeRatio": 0.0-1.0, "watchRatio": 0.0-1.0, "note": "hypothèse sur la cause probable de ce décrochage, formulée comme une hypothèse"}], "recommendations": ["conseil actionnable 1", "conseil actionnable 2", "..."]}`
  ].join("\n\n");

  const parts: GenerateContentPart[] = [
    { text: promptText },
    { inline_data: { mime_type: thumbnailMimeType, data: thumbnailBase64 } }
  ];

  const raw = await callGemini({ contents: [{ role: "user", parts }], jsonMode: true });
  try {
    const parsed = JSON.parse(raw);
    return {
      summary: parsed.summary ?? "",
      dropOffPoints: Array.isArray(parsed.dropOffPoints) ? parsed.dropOffPoints : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
    };
  } catch {
    return { summary: raw, dropOffPoints: [], recommendations: [] };
  }
}

/**
 * Idée de contenu pour une case vide du calendrier (voir bouton discret
 * "Proposer une idée IA" sur calendar/page.tsx). S'appuie sur la date réelle
 * (jour de la semaine + jour du mois, pour évoquer d'éventuels marronniers/
 * journées mondiales connus de Gemini) et le nom de la marque — reste un
 * texte court et actionnable, jamais une légende complète prête à publier.
 */
export async function generateContentIdea(input: { brandName: string; date: string }): Promise<string> {
  const dateObj = new Date(`${input.date}T12:00:00`);
  const formatted = dateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const prompt = [
    `Tu aides la marque "${input.brandName}" à ne pas laisser un jour de calendrier vide sur Nebula.`,
    `Nous sommes le ${formatted}.`,
    "Si cette date correspond à une journée mondiale/nationale connue, une tendance saisonnière ou un marronnier marketing pertinent, appuie-toi dessus. Sinon, propose une idée de publication générique mais concrète adaptée à une marque active sur les réseaux sociaux.",
    "Réponds en 1 à 2 phrases maximum : une idée de contenu concrète et actionnable (pas un titre, pas de hashtags, pas de guillemets), que la personne pourra ensuite rédiger elle-même dans le compositeur."
  ].join("\n");
  const text = await callGemini({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
  return text.trim().replace(/^"|"$/g, "");
}

export interface RepurposedContent {
  instagramReel: string;
  facebookPost: string;
  tiktokScript: string;
}

/**
 * Recyclage de contenu automatisé (Auto-Repurpose) : à partir d'un contenu
 * source (typiquement une vidéo/script YouTube déjà rédigé dans le
 * Composer), génère 3 déclinaisons textuelles adaptées à d'autres formats/
 * réseaux. Ne génère aucun média — uniquement le texte, à associer ensuite
 * manuellement au bon média dans le Composer.
 */
export async function repurposeContent(input: {
  brandName: string;
  sourceTitle: string;
  sourceCaption: string;
}): Promise<RepurposedContent> {
  const prompt = [
    `Tu es un assistant de recyclage de contenu pour la marque "${input.brandName}" sur Nebula.`,
    `Contenu source (ex : vidéo YouTube) — Titre : ${input.sourceTitle || "(sans titre)"}`,
    `Description/script source : ${input.sourceCaption || "(vide)"}`,
    "À partir de ce contenu, génère 3 déclinaisons distinctes, chacune adaptée à son format :",
    "1. instagramReel : une légende courte et percutante pour un Reel Instagram reprenant le même sujet, avec 2-3 hashtags.",
    "2. facebookPost : un post Facebook un peu plus détaillé/conversationnel sur le même sujet.",
    "3. tiktokScript : un script court (accroche + 2-3 lignes clés) pour une vidéo TikTok sur le même sujet.",
    "Réponds STRICTEMENT en JSON avec ce format :",
    `{"instagramReel": "...", "facebookPost": "...", "tiktokScript": "..."}`
  ].join("\n");

  const raw = await callGemini({ contents: [{ role: "user", parts: [{ text: prompt }] }], jsonMode: true });
  try {
    const parsed = JSON.parse(raw);
    return {
      instagramReel: parsed.instagramReel ?? "",
      facebookPost: parsed.facebookPost ?? "",
      tiktokScript: parsed.tiktokScript ?? ""
    };
  } catch {
    return { instagramReel: raw, facebookPost: "", tiktokScript: "" };
  }
}
