// Miniatures « en un clic » (07/10/2026) : Gemini regarde la vidéo importée.
// Contrats de l'API Files de Google (envoi « resumable » par morceaux,
// préparation PROCESSING → ACTIVE, suppression) et de l'analyse de la
// vidéo, d'après la documentation officielle :
//  - https://ai.google.dev/gemini-api/docs/files
//  - https://ai.google.dev/gemini-api/docs/video-understanding
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const alerts = vi.hoisted(() => ({ list: [] as { title: string; body: string; dedupeKey: string | null }[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ id: "owner" })) },
    notification: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: { data: { title: string; body: string; dedupeKey: string | null } }) => {
        alerts.list.push(args.data);
        return args.data;
      }),
      update: vi.fn(async () => ({}))
    },
    aiUsageDaily: { upsert: vi.fn(async () => ({})) }
  }
}));

import { generateThumbnail, geminiVideoMime, uploadVideoToGemini } from "@/lib/ai/gemini";
import { analyzeVideoForThumbnails, parseThumbnailAnalysis, thumbnailAnalysisPrompt, videoPart } from "@/lib/ai/thumbnail-analysis";
import { installNetwork, type SentRequest } from "./harness";

const UPLOAD = /^generativelanguage\.googleapis\.com\/upload\/v1beta\/files$/;
const FILE = /^generativelanguage\.googleapis\.com\/v1beta\/files\/[^/]+$/;
const STREAM = /^generativelanguage\.googleapis\.com\/v1beta\/models\/.+:streamGenerateContent$/;
const GEMINI = /^generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/;
const BLOB = /^store\.public\.blob\.vercel-storage\.com\/.+$/;
const MIB = 1024 * 1024;
const flush = () => new Promise((r) => setTimeout(r, 0));

const fileInfo = (state: string) => ({ name: "files/abc123", displayName: "tarte.mp4", mimeType: "video/mp4", uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123", state });

/** Réponses de l'envoi « resumable » : ouverture, morceaux, finalisation. */
type Reply = { status?: number; body?: unknown; raw?: string; headers?: Record<string, string> };
function uploadReply(finalState = "PROCESSING") {
  return (req: SentRequest): Reply => {
    const command = req.headers["x-goog-upload-command"];
    if (command === "start") return { status: 200, raw: "", headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=UP1&upload_protocol=resumable", "x-goog-upload-chunk-granularity": String(8 * MIB) } };
    if (command === "upload") return { status: 200, raw: "", headers: { "x-goog-upload-status": "active" } };
    return { status: 200, body: { file: fileInfo(finalState) }, headers: { "x-goog-upload-status": "final" } };
  };
}

function streamOf(bytes: number): ReadableStream<Uint8Array> {
  // Petits morceaux irréguliers, comme un vrai téléchargement.
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const n = Math.min(3 * MIB + 123, bytes - sent);
      controller.enqueue(new Uint8Array(n).fill(7));
      sent += n;
    }
  });
}

beforeEach(() => {
  alerts.list = [];
  process.env.GEMINI_API_KEY = "cle-gemini";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("API Files de Google : envoi de la vidéo", () => {
  it("envoi par morceaux de 16 Mio (multiples de la granularité), dernier morceau « upload, finalize », puis attente de l'état ACTIVE", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const size = 40 * MIB + 5;
    const net = installNetwork([
      { method: "POST", url: UPLOAD, reply: uploadReply("PROCESSING") },
      { method: "GET", url: FILE, times: 1, body: fileInfo("PROCESSING") },
      { method: "GET", url: FILE, body: fileInfo("ACTIVE") }
    ]);
    const pending = uploadVideoToGemini({ body: streamOf(size), sizeBytes: size, mimeType: "video/quicktime", displayName: "tarte.mov" }, { deadline: Date.now() + 120_000 });
    await vi.runAllTimersAsync();
    const file = await pending;
    expect(file).toEqual({ name: "files/abc123", uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123", mimeType: "video/mp4" });

    const [start, ...rest] = net.to(UPLOAD, "POST");
    expect(start.headers).toMatchObject({
      "x-goog-api-key": "cle-gemini",
      "x-goog-upload-protocol": "resumable",
      "x-goog-upload-command": "start",
      "x-goog-upload-header-content-length": String(size),
      "x-goog-upload-header-content-type": "video/mov"
    });
    expect(start.json).toEqual({ file: { display_name: "tarte.mov" } });
    // Morceaux : 16 + 16 + 8 Mio et 5 octets, offsets cumulés, jamais de clé dans l'adresse.
    expect(rest.map((r) => [r.headers["x-goog-upload-command"], r.headers["x-goog-upload-offset"], r.bytes])).toEqual([
      ["upload", "0", 16 * MIB],
      ["upload", String(16 * MIB), 16 * MIB],
      ["upload, finalize", String(32 * MIB), 8 * MIB + 5]
    ]);
    expect(rest.every((r) => r.url.searchParams.get("upload_id") === "UP1" && !r.url.search.includes("cle-gemini"))).toBe(true);
    expect(net.to(FILE, "GET")).toHaveLength(2);
  });

  it("une vidéo de la taille exacte d'un morceau : le dernier envoi n'est jamais vide", async () => {
    const net = installNetwork([{ method: "POST", url: UPLOAD, reply: uploadReply("ACTIVE") }]);
    await uploadVideoToGemini({ body: streamOf(16 * MIB), sizeBytes: 16 * MIB, mimeType: "video/mp4", displayName: "v.mp4" }, { deadline: Date.now() + 60_000 });
    const chunks = net.to(UPLOAD, "POST").slice(1);
    expect(chunks.map((r) => [r.headers["x-goog-upload-command"], r.bytes])).toEqual([["upload, finalize", 16 * MIB]]);
  });

  it("Google ne sait pas lire la vidéo (FAILED) : message clair, fichier supprimé", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const net = installNetwork([
      { method: "POST", url: UPLOAD, reply: uploadReply("PROCESSING") },
      { method: "GET", url: FILE, body: fileInfo("FAILED") },
      { method: "DELETE", url: FILE, body: {} }
    ]);
    const pending = uploadVideoToGemini({ body: streamOf(MIB), sizeBytes: MIB, mimeType: "video/mp4", displayName: "v.mp4" }, { deadline: Date.now() + 60_000 }).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(((await pending) as Error).message).toMatch(/n'a pas pu lire cette vidéo/);
    vi.useRealTimers();
    await flush();
    expect(net.to(FILE, "DELETE")).toHaveLength(1);
  });

  it("envoi refusé (clé, 403) : message de configuration, propriétaire prévenu, rien dans les journaux sur la clé", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    installNetwork([{ method: "POST", url: UPLOAD, status: 403, body: { error: { code: 403, status: "PERMISSION_DENIED", message: "Method doesn't allow unregistered callers." } } }]);
    const err = await uploadVideoToGemini({ body: streamOf(MIB), sizeBytes: MIB, mimeType: "video/mp4", displayName: "v.mp4" }, { deadline: Date.now() + 60_000 }).catch((e) => e);
    expect((err as Error).message).toMatch(/momentanément indisponible \(configuration\)/);
    await flush();
    expect(alerts.list[0]).toMatchObject({ title: "Gemini : envoi de vidéo refusé", dedupeKey: "gemini-files" });
    expect(logs.mock.calls.map((c) => String(c[0])).join("\n")).not.toContain("cle-gemini");
  });

  it("types de vidéo : video/quicktime s'écrit video/mov chez Google", () => {
    expect(geminiVideoMime("video/quicktime")).toBe("video/mov");
    expect(geminiVideoMime("video/webm")).toBe("video/webm");
    expect(geminiVideoMime("application/octet-stream")).toBe("video/mp4");
  });
});

describe("Analyse de la vidéo pour les miniatures", () => {
  const answer = {
    summary: "Recette de tarte aux pommes en 3 étapes.",
    audience: "Débutants en pâtisserie",
    promise: "Une tarte croustillante du premier coup",
    concepts: [
      { second: 42.5, moment: "La tarte sort du four", angle: "Résultat", hook: "croustillante !", imagePrompt: "Rapprocher la tarte.", why: ["Le résultat arrête le défilement.", "La promesse est claire."] },
      { second: "0:12", moment: "La pâte se déchire", angle: "Contraste", hook: "L'ERREUR", imagePrompt: "Gros plan sur la pâte.", why: "L'erreur intrigue. On veut savoir comment l'éviter." },
      { second: 500, moment: "Première bouchée", angle: "Émotion", hook: "", imagePrompt: "Visage en gros plan.", why: ["Le visage crée l'identification."] }
    ]
  };

  it("de bout en bout : vidéo relue sur Vercel Blob, envoyée à Google, regardée (image et son), fichier supprimé", async () => {
    const sse = `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 9800, candidatesTokenCount: 600, thoughtsTokenCount: 800, promptTokensDetails: [{ modality: "VIDEO", tokenCount: 6300 }, { modality: "AUDIO", tokenCount: 3000 }] } })}\r\n\r\n`;
    const net = installNetwork([
      { method: "GET", url: BLOB, bytes: new Uint8Array(2 * MIB).fill(1), headers: { "content-type": "video/mp4" } },
      { method: "POST", url: UPLOAD, reply: uploadReply("ACTIVE") },
      { method: "POST", url: STREAM, raw: sse, headers: { "content-type": "text/event-stream" } },
      { method: "DELETE", url: FILE, body: {} }
    ]);
    const result = await analyzeVideoForThumbnails(
      { url: "https://store.public.blob.vercel-storage.com/b/m/tarte.mp4", mimeType: "video/mp4", sizeBytes: 2 * MIB, filename: "tarte.mp4" },
      { title: "Tarte aux pommes", caption: "Ma recette", networks: ["YOUTUBE", "TIKTOK"], durationSeconds: 95, orientation: "horizontal" },
      { deadline: Date.now() + 120_000 }
    );
    expect(result.summary).toBe(answer.summary);
    expect(result.concepts.map((c) => [c.second, c.hook])).toEqual([
      [42.5, "CROUSTILLANTE !"],
      [12, "L'ERREUR"],
      [94.7, ""] // ramené dans la vidéo (95 s)
    ]);
    expect(result.concepts[1].why).toEqual(["L'erreur intrigue.", "On veut savoir comment l'éviter."]);

    const gen = net.to(STREAM, "POST")[0];
    const body = gen.json as { contents: { parts: Record<string, unknown>[] }[]; systemInstruction: { parts: { text: string }[] }; generationConfig: Record<string, unknown> };
    expect(body.contents[0].parts[0]).toEqual({ file_data: { file_uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123", mime_type: "video/mp4" } });
    expect(String(body.contents[0].parts[1].text)).toContain("Réseaux visés : YouTube, TikTok.");
    expect(body.systemInstruction.parts[0].text).toMatch(/image ET son/);
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", mediaResolution: "MEDIA_RESOLUTION_LOW", thinkingConfig: { thinkingLevel: "medium" } });
    expect(net.to(FILE, "DELETE")).toHaveLength(1);
  });

  it("échec de l'analyse : le fichier est quand même supprimé chez Google", async () => {
    const net = installNetwork([
      { method: "GET", url: BLOB, bytes: new Uint8Array(MIB), headers: { "content-type": "video/mp4" } },
      { method: "POST", url: UPLOAD, reply: uploadReply("ACTIVE") },
      { method: "POST", url: STREAM, status: 400, body: { error: { code: 400, status: "INVALID_ARGUMENT", message: "Request contains an invalid argument." } } },
      { method: "DELETE", url: FILE, body: {} }
    ]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      analyzeVideoForThumbnails({ url: "https://store.public.blob.vercel-storage.com/v.mp4", mimeType: "video/mp4", sizeBytes: MIB, filename: "v.mp4" }, { durationSeconds: 30, orientation: null }, { deadline: Date.now() + 60_000 })
    ).rejects.toThrow();
    expect(net.to(FILE, "DELETE")).toHaveLength(1);
  });

  it("vidéo introuvable sur Vercel Blob : message clair, rien n'est envoyé à Google", async () => {
    const net = installNetwork([{ method: "GET", url: BLOB, status: 404, raw: "Not found" }]);
    await expect(
      analyzeVideoForThumbnails({ url: "https://store.public.blob.vercel-storage.com/v.mp4", mimeType: "video/mp4", sizeBytes: MIB, filename: "v.mp4" }, { durationSeconds: 30, orientation: null }, { deadline: Date.now() + 60_000 })
    ).rejects.toThrow(/introuvable : importez-la à nouveau/);
    expect(net.to(UPLOAD)).toHaveLength(0);
  });

  it("longue vidéo : moins d'images par seconde au-delà de 10 min, première heure seulement au-delà d'1 h", () => {
    const file = { uri: "u", mimeType: "video/mp4" };
    expect(videoPart(file, 300).video_metadata).toBeUndefined();
    expect(videoPart(file, 1_200).video_metadata).toEqual({ fps: 0.5 });
    expect(videoPart(file, 7_200).video_metadata).toEqual({ fps: 0.2, end_offset: "3600s" });
  });

  it("demande : titre, description, réseaux et format transmis ; rien d'inventé quand ils manquent", () => {
    expect(thumbnailAnalysisPrompt({ durationSeconds: 61, orientation: "vertical" })).toContain("Vidéo verticale");
    expect(thumbnailAnalysisPrompt({ durationSeconds: null, orientation: null })).toContain("Pas encore de titre.");
  });

  it("réponse : bloc ```json accepté, concepts sans instant écartés, 3 au plus ; réponse vide → message clair", () => {
    const raw = "```json\n" + JSON.stringify({ summary: "S", concepts: [{ imagePrompt: "x" }, ...answer.concepts, answer.concepts[0]] }) + "\n```";
    const parsed = parseThumbnailAnalysis(raw, null);
    expect(parsed.concepts).toHaveLength(3);
    expect(parsed.concepts[0].second).toBe(42.5);
    expect(() => parseThumbnailAnalysis("pas du json", 30)).toThrow(/illisible/);
    expect(() => parseThumbnailAnalysis(JSON.stringify({ summary: "S", concepts: [] }), 30)).toThrow(/aucune miniature utilisable/);
  });
});

describe("Miniature créée à partir d'une image de la vidéo", () => {
  it("vidéo verticale : image 9:16 demandée ; fidélité exigée ; accroche écrite telle quelle", async () => {
    const net = installNetwork([{ method: "POST", url: GEMINI, fixture: "gemini/image-3.1" }]);
    await generateThumbnail({ frameBase64: "AAAA", frameMimeType: "image/jpeg", title: "Tarte", aspect: "9:16", brief: { hook: "CROUSTILLANTE", imagePrompt: "Rapprocher la tarte." } });
    const body = net.sent[0].json as { contents: { parts: { text?: string }[] }[]; generationConfig: { imageConfig: { aspectRatio: string } } };
    expect(body.generationConfig.imageConfig.aspectRatio).toBe("9:16");
    const prompt = body.contents[0].parts[0].text ?? "";
    expect(prompt).toMatch(/garde les personnes identiques/);
    expect(prompt).toMatch(/n'ajoute aucun objet, personne, logo/);
    expect(prompt).toContain("« CROUSTILLANTE »");
    expect(prompt).toMatch(/Format vertical 9:16/);
  });

  it("concept sans accroche : aucun texte demandé sur l'image", async () => {
    const net = installNetwork([{ method: "POST", url: GEMINI, fixture: "gemini/image-3.1" }]);
    await generateThumbnail({ frameBase64: "AAAA", frameMimeType: "image/jpeg", title: "Tarte", brief: { hook: "", imagePrompt: "Visage en gros plan." } });
    const prompt = (net.sent[0].json as { contents: { parts: { text?: string }[] }[] }).contents[0].parts[0].text ?? "";
    expect(prompt).toContain("N'écris aucun texte sur l'image.");
    expect((net.sent[0].json as { generationConfig: { imageConfig: { aspectRatio: string } } }).generationConfig.imageConfig.aspectRatio).toBe("16:9");
  });
});
