// Export de la vidéo modifiée (éditeur vidéo de Publier, 30/09/2026), dans
// le navigateur, avec Mediabunny (licence MPL-2.0, WebCodecs) :
//   - décodage image par image des passages gardés (lecture exacte, pas de
//     saut d'image), rendu WebGL (renderer.ts) + calques (layers.ts) ;
//   - encodage H.264 (MP4) accepté par Instagram, TikTok, YouTube, Facebook ;
//   - son : passages gardés, réencodés en AAC ; si le navigateur n'a pas
//     d'encodeur AAC (Firefox, certains Safari), l'extension
//     @mediabunny/aac-encoder (WebAssembly) prend le relais.
// Aucun envoi pendant l'export : le fichier final est ensuite envoyé comme
// un import normal (uploadMediaFile).
import { outputDuration, outputSize, type Segment, type VideoEdit } from "./model";
import { EditRenderer } from "./renderer";
import { drawLayers, loadAllLayerImages } from "./layers";

export class VideoExportError extends Error {}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
}

export interface ExportOptions {
  /** Taille de la vidéo telle que l'éditeur l'a lue (repère du recadrage). */
  srcW: number;
  srcH: number;
  onProgress?: (fraction: number, step: "audio" | "video" | "final") => void;
  signal?: AbortSignal;
  /**
   * Tests seulement : codec vidéo à la place de H.264 (le Chromium des
   * tests automatiques n'a pas d'encodeur H.264).
   */
  videoCodecForTests?: "vp9";
}

/** Le navigateur sait-il encoder une vidéo ? (WebCodecs) */
export function browserCanEditVideo(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Export annulé.", "AbortError");
}

/** Morceau [from, to[ (secondes absolues) d'un AudioBuffer qui commence à `start`. */
function sliceBuffer(buffer: AudioBuffer, start: number, from: number, to: number, channels: number): AudioBuffer | null {
  const rate = buffer.sampleRate;
  const a = Math.max(0, Math.round((from - start) * rate));
  const b = Math.min(buffer.length, Math.round((to - start) * rate));
  if (b <= a) return null;
  const out = new AudioBuffer({ length: b - a, numberOfChannels: channels, sampleRate: rate });
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
    out.copyToChannel(src.subarray(a, b), c);
  }
  return out;
}

/** Rééchantillonne une suite de morceaux à 48 kHz (fréquences inhabituelles). */
async function resampleAll(buffers: AudioBuffer[], channels: number): Promise<AudioBuffer> {
  const rate = buffers[0].sampleRate;
  const length = buffers.reduce((s, b) => s + b.length, 0);
  const joined = new AudioBuffer({ length, numberOfChannels: channels, sampleRate: rate });
  let offset = 0;
  for (const b of buffers) {
    for (let c = 0; c < channels; c++) joined.copyToChannel(b.getChannelData(c), c, offset);
    offset += b.length;
  }
  const ctx = new OfflineAudioContext(channels, Math.ceil((length / rate) * 48000), 48000);
  const node = ctx.createBufferSource();
  node.buffer = joined;
  node.connect(ctx.destination);
  node.start();
  return ctx.startRendering();
}

export async function exportEditedVideo(source: Blob, edit: VideoEdit, opts: ExportOptions): Promise<ExportResult> {
  if (!browserCanEditVideo()) throw new VideoExportError("Ce navigateur ne sait pas créer de vidéo. Utilisez Chrome, Edge ou Safari à jour.");
  const mb = await import("mediabunny");
  const { signal, onProgress } = opts;
  const segments: Segment[] = edit.segments.filter((s) => s.end - s.start > 0.01);
  const total = outputDuration(segments);
  if (total <= 0) throw new VideoExportError("La vidéo finale est vide : gardez au moins un passage.");

  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(source) });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new VideoExportError("Aucune image vidéo dans ce fichier.");
    if (!(await videoTrack.canDecode())) {
      throw new VideoExportError("Ce navigateur ne sait pas lire le format de cette vidéo (souvent du HEVC d'iPhone). Essayez avec Safari, ou exportez-la en H.264 depuis votre téléphone.");
    }
    const { width, height } = outputSize(edit);
    const videoCodec = opts.videoCodecForTests ?? "avc";
    if (!(await mb.canEncodeVideo(videoCodec, { width, height }))) {
      const anySize = await mb.canEncodeVideo(videoCodec, { width: 640, height: 360 });
      throw new VideoExportError(
        anySize
          ? `Ce navigateur ne sait pas encoder une vidéo MP4 de ${width} × ${height}. Réduisez les dimensions (outil Dimensions), par exemple à 1080 px de large.`
          : "Ce navigateur ne sait pas créer de vidéo MP4 (H.264). Utilisez Chrome, Edge ou Safari à jour."
      );
    }

    const audioTrack = edit.audio ? await input.getPrimaryAudioTrack() : null;
    // Son illisible par WebCodecs (AudioDecoder absent, ex. certains Safari) :
    // décodage de secours par le Web Audio API, sur tout le fichier.
    const decodeWithWebAudio = audioTrack ? !(await audioTrack.canDecode()) : false;
    const channels = audioTrack ? Math.min(2, Math.max(1, audioTrack.numberOfChannels)) : 0;
    if (audioTrack) {
      const native = await mb.canEncodeAudio("aac", { numberOfChannels: channels, sampleRate: audioTrack.sampleRate });
      if (!native) {
        const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
        registerAacEncoder();
      }
    }
    checkAbort(signal);

    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = width;
    frameCanvas.height = height;
    const ctx = frameCanvas.getContext("2d");
    if (!ctx) throw new VideoExportError("Canvas indisponible.");
    const videoSource = new mb.CanvasSource(frameCanvas, { codec: videoCodec, quality: new mb.Quality("high"), keyFrameInterval: 2 });
    output.addVideoTrack(videoSource);
    const audioSource = audioTrack ? new mb.AudioBufferSource({ codec: "aac", quality: new mb.Quality("high") }) : null;
    if (audioSource) output.addAudioTrack(audioSource);

    const renderer = new EditRenderer();
    const images = await loadAllLayerImages(edit.layers);
    try {
      await output.start();

      // 1. Le son d'abord (le plus léger), passage par passage.
      if (audioTrack && audioSource) {
        const pieces: AudioBuffer[] = [];
        if (decodeWithWebAudio) {
          const ac = new OfflineAudioContext(1, 1, 48000);
          const whole = await ac.decodeAudioData(await source.arrayBuffer());
          for (const seg of segments) {
            const piece = sliceBuffer(whole, 0, seg.start, seg.end, channels);
            if (piece) pieces.push(piece);
          }
          onProgress?.(0.1, "audio");
        } else {
          const sink = new mb.AudioBufferSink(audioTrack);
          let done = 0;
          for (const seg of segments) {
            for await (const wrapped of sink.buffers(seg.start, seg.end)) {
              checkAbort(signal);
              const piece = sliceBuffer(wrapped.buffer, wrapped.timestamp, Math.max(seg.start, wrapped.timestamp), Math.min(seg.end, wrapped.timestamp + wrapped.duration), channels);
              if (piece) pieces.push(piece);
            }
            done += seg.end - seg.start;
            onProgress?.((done / total) * 0.1, "audio");
          }
        }
        if (pieces.length) {
          const rate = pieces[0].sampleRate;
          const usual = rate === 44100 || rate === 48000;
          if (usual) {
            for (const p of pieces) await audioSource.add(p);
          } else {
            await audioSource.add(await resampleAll(pieces, channels));
          }
        }
      }

      // 2. Les images, passage par passage, au même rythme que l'original.
      const sink = new mb.CanvasSink(videoTrack, { poolSize: 2 });
      let offset = 0;
      for (const seg of segments) {
        for await (const frame of sink.canvases(seg.start, seg.end)) {
          checkAbort(signal);
          const from = Math.max(seg.start, frame.timestamp);
          const to = Math.min(seg.end, frame.timestamp + frame.duration);
          if (to - from <= 0.0005) continue;
          renderer.render(frame.canvas, frame.canvas.width, frame.canvas.height, edit, opts.srcW, opts.srcH, { outW: width, outH: height });
          ctx.drawImage(renderer.canvas, 0, 0, width, height);
          drawLayers(ctx, edit.layers, width, height, images);
          await videoSource.add(offset + (from - seg.start), to - from);
          onProgress?.(0.1 + 0.85 * ((offset + (to - seg.start)) / total), "video");
        }
        offset += seg.end - seg.start;
      }

      onProgress?.(0.96, "final");
      await output.finalize();
    } catch (err) {
      await output.cancel().catch(() => undefined);
      throw err;
    } finally {
      renderer.dispose();
    }

    const buffer = output.target.buffer;
    if (!buffer) throw new VideoExportError("Le fichier final n'a pas pu être écrit.");
    onProgress?.(1, "final");
    return { blob: new Blob([buffer], { type: "video/mp4" }), width, height, duration: total, hasAudio: Boolean(audioTrack) };
  } finally {
    input.dispose();
  }
}
