// Client pour l'API Gemini (Google AI Studio) — https://ai.google.dev
//
// Choisi pour son palier gratuit réel (contrairement à l'API Anthropic ou
// OpenAI, payantes dès la première requête), ce qui compte tant que Nebula
// ne génère pas de revenu. Toute la couche IA est OPTIONNELLE : sans
// GEMINI_API_KEY dans .env, `isAiEnabled()` renvoie false et l'UI masque
// simplement les boutons IA — zéro coût, zéro obligation.
//
// Clé gratuite : https://aistudio.google.com/apikey

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

interface GenerateContentPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

async function callGemini(params: {
  contents: { role: string; parts: GenerateContentPart[] }[];
  systemInstruction?: string;
  jsonMode?: boolean;
  model?: string;
}): Promise<string> {
  const key = requireKey();
  const model = params.model || DEFAULT_MODEL;

  const body: Record<string, unknown> = {
    contents: params.contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 1024,
      ...(params.jsonMode ? { responseMimeType: "application/json" } : {})
    }
  };
  if (params.systemInstruction) {
    body.systemInstruction = { role: "system", parts: [{ text: params.systemInstruction }] };
  }

  const res = await fetch(`${API_BASE}/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Erreur Gemini (${res.status})`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini n'a renvoyé aucun contenu (réponse peut-être filtrée).");
  return text;
}

/** Chat assistant général : aide à l'usage du site + analyse des stats fournies en contexte. */
export async function chatComplete(messages: ChatMessage[], systemInstruction: string): Promise<string> {
  return callGemini({
    systemInstruction,
    contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
  });
}

/** Génère un titre ou une description/légende adaptée à un réseau donné. */
export async function generateCopy(input: {
  field: "title" | "description";
  network?: string;
  maxLength?: number;
  brandName: string;
  existingTitle?: string;
  existingCaption?: string;
  mediaHint?: string; // ex: "vidéo verticale de 42s" — décrit le média, pas une lecture réelle du fichier
}): Promise<string> {
  const { field, network, maxLength, brandName, existingTitle, existingCaption, mediaHint } = input;

  const prompt = [
    `Tu es un assistant de community management pour la marque "${brandName}" sur Nebula.`,
    field === "title"
      ? `Rédige UN SEUL titre accrocheur (sans guillemets, sans hashtag) pour cette publication${network ? ` sur ${network}` : ""}.`
      : `Rédige UNE SEULE description/légende engageante${network ? ` adaptée à ${network}` : ""}, avec 2-3 hashtags pertinents à la fin.`,
    maxLength ? `Reste sous ${maxLength} caractères.` : "",
    existingTitle ? `Titre actuel (à améliorer, pas juste reformuler) : ${existingTitle}` : "",
    existingCaption ? `Description actuelle / contexte : ${existingCaption}` : "",
    mediaHint ? `Média joint : ${mediaHint}` : "",
    "Réponds uniquement avec le texte final, sans préambule ni explication."
  ]
    .filter(Boolean)
    .join("\n");

  const text = await callGemini({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
  return text.trim().replace(/^"|"$/g, "");
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
}): Promise<GeneratedThumbnail> {
  const key = requireKey();
  const prompt = [
    "Tu vas créer une miniature vidéo accrocheuse à partir de cette image, extraite d'une vraie vidéo.",
    `Titre de la vidéo : "${input.title || "sans titre"}"${input.network ? ` (réseau : ${input.network})` : ""}.`,
    "Garde le sujet principal de l'image reconnaissable, mais rends le cadrage et le contraste plus percutants,",
    "façon miniature YouTube/TikTok qui donne envie de cliquer. Tu peux ajouter un très court texte d'accroche",
    "à l'écran si ça sert l'image, mais reste sobre et lisible. Format 16:9."
  ].join(" ");

  const res = await fetch(`${API_BASE}/models/${IMAGE_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, { inline_data: { mime_type: input.frameMimeType, data: input.frameBase64 } }]
        }
      ]
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Erreur Gemini (${res.status})`);
  }

  const parts: GenerateContentPart[] = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inline_data?.data);
  if (!imagePart?.inline_data) {
    throw new Error("Gemini n'a renvoyé aucune image (le modèle de génération d'image est peut-être indisponible).");
  }
  return { base64: imagePart.inline_data.data, mimeType: imagePart.inline_data.mime_type || "image/png" };
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
