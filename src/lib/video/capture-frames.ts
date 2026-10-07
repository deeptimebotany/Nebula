// Extrait des images d'une vidéo directement dans le navigateur (canvas),
// sans passer par ffmpeg côté serveur : fonctionne partout, y compris sur
// Vercel et avec des vidéos stockées sur Vercel Blob. Utilisé par la page
// Publier (section Miniature) et par l'éditeur vidéo : la vidéo ne quitte
// jamais le navigateur.
// Module navigateur uniquement (document, canvas).

/** Attend un événement de la vidéo, avec une limite de temps (certains formats ne se lisent jamais). */
function waitFor(video: HTMLVideoElement, event: "loadedmetadata" | "seeked", ms: number, message: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(message));
    }, ms);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(message));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener("error", onErr);
    };
    video.addEventListener(event, onOk);
    video.addEventListener("error", onErr);
  });
}

export interface CapturedFrames {
  /** Une image par instant demandé (dans l'ordre), JPEG. */
  frames: Blob[];
  /** Taille réelle de la vidéo (rotation du téléphone comprise). */
  width: number;
  height: number;
  /** Durée en secondes (0 si inconnue). */
  duration: number;
}

/**
 * Images de la vidéo aux instants calculés par `times(duration)` (en
 * secondes). `maxWidth` réduit les grandes vidéos (4K…) pour des images
 * légères ; par défaut, taille d'origine.
 */
async function captureAt(sourceUrl: string, times: (duration: number) => number[], opts: { maxWidth?: number }): Promise<CapturedFrames> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  const loaded = waitFor(video, "loadedmetadata", 20_000, "Impossible de lire cette vidéo pour en extraire des images. Essayez un fichier MP4.");
  video.src = sourceUrl;
  await loaded;

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const srcW = video.videoWidth || 640;
  const srcH = video.videoHeight || 360;
  const scale = opts.maxWidth && srcW > opts.maxWidth ? opts.maxWidth / srcW : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Capture d'image non supportée par ce navigateur.");

  const frames: Blob[] = [];
  for (const wanted of times(duration)) {
    // Toujours dans la vidéo (jamais la toute dernière image, souvent noire).
    const t = duration > 0 ? Math.min(Math.max(wanted, 0), Math.max(0, duration - 0.2)) : 0;
    const seeked = waitFor(video, "seeked", 10_000, "Erreur pendant l'extraction d'une image de la vidéo.");
    video.currentTime = t;
    await seeked;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (blob) frames.push(blob);
  }
  video.removeAttribute("src");
  video.load();
  return { frames, width: srcW, height: srcH, duration };
}

/**
 * `count` images réparties dans la vidéo (jamais la toute première ni la
 * dernière). `maxWidth` réduit les grandes vidéos (4K…) pour des images
 * légères ; par défaut, taille d'origine.
 */
export async function captureVideoFrames(sourceUrl: string, count: number, opts: { maxWidth?: number } = {}): Promise<Blob[]> {
  const captured = await captureAt(sourceUrl, (duration) => Array.from({ length: count }, (_, i) => (duration > 0 ? (duration * (i + 1)) / (count + 1) : 0)), opts);
  return captured.frames;
}

/**
 * Images aux instants précis choisis par l'IA (miniatures « en un clic »,
 * 07/10/2026), avec la taille et la durée de la vidéo.
 */
export function captureVideoFramesAt(sourceUrl: string, seconds: number[], opts: { maxWidth?: number } = {}): Promise<CapturedFrames> {
  return captureAt(sourceUrl, () => seconds, opts);
}

/** Durée et taille d'une vidéo (métadonnées seulement), ou null si illisible. */
export async function readVideoInfo(sourceUrl: string): Promise<{ duration: number; width: number; height: number } | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.crossOrigin = "anonymous";
  const loaded = waitFor(video, "loadedmetadata", 15_000, "illisible");
  video.src = sourceUrl;
  try {
    await loaded;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    return { duration, width: video.videoWidth, height: video.videoHeight };
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
