// Rétention IA : l'IA regarde la vidéo (30/09/2026).
//
// Principe : NEBULA calcule les chiffres, l'IA explique. Les chutes de la
// courbe (moment, part des spectateurs perdue) sont calculées ici à partir
// de la vraie courbe de YouTube Analytics et de la durée de la vidéo ; l'IA
// ne fait que décrire ce qui se passe à l'écran à ces moments et proposer des
// conseils. Sa réponse est vérifiée par un contrat (zod) et toute phrase qui
// avance un pourcentage ou un horodatage que Nebula ne lui a pas donné est
// retirée : aucun chiffre inventé, aucun moment hors de la vidéo.
//
// Ce que l'IA voit (VideoInsight.mode) :
//   - « video » : vidéo YouTube PUBLIQUE de 20 minutes au plus, entière, par
//     son adresse (option de Google en préversion), résolution basse
//     (≈ 100 jetons par seconde) ; d'abord en mode « agentique » si Google
//     l'accepte pour une URL YouTube, sinon en mode normal ;
//   - « clips » : vidéo publique de plus de 20 minutes → les 60 premières
//     secondes et ~40 s autour de chaque grosse chute (coût et délai bornés) ;
//   - « frames » : vidéo privée ou non listée, images extraites (serveur avec
//     ffmpeg seulement) ;
//   - « thumbnail » : vidéo privée ou non listée → miniature seule, comme
//     avant ; les explications sont alors des hypothèses.
import { z } from "zod";
import type { GenerateContentPart, ThinkingLevel } from "@/lib/ai/gemini";

export const FULL_VIDEO_MAX_SECONDS = 20 * 60;
/** Nombre de chutes expliquées par l'IA. */
export const DROP_COUNT = 4;
const CLIP_HALF_SECONDS = 20;
const HOOK_SECONDS = 60;

export type RetentionMode = "video" | "clips" | "frames" | "thumbnail";

export interface CurvePoint {
  timeRatio: number;
  watchRatio: number;
}

export interface RetentionDrop {
  id: string;
  /** Position dans la vidéo (0 → 1), point d'arrivée de la chute. */
  timeRatio: number;
  /** Seconde de la vidéo (null si la durée est inconnue). */
  second: number | null;
  /** Spectateurs restants avant / après la chute (0 → 1+, YouTube Analytics). */
  before: number;
  after: number;
  /** Part des spectateurs présents qui partent pendant la chute (0 → 1). */
  lostShare: number;
}

/** « 1:42 », « 1:02:03 ». */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Les plus grosses chutes de la courbe, dans l'ordre de la vidéo : écart
 * entre deux points consécutifs, en gardant des chutes éloignées d'au moins
 * 3 % de la vidéo (pas quatre fois la même chute).
 */
export function detectDrops(curve: CurvePoint[], durationSeconds: number | null, count = DROP_COUNT): RetentionDrop[] {
  const sorted = curve
    .filter((p) => Number.isFinite(p.timeRatio) && Number.isFinite(p.watchRatio))
    .map((p) => ({ timeRatio: Math.min(1, Math.max(0, p.timeRatio)), watchRatio: Math.max(0, p.watchRatio) }))
    .sort((a, b) => a.timeRatio - b.timeRatio);
  const candidates = sorted
    .slice(1)
    .map((p, i) => ({ before: sorted[i].watchRatio, after: p.watchRatio, timeRatio: p.timeRatio }))
    .filter((c) => c.before - c.after > 0.0005)
    .sort((a, b) => b.before - b.after - (a.before - a.after));
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (picked.some((p) => Math.abs(p.timeRatio - c.timeRatio) < 0.03)) continue;
    picked.push(c);
  }
  return picked
    .sort((a, b) => a.timeRatio - b.timeRatio)
    .map((c, i) => ({
      id: `D${i + 1}`,
      timeRatio: c.timeRatio,
      second: durationSeconds ? Math.round(c.timeRatio * durationSeconds) : null,
      before: c.before,
      after: c.after,
      lostShare: c.before > 0 ? (c.before - c.after) / c.before : 0
    }));
}

/** Ce que l'IA peut voir, selon la visibilité et la durée de la vidéo. */
export function chooseRetentionMode(input: { privacyStatus: string | null; durationSeconds: number | null; hasFrames: boolean }): RetentionMode {
  if (input.privacyStatus === "public" && input.durationSeconds) {
    return input.durationSeconds <= FULL_VIDEO_MAX_SECONDS ? "video" : "clips";
  }
  return input.hasFrames ? "frames" : "thumbnail";
}

/** Extraits d'une vidéo longue : le début, puis ±20 s autour de chaque chute (fusionnés). */
export function planClips(drops: RetentionDrop[], durationSeconds: number): { start: number; end: number }[] {
  const raw = [{ start: 0, end: Math.min(HOOK_SECONDS, durationSeconds) }];
  for (const d of drops) {
    if (d.second === null) continue;
    raw.push({ start: Math.max(0, d.second - CLIP_HALF_SECONDS), end: Math.min(durationSeconds, d.second + CLIP_HALF_SECONDS) });
  }
  raw.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const c of raw) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end + 5) last.end = Math.max(last.end, c.end);
    else merged.push({ ...c });
  }
  // Google accepte jusqu'à 10 vidéos par requête : 5 extraits au plus.
  return merged.filter((c) => c.end - c.start >= 1).slice(0, 5);
}

const pct = (v: number) => Math.round(v * 100);

/** Chiffres que l'IA a le droit de citer (pourcentages entiers). */
export function allowedPercents(drops: RetentionDrop[]): number[] {
  return Array.from(new Set(drops.flatMap((d) => [pct(d.before), pct(d.after), pct(d.lostShare), pct(d.before - d.after)])));
}

export interface RetentionRequestInput {
  mode: RetentionMode;
  title: string;
  description: string;
  durationSeconds: number | null;
  drops: RetentionDrop[];
  /** Vidéo YouTube publique (modes video et clips). */
  youtubeUrl?: string;
  /** Mode video : d'abord le mode « agentique ». */
  agentic?: boolean;
  clips?: { start: number; end: number }[];
  thumbnail?: { base64: string; mimeType: string };
  frames?: { timeRatio: number; base64: string; mimeType: string }[];
}

export const RETENTION_SYSTEM = [
  "Tu es un analyste de performance vidéo, comme l'assistant IA de YouTube Studio, et tu écris en français, en vouvoyant.",
  "Nebula a CALCULÉ les chutes de la courbe de rétention (moment, spectateurs restants) : ces chiffres sont exacts, ne les recalcule pas et n'en invente aucun autre.",
  "Ton rôle : pour chaque chute, dire ce qu'on voit et entend à ce moment de la vidéo (scene) et pourquoi les spectateurs partent probablement (cause), puis donner des conseils concrets.",
  "N'écris AUCUN pourcentage ni aucun horodatage dans tes textes : Nebula les affiche lui-même à côté de tes explications.",
  "Si tu n'as pas vu le moment concerné (miniature seule, extrait manquant), dis-le et formule une hypothèse, sans prétendre l'avoir vu.",
  'Réponds UNIQUEMENT par un objet JSON : {"summary": "2 ou 3 phrases", "drops": [{"id": "D1", "scene": "…", "cause": "…"}], "recommendations": ["conseil actionnable", "…"]} avec 3 à 5 conseils.'
].join("\n");

/** Demande envoyée à Gemini pour une analyse (texte + vidéo / extraits / images). */
export function buildRetentionRequest(input: RetentionRequestInput): { system: string; parts: GenerateContentPart[]; video: boolean } {
  const { durationSeconds, drops } = input;
  const dropLines = drops.map((d) => {
    const at = d.second !== null ? `à ${formatClock(d.second)}` : `à ${pct(d.timeRatio)} % de la vidéo`;
    return `- ${d.id} : ${at}, les spectateurs restants passent de ${pct(d.before)} % à ${pct(d.after)} % (${pct(d.lostShare)} % des personnes encore là partent).`;
  });
  const seen: Record<RetentionMode, string> = {
    video: "Tu as la vidéo entière (image et son).",
    clips: `Tu as des EXTRAITS de la vidéo (elle dure ${durationSeconds ? formatClock(durationSeconds) : "plus de 20 minutes"}) : ${(input.clips ?? []).map((c) => `${formatClock(c.start)} → ${formatClock(c.end)}`).join(", ")}, dans cet ordre.`,
    frames: "Tu as une image extraite de la vidéo à chaque chute (dans l'ordre des chutes). Tu n'as ni le son ni le reste de la vidéo.",
    thumbnail: "Tu n'as QUE la miniature publique de la vidéo, pas son contenu : tes explications sont des hypothèses tirées du titre, de la description et de la forme de la courbe."
  };
  const text = [
    `Titre : ${input.title || "(sans titre)"}`,
    `Description : ${(input.description || "(aucune)").slice(0, 1500)}`,
    durationSeconds ? `Durée : ${formatClock(durationSeconds)}` : "",
    "Chutes de la courbe de rétention (calculées par Nebula, d'après YouTube Analytics) :",
    ...dropLines,
    seen[input.mode]
  ]
    .filter(Boolean)
    .join("\n");
  const parts: GenerateContentPart[] = [{ text }];
  if ((input.mode === "video" || input.mode === "clips") && input.youtubeUrl) {
    if (input.mode === "video") {
      parts.push(input.agentic ? { file_data: { file_uri: input.youtubeUrl }, media_processing: "AGENTIC" } : { file_data: { file_uri: input.youtubeUrl } });
    } else {
      for (const c of input.clips ?? []) parts.push({ file_data: { file_uri: input.youtubeUrl }, video_metadata: { start_offset: `${c.start}s`, end_offset: `${c.end}s` } });
    }
  } else if (input.mode === "frames") {
    for (const f of input.frames ?? []) parts.push({ inline_data: { mime_type: f.mimeType, data: f.base64 } });
  } else if (input.thumbnail) {
    parts.push({ inline_data: { mime_type: input.thumbnail.mimeType, data: input.thumbnail.base64 } });
  }
  // Le mode agentique choisit lui-même ce qu'il regarde : pas de réglage de résolution.
  return { system: RETENTION_SYSTEM, parts, video: (input.mode === "video" && !input.agentic) || input.mode === "clips" };
}

/** Réflexion : élevée pour le niveau de fonctions d'Agence (featureLevel 2), moyenne sinon. */
export function retentionThinking(featureLevel: number): ThinkingLevel {
  return featureLevel >= 2 ? "high" : "medium";
}

// --- Contrat de la réponse ----------------------------------------------------

const clip = (max: number) => z.string().transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max));
export const retentionAnswerSchema = z.object({
  summary: clip(900),
  drops: z.array(z.object({ id: z.string(), scene: clip(400).catch(""), cause: clip(400).catch("") })).catch([]),
  recommendations: z.array(clip(300)).min(1).max(8)
});

export class RetentionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetentionContractError";
  }
}

/**
 * Retire les phrases qui avancent un pourcentage que Nebula n'a pas donné,
 * ou un horodatage hors de la vidéo.
 */
export function stripInventedNumbers(text: string, allowed: number[], durationSeconds: number | null): string {
  const sentences = text.split(/(?<=[.!?…])\s+/);
  const kept = sentences.filter((sentence) => {
    for (const m of sentence.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)) {
      const v = Math.round(Number(m[1].replace(",", ".")));
      if (!allowed.some((a) => Math.abs(a - v) <= 1)) return false;
    }
    if (durationSeconds) {
      for (const m of sentence.matchAll(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g)) {
        const seconds = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        if (seconds > durationSeconds) return false;
      }
    }
    return true;
  });
  return kept.join(" ").trim();
}

export interface RetentionPointOut {
  id: string;
  timeRatio: number;
  watchRatio: number;
  second: number | null;
  before: number;
  after: number;
  lostShare: number;
  scene: string;
  cause: string;
  /** Texte d'une ligne (compatibilité avec l'affichage d'avant). */
  note: string;
}

export interface RetentionAnalysis {
  summary: string;
  dropOffPoints: RetentionPointOut[];
  recommendations: string[];
}

/** Lit et vérifie la réponse de l'IA, et y joint les chiffres calculés par Nebula. */
export function parseRetentionAnswer(raw: string, drops: RetentionDrop[], durationSeconds: number | null): RetentionAnalysis {
  let json: unknown;
  try {
    json = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new RetentionContractError("réponse JSON illisible");
  }
  const parsed = retentionAnswerSchema.safeParse(json);
  if (!parsed.success) throw new RetentionContractError("réponse hors contrat");
  const allowed = allowedPercents(drops);
  const clean = (t: string) => stripInventedNumbers(t, allowed, durationSeconds);
  const byId = new Map(parsed.data.drops.map((d) => [d.id.trim().toUpperCase(), d]));
  const dropOffPoints = drops.map((d) => {
    const ai = byId.get(d.id);
    const scene = clean(ai?.scene ?? "");
    const cause = clean(ai?.cause ?? "");
    return {
      id: d.id,
      timeRatio: d.timeRatio,
      watchRatio: d.after,
      second: d.second,
      before: d.before,
      after: d.after,
      lostShare: d.lostShare,
      scene,
      cause,
      note: [scene, cause].filter(Boolean).join(" — ")
    };
  });
  const recommendations = parsed.data.recommendations.map(clean).filter((r) => r.length > 0).slice(0, 5);
  const summary = clean(parsed.data.summary);
  if (!summary && recommendations.length === 0) throw new RetentionContractError("réponse vide après vérification");
  return { summary, dropOffPoints, recommendations };
}
