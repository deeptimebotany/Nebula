// Rétention IA, côté serveur (30/09/2026) : une seule fonction pour les deux
// entrées — une vidéo de la chaîne YouTube connectée (/retention,
// /api/ai/analyze-channel-video) et une vidéo publiée depuis Nebula
// (/api/ai/analyze-video). Voir src/lib/ai/retention.ts pour la méthode.
//
//   1. Même vidéo déjà analysée → le résultat est réutilisé, sans appeler
//      l'IA ni compter d'analyse (« Refaire l'analyse » force un nouvel appel).
//   2. Porte de l'IA : quota du mois, puis analyses achetées (Pro, Agence).
//   3. Courbe (YouTube Analytics) + visibilité et durée (YouTube Data) →
//      chutes calculées par Nebula → ce que l'IA peut voir → Gemini en flux
//      → contrat vérifié → VideoInsight (mode, modèle, durée, jetons).
// Un échec n'est jamais décompté (porte de l'IA) ; le message est en français.
import path from "path";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiQuotaSnapshot, gateAppAi } from "@/lib/ai/guard";
import { getBrandPlan } from "@/lib/billing/plan";
import { consumeRetentionBurst } from "@/lib/ai/retention-burst";
import { currentAiContext } from "@/lib/ai/usage";
import { generateRetentionJson, retentionModel } from "@/lib/ai/gemini";
import {
  RetentionContractError,
  buildRetentionRequest,
  chooseRetentionMode,
  detectDrops,
  parseRetentionAnswer,
  planClips,
  retentionThinking,
  type RetentionMode
} from "@/lib/ai/retention";
import { fetchRetention, fetchVideoMetadata } from "@/lib/social/youtube";
import { downloadMedia, type ConnectionLike } from "@/lib/social/base";
import { localUploadDir, localUploadPath } from "@/lib/storage";
import { checkFfmpegAvailable, extractFrames } from "@/lib/video/frames";

/** Délai total de l'analyse (la fonction a 300 s sur Vercel avec Fluid compute). */
const TOTAL_BUDGET_MS = 280_000;

/** Mode « agentique » : désactivable par GEMINI_RETENTION_AGENTIC="0". */
function agenticEnabled(): boolean {
  return process.env.GEMINI_RETENTION_AGENTIC !== "0" && Date.now() > agenticRefusedUntil;
}
/** Google a refusé le mode agentique pour une URL YouTube : mode normal pendant 6 h. */
let agenticRefusedUntil = 0;

function isRequestRefusal(err: unknown): boolean {
  return /invalid|unknown name|not supported|unsupported|media_processing|agentic/i.test((err as Error)?.message ?? "");
}

export interface RetentionTarget {
  userId: string;
  brandId: string;
  connection: ConnectionLike;
  videoId: string;
  /** Clé de réutilisation : publication Nebula OU connexion + vidéo. */
  postTargetId?: string;
  connectionId?: string;
  titleOverride?: string | null;
  captionOverride?: string | null;
  /** Fichier vidéo local (serveur avec ffmpeg) : images aux chutes si la vidéo n'est pas publique. */
  localVideoUrl?: string | null;
  force?: boolean;
}

async function findExisting(t: RetentionTarget) {
  if (t.postTargetId) return prisma.videoInsight.findFirst({ where: { postTargetId: t.postTargetId }, orderBy: { createdAt: "desc" } });
  if (t.connectionId) return prisma.videoInsight.findFirst({ where: { connectionId: t.connectionId, videoId: t.videoId }, orderBy: { createdAt: "desc" } });
  return null;
}

async function framesAtDrops(localVideoUrl: string, name: string, seconds: number[], ratios: number[]) {
  if (localVideoUrl.startsWith("http") || !(await checkFfmpegAvailable())) return [];
  const filePath = localUploadPath(localVideoUrl);
  const outDir = path.join(localUploadDir(), "insights");
  const files = await extractFrames(filePath, outDir, `${name}-insight`, seconds);
  const out: { timeRatio: number; base64: string; mimeType: string }[] = [];
  for (let i = 0; i < files.length; i++) out.push({ timeRatio: ratios[i], base64: (await readFile(files[i])).toString("base64"), mimeType: "image/jpeg" });
  return out;
}

export async function runRetentionAnalysis(t: RetentionTarget): Promise<NextResponse> {
  // 1. Réutilisation.
  if (!t.force) {
    const existing = await findExisting(t);
    if (existing) {
      const info = await getBrandPlan(t.brandId);
      return NextResponse.json({ insight: existing, reused: true, quota: await aiQuotaSnapshot(t.userId, info) });
    }
  }

  // 2. Porte de l'IA : rafale, puis quota du mois (et analyses achetées).
  const burst = await consumeRetentionBurst(t.userId);
  if (burst) return burst;
  const gate = await gateAppAi({ userId: t.userId, brandId: t.brandId, kind: "retention" });
  if (!gate.ok) return gate.response;
  const started = Date.now();

  try {
    const insight = await gate.allowance.run(async () => {
      const [curve, meta] = await Promise.all([fetchRetention(t.connection, t.videoId), fetchVideoMetadata(t.connection, t.videoId)]);
      const duration = meta.durationSeconds;
      const drops = detectDrops(curve, duration);
      if (drops.length === 0) {
        throw new Error("YouTube n'a pas encore assez de données de rétention pour cette vidéo (il faut quelques centaines de vues). Rien n'a été décompté.");
      }

      // Images aux chutes : seulement si la vidéo n'est pas publique et qu'un fichier local existe.
      let frames: { timeRatio: number; base64: string; mimeType: string }[] = [];
      if (meta.privacyStatus !== "public" && t.localVideoUrl && duration) {
        frames = await framesAtDrops(t.localVideoUrl, t.postTargetId ?? t.videoId, drops.map((d) => d.second ?? 0), drops.map((d) => d.timeRatio)).catch(() => []);
      }
      const mode: RetentionMode = chooseRetentionMode({ privacyStatus: meta.privacyStatus, durationSeconds: duration, hasFrames: frames.length > 0 });
      let thumbnail: { base64: string; mimeType: string } | undefined;
      if (mode === "thumbnail") {
        // Délai garanti (lot 9) : une miniature lente ne bloque plus la fonction.
        const thumb = await downloadMedia("YOUTUBE", meta.thumbnailUrl, 15_000).catch(() => {
          throw new Error("Impossible de récupérer la miniature de la vidéo. Rien n'a été décompté.");
        });
        thumbnail = { base64: Buffer.from(thumb.bytes).toString("base64"), mimeType: thumb.type.startsWith("image/") ? thumb.type : "image/jpeg" };
      }

      const base = {
        mode,
        title: t.titleOverride || meta.title,
        description: t.captionOverride || meta.description,
        durationSeconds: duration,
        drops,
        youtubeUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(t.videoId)}`,
        clips: mode === "clips" && duration ? planClips(drops, duration) : undefined,
        thumbnail,
        frames
      };
      const thinking = retentionThinking(gate.info.limits.featureLevel);
      const call = async (agentic: boolean, deadlineMs: number) => {
        const req = buildRetentionRequest({ ...base, agentic });
        return generateRetentionJson({ systemInstruction: req.system, parts: req.parts, thinking, video: req.video, deadlineMs });
      };

      let raw: string;
      if (mode === "video" && agenticEnabled()) {
        try {
          raw = await call(true, 140_000);
        } catch (err) {
          if (!isRequestRefusal(err)) throw err;
          // Google n'accepte pas (encore) le mode agentique pour une URL YouTube : mode normal.
          agenticRefusedUntil = Date.now() + 6 * 3600_000;
          console.warn("[rétention] mode agentique refusé, mode normal :", (err as Error).message);
          raw = await call(false, Math.max(30_000, TOTAL_BUDGET_MS - (Date.now() - started)));
        }
      } else {
        raw = await call(false, Math.max(30_000, TOTAL_BUDGET_MS - (Date.now() - started)));
      }

      let analysis;
      try {
        analysis = parseRetentionAnswer(raw, drops, duration);
      } catch (err) {
        if (err instanceof RetentionContractError) throw new Error("L'IA a répondu dans un format inattendu : relancez l'analyse, cela passe en général du premier coup. Rien n'a été décompté.");
        throw err;
      }
      const usage = currentAiContext()?.usage;
      return prisma.videoInsight.create({
        data: {
          postTargetId: t.postTargetId ?? null,
          connectionId: t.postTargetId ? null : (t.connectionId ?? null),
          videoId: t.postTargetId ? null : t.videoId,
          summary: analysis.summary,
          dropOffPoints: JSON.stringify(analysis.dropOffPoints),
          recommendations: JSON.stringify(analysis.recommendations),
          retentionCurve: JSON.stringify(curve),
          mode,
          model: currentAiContext()?.model ?? retentionModel(),
          durationSeconds: duration,
          promptTokens: usage?.input ?? null,
          videoTokens: usage?.video ?? null,
          outputTokens: usage?.output ?? null
        }
      });
    });
    return NextResponse.json({ insight, reused: false, usedCredit: gate.allowance.usedCredit, quota: await aiQuotaSnapshot(t.userId, gate.info) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
