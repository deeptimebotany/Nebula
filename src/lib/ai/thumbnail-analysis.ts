// Miniatures « en un clic » (07/10/2026, demande de Lucas) : au lieu de
// demander le sujet et le public de la vidéo, Gemini REGARDE la vidéo
// importée dans Publier (image et son), en déduit le sujet, le public et la
// promesse, et propose 3 concepts de miniature, chacun ancré sur un instant
// précis de la vidéo (l'image de départ, extraite ensuite dans le navigateur),
// avec l'accroche, les consignes de retouche et le « pourquoi » du taux de
// clic. Les 3 images sont ensuite générées par /api/media/[id]/thumbnails/ai
// (une miniature décomptée par image réussie).
//
// Ici : la demande envoyée à Gemini, la lecture de sa réponse (contrat
// vérifié, instants ramenés dans la vidéo) et l'orchestration
// envoi → analyse → suppression du fichier chez Google.
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { z } from "zod";
import { deleteGeminiFile, generateVideoJson, uploadVideoToGemini, type GenerateContentPart } from "@/lib/ai/gemini";
import { localUploadPath } from "@/lib/storage";
import { SocialApiError, openMediaStream } from "@/lib/social/base";
import { formatDuration } from "@/lib/video/format-time";

/** Au-delà, la vidéo est regardée moins d'images par seconde (le son reste entier). */
const FULL_RATE_SECONDS = 600;
/** Au-delà, seule la première heure est regardée. */
const MAX_ANALYSED_SECONDS = 3_600;

export interface ThumbnailConcept {
  /** Instant de l'image de départ, en secondes depuis le début de la vidéo. */
  second: number;
  /** Ce qui se passe à cet instant (pour la personne). */
  moment: string;
  /** Levier principal : « Curiosité », « Résultat », « Émotion »… */
  angle: string;
  /** Texte à écrire sur l'image (2 à 4 mots), ou vide. */
  hook: string;
  /** Consignes de retouche pour le modèle d'image. */
  imagePrompt: string;
  /** Pourquoi cette image et cette composition font cliquer (2 ou 3 points). */
  why: string[];
}

export interface VideoThumbnailAnalysis {
  /** Ce que raconte la vidéo. */
  summary: string;
  /** Public visé, déduit de la vidéo. */
  audience: string;
  /** Promesse faite au spectateur. */
  promise: string;
  /** Du plus fort au moins fort (3 au plus). */
  concepts: ThumbnailConcept[];
  durationSeconds: number | null;
  /** Vidéo de plus d'une heure : seule la première heure a été regardée. */
  truncated: boolean;
}

export interface ThumbnailAnalysisInput {
  title?: string;
  caption?: string;
  /** Réseaux cochés dans Publier (« YOUTUBE », « TIKTOK »…). */
  networks?: string[];
  durationSeconds: number | null;
  orientation: "horizontal" | "vertical" | null;
}

const NETWORK_LABEL: Record<string, string> = {
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  PINTEREST: "Pinterest",
  BLUESKY: "Bluesky"
};

export const THUMBNAIL_ANALYSIS_INSTRUCTION = [
  "Tu es directeur artistique, spécialiste des miniatures YouTube, TikTok et Instagram qui maximisent le taux de clic (CTR).",
  "Tu regardes la vidéo fournie EN ENTIER, image ET son : écoute ce qui est dit (le script), repère le sujet, le public visé, la promesse et les moments les plus forts.",
  "Tu proposes les 3 meilleures miniatures possibles, fidèles au contenu réel de la vidéo.",
  "Règles :",
  "- Uniquement ce qui se voit et s'entend dans la vidéo : aucune promesse que la vidéo ne tient pas, aucun objet, personne, chiffre ou logo absent de la vidéo.",
  "- Chaque proposition part d'un instant précis de la vidéo (« second », en secondes depuis le début, avec une décimale) où l'image est nette et le sujet bien visible : expression forte, geste, résultat, avant/après. Évite les transitions, le flou de mouvement, les yeux fermés, les écrans titres et les sous-titres incrustés.",
  "- 3 angles différents (par exemple curiosité, résultat ou transformation, émotion, contraste, enjeu, chiffre, question) et 3 instants différents, à au moins 2 secondes d'écart.",
  "- « hook » : 2 à 4 mots en majuscules tirés de la promesse de la vidéo, ou une chaîne vide si l'image se suffit ; jamais le titre en entier.",
  "- « imagePrompt » : consignes de retouche de l'image extraite à cet instant, en une ou deux phrases : cadrage (recadrer, rapprocher le sujet), lumière, contraste, couleurs, arrière-plan simplifié ou flouté, emplacement et style du texte. La personne ou le sujet reste identique et reconnaissable.",
  "- « why » : 2 ou 3 phrases courtes et concrètes qui expliquent pourquoi cette image et cette composition vont maximiser le taux de clic : ce qui arrête le défilement, ce que la miniature promet, lisibilité en petit format, contraste avec le fil du réseau.",
  "- « moment » : ce qui se passe à cet instant, en une phrase courte.",
  "Réponds uniquement en JSON, en français, de la forme :",
  '{"summary":"ce que raconte la vidéo, en une ou deux phrases","audience":"public visé","promise":"promesse faite au spectateur","concepts":[{"second":12.4,"moment":"…","angle":"Curiosité","hook":"…","imagePrompt":"…","why":["…","…"]}]}',
  "avec exactement 3 concepts, du plus fort au moins fort."
].join("\n");

/** Texte qui accompagne la vidéo dans la demande. */
export function thumbnailAnalysisPrompt(input: ThumbnailAnalysisInput): string {
  const networks = (input.networks ?? []).map((n) => NETWORK_LABEL[n] ?? n).filter(Boolean);
  return [
    "Voici la vidéo à analyser (ci-dessus).",
    input.title?.trim() ? `Titre prévu : « ${input.title.trim().slice(0, 200)} ».` : "Pas encore de titre.",
    input.caption?.trim() ? `Description prévue : « ${input.caption.trim().slice(0, 600)} ».` : "",
    networks.length ? `Réseaux visés : ${networks.join(", ")}.` : "",
    input.orientation === "vertical"
      ? "Vidéo verticale : la miniature sera au format 9:16 (sujet et texte dans le tiers central)."
      : input.orientation === "horizontal"
        ? "Vidéo horizontale : la miniature sera au format 16:9."
        : "",
    input.durationSeconds ? `Durée : ${formatDuration(input.durationSeconds)}.` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

/** Partie « vidéo » de la demande : moins d'images par seconde pour une longue vidéo. */
export function videoPart(file: { uri: string; mimeType: string }, durationSeconds: number | null): GenerateContentPart {
  const part: GenerateContentPart = { file_data: { file_uri: file.uri, mime_type: file.mimeType } };
  if (durationSeconds && durationSeconds > FULL_RATE_SECONDS) {
    const watched = Math.min(durationSeconds, MAX_ANALYSED_SECONDS);
    part.video_metadata = {
      fps: Math.max(0.2, Math.round((FULL_RATE_SECONDS / watched) * 100) / 100),
      ...(durationSeconds > MAX_ANALYSED_SECONDS ? { end_offset: `${MAX_ANALYSED_SECONDS}s` } : {})
    };
  }
  return part;
}

// --- Lecture de la réponse ----------------------------------------------------

/** « 12.4 », 12.4, « 0:42 », « 1:02:05 » → secondes. */
function toSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const v = value.trim().replace(",", ".");
  if (/^\d+(\.\d+)?s?$/.test(v)) return Number(v.replace(/s$/, ""));
  const parts = v.split(":");
  if (parts.length >= 2 && parts.length <= 3 && parts.every((p) => /^\d+(\.\d+)?$/.test(p))) {
    return parts.reduce((total, p) => total * 60 + Number(p), 0);
  }
  return null;
}

const text = z.preprocess((v) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v)), z.string());
const conceptSchema = z.object({
  second: z.unknown(),
  moment: text.optional(),
  angle: text.optional(),
  hook: text.optional(),
  imagePrompt: text,
  why: z.union([z.array(text), text]).optional()
});
const analysisSchema = z.object({
  summary: text,
  audience: text.optional(),
  promise: text.optional(),
  concepts: z.array(z.unknown())
});

/**
 * Réponse de Gemini → analyse utilisable : 3 concepts au plus, instants
 * ramenés dans la vidéo, accroche courte en majuscules, « pourquoi » en
 * liste. Lève une erreur en français si rien n'est utilisable.
 */
export function parseThumbnailAnalysis(raw: string, durationSeconds: number | null): Omit<VideoThumbnailAnalysis, "truncated"> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error("L'analyse de la vidéo est illisible cette fois-ci. Réessayez dans un instant.");
  }
  const parsed = analysisSchema.safeParse(json);
  if (!parsed.success) throw new Error("L'analyse de la vidéo est incomplète cette fois-ci. Réessayez dans un instant.");

  const limit = durationSeconds && durationSeconds > 0 ? Math.min(durationSeconds, MAX_ANALYSED_SECONDS) : null;
  const concepts: ThumbnailConcept[] = [];
  for (const item of parsed.data.concepts) {
    const c = conceptSchema.safeParse(item);
    if (!c.success || !c.data.imagePrompt) continue;
    let second = toSeconds(c.data.second);
    if (second === null) continue;
    // Jamais la toute première ou la toute dernière image (souvent noires).
    if (limit) second = Math.min(Math.max(second, 0.2), Math.max(0.2, limit - 0.3));
    else second = Math.max(second, 0.2);
    second = Math.round(second * 10) / 10;
    const why = (Array.isArray(c.data.why) ? c.data.why : c.data.why ? c.data.why.split(/\n+|(?<=\.)\s+(?=[A-ZÀ-Ý])/) : [])
      .map((w) => w.replace(/^[-•*\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    const hook = (c.data.hook ?? "")
      .replace(/^["«»“”\s]+|["«»“”\s]+$/g, "")
      .toUpperCase()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5)
      .join(" ")
      .slice(0, 40);
    concepts.push({
      second,
      moment: (c.data.moment ?? "").slice(0, 200),
      angle: (c.data.angle ?? "").slice(0, 40) || `Proposition ${concepts.length + 1}`,
      hook,
      imagePrompt: c.data.imagePrompt.slice(0, 1_100),
      why
    });
    if (concepts.length === 3) break;
  }
  if (concepts.length === 0) throw new Error("Gemini n'a proposé aucune miniature utilisable pour cette vidéo. Réessayez dans un instant.");
  return {
    summary: parsed.data.summary.slice(0, 600),
    audience: (parsed.data.audience ?? "").slice(0, 300),
    promise: (parsed.data.promise ?? "").slice(0, 300),
    concepts,
    durationSeconds
  };
}

// --- Orchestration --------------------------------------------------------------

export interface VideoSource {
  url: string;
  mimeType: string;
  sizeBytes: number;
  filename: string;
}

/** Flux de la vidéo : Vercel Blob (adresse publique) ou disque en local. */
async function openVideo(source: VideoSource, deadline: number): Promise<{ body: ReadableStream<Uint8Array>; sizeBytes: number }> {
  if (/^https?:\/\//i.test(source.url)) {
    try {
      const media = await openMediaStream("GEMINI", source.url, Math.max(5_000, deadline - Date.now()));
      return { body: media.body, sizeBytes: media.size ?? source.sizeBytes };
    } catch (err) {
      const status = err instanceof SocialApiError ? err.status : undefined;
      throw new Error(status === 404 || status === 403 || status === 410 ? "La vidéo importée est introuvable : importez-la à nouveau." : "Impossible de relire la vidéo importée. Réessayez dans un instant.");
    }
  }
  const filePath = localUploadPath(source.url);
  const info = await stat(filePath).catch(() => null);
  if (!info) throw new Error("La vidéo importée est introuvable : importez-la à nouveau.");
  return { body: Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream<Uint8Array>, sizeBytes: info.size };
}

/**
 * Envoie la vidéo à Gemini, la fait analyser, puis supprime le fichier chez
 * Google (toujours, même en cas d'échec). `deadline` : heure limite (ms).
 */
export async function analyzeVideoForThumbnails(source: VideoSource, input: ThumbnailAnalysisInput, options: { deadline: number }): Promise<VideoThumbnailAnalysis> {
  const opened = await openVideo(source, options.deadline);
  const file = await uploadVideoToGemini(
    { body: opened.body, sizeBytes: opened.sizeBytes, mimeType: source.mimeType, displayName: `nebula-miniatures-${source.filename}` },
    { deadline: options.deadline }
  );
  try {
    const raw = await generateVideoJson({
      systemInstruction: THUMBNAIL_ANALYSIS_INSTRUCTION,
      parts: [videoPart(file, input.durationSeconds), { text: thumbnailAnalysisPrompt(input) }],
      thinking: "medium",
      maxOutputTokens: 2_500,
      deadlineMs: Math.max(10_000, options.deadline - Date.now())
    });
    return { ...parseThumbnailAnalysis(raw, input.durationSeconds), truncated: Boolean(input.durationSeconds && input.durationSeconds > MAX_ANALYSED_SECONDS) };
  } finally {
    await deleteGeminiFile(file.name);
  }
}
