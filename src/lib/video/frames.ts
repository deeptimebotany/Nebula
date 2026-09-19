import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);

/**
 * Extraction réelle de frames et de métadonnées vidéo via ffmpeg/ffprobe en
 * ligne de commande (aucune dépendance npm lourde, aucune IA, gratuit).
 *
 * Nécessite que les binaires `ffmpeg`/`ffprobe` soient installés sur le
 * serveur qui exécute Nebula. C'est le cas par défaut sur la plupart des VPS
 * et images Docker basées sur une distro complète, mais PAS sur les
 * fonctions serverless Vercel par défaut — voir le README pour les options
 * de déploiement si vous utilisez cette fonctionnalité.
 */

export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function getVideoDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath
  ]);
  const duration = parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Impossible de lire la durée de la vidéo (fichier corrompu ou format non supporté).");
  }
  return duration;
}

/**
 * Extrait une frame JPEG à chaque instant de `timestampsSeconds` et les
 * écrit dans `outDir` sous `${baseName}-<i>.jpg`. Retourne les chemins
 * absolus des fichiers créés, dans le même ordre que les timestamps fournis.
 */
export async function extractFrames(
  filePath: string,
  outDir: string,
  baseName: string,
  timestampsSeconds: number[]
): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const outputs: string[] = [];

  for (let i = 0; i < timestampsSeconds.length; i++) {
    const t = Math.max(0, timestampsSeconds[i]);
    const outPath = path.join(outDir, `${baseName}-${i}.jpg`);
    // -ss avant -i : seek rapide (moins précis à la frame près, largement
    // suffisant pour une miniature). -frames:v 1 : une seule image.
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss",
      t.toFixed(2),
      "-i",
      filePath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-vf",
      "scale=640:-2",
      outPath
    ]);
    outputs.push(outPath);
  }

  return outputs;
}

/** Répartit N timestamps uniformément entre 5% et 95% de la durée, pour
 * éviter les toutes premières/dernières frames souvent noires ou génériques. */
export function evenlySpacedTimestamps(durationSeconds: number, count: number): number[] {
  const start = durationSeconds * 0.05;
  const end = durationSeconds * 0.95;
  if (count <= 1) return [durationSeconds / 2];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => start + step * i);
}
