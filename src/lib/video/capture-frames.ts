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

/**
 * `count` images réparties dans la vidéo (jamais la toute première ni la
 * dernière). `maxWidth` réduit les grandes vidéos (4K…) pour des images
 * légères ; par défaut, taille d'origine.
 */
export async function captureVideoFrames(sourceUrl: string, count: number, opts: { maxWidth?: number } = {}): Promise<Blob[]> {
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

  const blobs: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const t = duration > 0 ? (duration * (i + 1)) / (count + 1) : 0;
    const seeked = waitFor(video, "seeked", 10_000, "Erreur pendant l'extraction d'une image de la vidéo.");
    video.currentTime = t;
    await seeked;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob) blobs.push(blob);
  }
  video.removeAttribute("src");
  video.load();
  return blobs;
}
