// « Rédiger avec l'IA » à partir de la vidéo (09/10/2026, demande de Lucas) :
// Gemini regarde la vidéo importée (image et son) avant d'écrire le titre ou
// la description. Mêmes contrats que les miniatures « en un clic »
// (gemini-video.test.ts) : envoi à l'API Files, analyse, suppression.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ id: "owner" })) },
    notification: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
    aiUsageDaily: { upsert: vi.fn(async () => ({})) }
  }
}));

import { analyzeVideoForCopy, copyAnalysisBrief, parseCopyAnalysis } from "@/lib/ai/copy-analysis";
import { generateCopy } from "@/lib/ai/gemini";
import { installNetwork, type SentRequest } from "./harness";

const UPLOAD = /^generativelanguage\.googleapis\.com\/upload\/v1beta\/files$/;
const FILE = /^generativelanguage\.googleapis\.com\/v1beta\/files\/[^/]+$/;
const STREAM = /^generativelanguage\.googleapis\.com\/v1beta\/models\/.+:streamGenerateContent$/;
const BLOB = /^store\.public\.blob\.vercel-storage\.com\/.+$/;
const MIB = 1024 * 1024;

const fileInfo = (state: string) => ({ name: "files/abc123", displayName: "jungle.mp4", mimeType: "video/mp4", uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123", state });
type Reply = { status?: number; body?: unknown; raw?: string; headers?: Record<string, string> };
function uploadReply(finalState = "ACTIVE") {
  return (req: SentRequest): Reply => {
    const command = req.headers["x-goog-upload-command"];
    if (command === "start") return { status: 200, raw: "", headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=UP1&upload_protocol=resumable", "x-goog-upload-chunk-granularity": String(8 * MIB) } };
    if (command === "upload") return { status: 200, raw: "", headers: { "x-goog-upload-status": "active" } };
    return { status: 200, body: { file: fileInfo(finalState) }, headers: { "x-goog-upload-status": "final" } };
  };
}
const sseOf = (text: string) =>
  `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 300 } })}\r\n\r\n`;

beforeEach(() => {
  process.env.GEMINI_API_KEY = "cle-gemini";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const answer = {
  summary: "Une randonnée jusqu'à une cascade dans la jungle, filmée à la première personne.",
  spoken: "La personne explique qu'il a fallu deux heures de marche pour arriver à la cascade.",
  onScreenText: "Jour 7",
  keyMoments: ["Départ du sentier", "Traversée de la rivière", "Arrivée à la cascade"],
  tone: "enthousiaste",
  language: "français"
};

describe("analyse de la vidéo pour la rédaction", () => {
  it("de bout en bout : vidéo relue, envoyée à Google, regardée (image et son), fichier supprimé", async () => {
    const net = installNetwork([
      { method: "GET", url: BLOB, bytes: new Uint8Array(2 * MIB).fill(1), headers: { "content-type": "video/mp4" } },
      { method: "POST", url: UPLOAD, reply: uploadReply("ACTIVE") },
      { method: "POST", url: STREAM, raw: sseOf(JSON.stringify(answer)), headers: { "content-type": "text/event-stream" } },
      { method: "DELETE", url: FILE, body: {} }
    ]);
    const result = await analyzeVideoForCopy(
      { url: "https://store.public.blob.vercel-storage.com/b/m/jungle.mp4", mimeType: "video/mp4", sizeBytes: 2 * MIB, filename: "jungle.mp4" },
      { durationSeconds: 531 },
      { deadline: Date.now() + 120_000 }
    );
    expect(result).toEqual(answer);
    const body = net.to(STREAM, "POST")[0].json as { contents: { parts: Record<string, unknown>[] }[]; systemInstruction: { parts: { text: string }[] }; generationConfig: Record<string, unknown> };
    expect(body.contents[0].parts[0]).toEqual({ file_data: { file_uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123", mime_type: "video/mp4" } });
    expect(String(body.contents[0].parts[1].text)).toContain("Durée : 8 min 51 s.");
    expect(body.systemInstruction.parts[0].text).toMatch(/image ET son/);
    expect(body.systemInstruction.parts[0].text).toMatch(/N'invente rien/);
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json" });
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
      analyzeVideoForCopy({ url: "https://store.public.blob.vercel-storage.com/b/m/jungle.mp4", mimeType: "video/mp4", sizeBytes: MIB, filename: "jungle.mp4" }, { durationSeconds: 30 }, { deadline: Date.now() + 60_000 })
    ).rejects.toThrow();
    expect(net.to(FILE, "DELETE")).toHaveLength(1);
  });

  it("réponse : bornée, moments en liste, erreur claire si illisible ou vide", () => {
    const a = parseCopyAnalysis("```json\n" + JSON.stringify({ summary: "Un chat joue.", keyMoments: "- Le chat saute\n- Il tombe", spoken: null }) + "\n```");
    expect(a).toMatchObject({ summary: "Un chat joue.", spoken: "", keyMoments: ["Le chat saute", "Il tombe"] });
    expect(() => parseCopyAnalysis("pas du json")).toThrow(/illisible/);
    expect(() => parseCopyAnalysis(JSON.stringify({ summary: "" }))).toThrow(/incomplète/);
    const brief = copyAnalysisBrief(a);
    expect(brief).toContain("Ce que montre la vidéo : Un chat joue.");
    expect(brief).toContain("Personne ne parle dans la vidéo.");
  });

  it("rédaction : le résumé de la vidéo est donné à l'IA comme seule base du texte", async () => {
    const net = installNetwork([
      { method: "POST", url: STREAM, raw: sseOf("Deux heures de marche pour cette cascade"), headers: { "content-type": "text/event-stream" } },
      { method: "POST", url: /^generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/, body: { candidates: [{ content: { role: "model", parts: [{ text: "Deux heures de marche pour cette cascade" }] }, finishReason: "STOP" }] } }
    ]);
    const text = await generateCopy({ field: "title", brandName: "Deep Time", mediaBrief: copyAnalysisBrief(answer) });
    expect(text).toBe("Deux heures de marche pour cette cascade");
    const sent = JSON.stringify(net.sent.map((r) => r.json));
    expect(sent).toContain("regardée en entier, image et son");
    expect(sent).toContain("deux heures de marche pour arriver à la cascade");
    expect(sent).toContain("ne rédige surtout pas un texte de présentation générique de la marque");
  });
});
