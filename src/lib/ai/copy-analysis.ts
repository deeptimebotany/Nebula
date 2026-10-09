// « Rédiger avec l'IA » à partir de la vidéo (09/10/2026, demande de Lucas) :
// avant d'écrire le titre ou la description, Gemini REGARDE la vidéo
// importée dans Publier, image ET son (comme pour les miniatures « en un
// clic », thumbnail-analysis.ts), et décrit ce qui s'y voit et s'y entend.
// Ce résumé est renvoyé au navigateur, qui le garde tant que la vidéo ne
// change pas, et l'envoie à /api/ai/generate-copy pour chaque texte (titre,
// description, textes par réseau) : une seule analyse par vidéo.
//
// Ici : la demande envoyée à Gemini, la lecture de sa réponse (contrat
// vérifié) et l'orchestration envoi → analyse → suppression chez Google.
import { z } from "zod";
import { deleteGeminiFile, generateVideoJson, uploadVideoToGemini } from "@/lib/ai/gemini";
import { openVideo, videoPart, type VideoSource } from "@/lib/ai/thumbnail-analysis";
import { formatDuration } from "@/lib/video/format-time";

export interface VideoCopyAnalysis {
  /** Ce que montre et raconte la vidéo, en deux ou trois phrases. */
  summary: string;
  /** Ce qui est dit (idées et phrases clés), ou vide si rien n'est dit. */
  spoken: string;
  /** Texte affiché à l'écran, ou vide. */
  onScreenText: string;
  /** Moments marquants, dans l'ordre (5 au plus). */
  keyMoments: string[];
  /** Ton de la vidéo (« humoristique », « pédagogique »…). */
  tone: string;
  /** Langue parlée (« français », « anglais »…), ou vide. */
  language: string;
}

export const COPY_ANALYSIS_INSTRUCTION = [
  "Tu aides à rédiger le titre et la description d'une publication sur les réseaux sociaux.",
  "Tu regardes la vidéo fournie EN ENTIER, image ET son, et tu décris fidèlement son contenu.",
  "Règles :",
  "- Uniquement ce qui se voit et s'entend : sujet, lieu, actions, objets, ambiance, texte affiché à l'écran, et ce qui est dit (idées principales, phrases marquantes).",
  "- N'invente rien : aucun nom de personne, de lieu ou de marque, aucun chiffre ni aucune promesse qui ne soit pas visible ou dit dans la vidéo.",
  "- Si personne ne parle, « spoken » est une chaîne vide.",
  "Réponds uniquement en JSON, en français, de la forme :",
  '{"summary":"ce que montre et raconte la vidéo, en 2 ou 3 phrases","spoken":"ce qui est dit (idées et phrases clés)","onScreenText":"texte affiché à l\'écran","keyMoments":["…"],"tone":"ton de la vidéo","language":"langue parlée"}'
].join("\n");

const text = z.preprocess((v) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v)), z.string());
const schema = z.object({
  summary: text,
  spoken: text.optional(),
  onScreenText: text.optional(),
  keyMoments: z.union([z.array(text), text]).optional(),
  tone: text.optional(),
  language: text.optional()
});

/** Réponse de Gemini → analyse utilisable. Lève une erreur en français si rien n'est utilisable. */
export function parseCopyAnalysis(raw: string): VideoCopyAnalysis {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error("L'analyse de la vidéo est illisible cette fois-ci. Réessayez dans un instant.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success || !parsed.data.summary) throw new Error("L'analyse de la vidéo est incomplète cette fois-ci. Réessayez dans un instant.");
  const d = parsed.data;
  const moments = (Array.isArray(d.keyMoments) ? d.keyMoments : d.keyMoments ? d.keyMoments.split(/\n+/) : [])
    .map((m) => m.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
  const cap = (v: string | undefined, n: number) => (v ?? "").slice(0, n);
  return {
    summary: cap(d.summary, 800),
    spoken: cap(d.spoken, 1_200),
    onScreenText: cap(d.onScreenText, 300),
    keyMoments: moments.map((m) => m.slice(0, 200)),
    tone: cap(d.tone, 80),
    language: cap(d.language, 40)
  };
}

/** Résumé passé à la rédaction (generate-copy), borné en longueur. */
export function copyAnalysisBrief(a: VideoCopyAnalysis): string {
  return [
    `Ce que montre la vidéo : ${a.summary}`,
    a.spoken ? `Ce qui est dit : ${a.spoken}` : "Personne ne parle dans la vidéo.",
    a.onScreenText ? `Texte à l'écran : ${a.onScreenText}` : "",
    a.keyMoments.length ? `Moments marquants : ${a.keyMoments.join(" ; ")}` : "",
    a.tone ? `Ton : ${a.tone}` : "",
    a.language ? `Langue parlée : ${a.language}` : ""
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3_000);
}

/**
 * Envoie la vidéo à Gemini, la fait décrire, puis supprime le fichier chez
 * Google (toujours, même en cas d'échec). `deadline` : heure limite (ms).
 */
export async function analyzeVideoForCopy(source: VideoSource, input: { durationSeconds: number | null }, options: { deadline: number }): Promise<VideoCopyAnalysis> {
  const opened = await openVideo(source, options.deadline);
  const file = await uploadVideoToGemini(
    { body: opened.body, sizeBytes: opened.sizeBytes, mimeType: source.mimeType, displayName: `nebula-redaction-${source.filename}` },
    { deadline: options.deadline }
  );
  try {
    const raw = await generateVideoJson({
      systemInstruction: COPY_ANALYSIS_INSTRUCTION,
      parts: [
        videoPart(file, input.durationSeconds),
        { text: ["Voici la vidéo à décrire (ci-dessus).", input.durationSeconds ? `Durée : ${formatDuration(input.durationSeconds)}.` : ""].filter(Boolean).join("\n") }
      ],
      thinking: "low",
      maxOutputTokens: 1_500,
      deadlineMs: Math.max(10_000, options.deadline - Date.now())
    });
    return parseCopyAnalysis(raw);
  } finally {
    await deleteGeminiFile(file.name);
  }
}
