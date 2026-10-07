// Contrats des services du site — lot 9 : Gemini (IA), Resend (e-mails),
// Cloudflare Turnstile (anti-robot), Stripe (réglages du client), Linktree.
// Réponses types d'après la documentation officielle :
//  - Gemini : https://ai.google.dev/api/generate-content (réponses en camelCase)
//  - Resend : https://resend.com/docs/api-reference/emails/send-email,
//    https://resend.com/docs/dashboard/emails/idempotency-keys
//  - Turnstile : https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
import { readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Base factice : le propriétaire existe, ses notifications sont enregistrées.
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
    }
  }
}));

import { GeminiQuotaError, chatComplete, cleanApiKey, diagnoseGemini, generateRetentionJson, generateThumbnail } from "@/lib/ai/gemini";
import { runWithAiContext, type AiCallContext } from "@/lib/ai/usage";
import { emailIdempotencyKey, sendEmail } from "@/lib/email";
import { extractLinktreeLinksDetailed } from "@/lib/linktree";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { stripe } from "@/lib/billing/stripe";
import { installNetwork } from "./harness";

const GEMINI = /^generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  alerts.list = [];
  process.env.GEMINI_API_KEY = "cle-gemini";
  process.env.RESEND_API_KEY = "re_exemple";
  process.env.TURNSTILE_SECRET_KEY = "secret-turnstile";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Gemini", () => {
  it("Rétention (30/09/2026) : réponse en flux SSE recollée, vidéo YouTube en basse résolution, réflexion demandée, jetons de vidéo mesurés", async () => {
    // Flux de https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent
    // (alt=sse) : une « pensée », le texte en deux morceaux, l'usage à la fin.
    const events = [
      { candidates: [{ content: { role: "model", parts: [{ text: "Je regarde la vidéo…", thought: true }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: '{"summary":"Intro trop longue.",' }] } }] },
      {
        candidates: [{ content: { role: "model", parts: [{ text: '"drops":[],"recommendations":["Coupez l\'intro."]}' }] }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 60500,
          candidatesTokenCount: 120,
          thoughtsTokenCount: 900,
          totalTokenCount: 61520,
          promptTokensDetails: [
            { modality: "TEXT", tokenCount: 500 },
            { modality: "VIDEO", tokenCount: 52000 },
            { modality: "AUDIO", tokenCount: 8000 }
          ]
        }
      }
    ];
    const raw = events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join("");
    const net = installNetwork([{ method: "POST", url: /^generativelanguage\.googleapis\.com\/v1beta\/models\/.+:streamGenerateContent$/, raw, headers: { "content-type": "text/event-stream" } }]);
    const ctx: AiCallContext = { plan: "PRO", kind: "retention", billed: false, model: null };
    const text = await runWithAiContext(ctx, () =>
      generateRetentionJson({ systemInstruction: "Analyste", parts: [{ text: "Chutes…" }, { file_data: { file_uri: "https://www.youtube.com/watch?v=abc" } }], thinking: "high", video: true })
    );
    expect(JSON.parse(text)).toEqual({ summary: "Intro trop longue.", drops: [], recommendations: ["Coupez l'intro."] });
    const sent = net.sent[0];
    expect(sent.url.pathname).toContain("gemini-3.8-flash:streamGenerateContent");
    expect(sent.url.search).toBe("?alt=sse");
    expect(sent.headers["x-goog-api-key"]).toBe("cle-gemini");
    const body = sent.json as { contents: { parts: Record<string, unknown>[] }[]; generationConfig: Record<string, unknown> };
    expect(body.contents[0].parts[1]).toEqual({ file_data: { file_uri: "https://www.youtube.com/watch?v=abc" } });
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", mediaResolution: "MEDIA_RESOLUTION_LOW", thinkingConfig: { thinkingLevel: "high" } });
    expect(body.generationConfig).not.toHaveProperty("temperature"); // Gemini 3 : température par défaut
    // Jetons réels, « pensée » comptée en sortie, vidéo et son de la vidéo à part.
    expect(ctx).toMatchObject({ billed: true, model: "gemini-3.8-flash", usage: { input: 60500, video: 60000, output: 1020 } });
  });

  it("texte : parties assemblées ; clé dans l'en-tête, jamais dans l'adresse", async () => {
    const net = installNetwork([{ method: "POST", url: GEMINI, fixture: "gemini/text" }]);
    expect(await chatComplete([{ role: "user", text: "Bonjour" }], "Assistant")).toBe("Nouveau menu d'automne : venez goûter nos tartes ! #cafe #automne");
    expect(net.sent[0].url.search).toBe("");
    expect(net.sent[0].headers["x-goog-api-key"]).toBe("cle-gemini");
  });

  it("les « pensées » du modèle ne sont jamais montrées", async () => {
    installNetwork([{ method: "POST", url: GEMINI, fixture: "gemini/text-with-thought" }]);
    expect(await chatComplete([{ role: "user", text: "Titre ?" }], "Assistant")).toBe("Titre final");
  });

  it("image générée lue dans inlineData (camelCase) — avant le lot 9 : « aucune image » à chaque fois", async () => {
    installNetwork([{ method: "POST", url: GEMINI, fixture: "gemini/image" }]);
    const image = await generateThumbnail({ frameBase64: "AAAA", frameMimeType: "image/jpeg", title: "Menu" });
    expect(image.mimeType).toBe("image/png");
    expect(image.base64).toMatch(/^iVBOR/);
  });

  it("gemini-3.1-flash-image : images « brouillon » ignorées, réglages 1K et 16:9 envoyés", async () => {
    const net = installNetwork([{ method: "POST", url: GEMINI, fixture: "gemini/image-3.1" }]);
    const image = await generateThumbnail({ frameBase64: "AAAA", frameMimeType: "image/jpeg", title: "Menu" });
    expect(image.base64).toMatch(/^iVBOR/);
    expect(net.sent[0].url.pathname).toContain("gemini-3.1-flash-image:generateContent");
    const body = net.sent[0].json as { generationConfig: { responseModalities: string[]; imageConfig: { aspectRatio: string; imageSize: string } } };
    expect(body.generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"]);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: "16:9", imageSize: "1K" });
  });

  it("image : si Google refuse le champ de réglage, nouvel essai avec l'autre écriture (refus non facturé)", async () => {
    const net = installNetwork([
      { method: "POST", url: GEMINI, times: 1, status: 400, body: { error: { code: 400, status: "INVALID_ARGUMENT", message: 'Invalid JSON payload received. Unknown name "imageConfig" at \'generation_config\': Cannot find field.' } } },
      { method: "POST", url: GEMINI, fixture: "gemini/image-3.1" }
    ]);
    const image = await generateThumbnail({ frameBase64: "AAAA", frameMimeType: "image/jpeg", title: "Menu" });
    expect(image.base64).toMatch(/^iVBOR/);
    expect(net.sent).toHaveLength(2);
    const second = net.sent[1].json as { generationConfig: Record<string, unknown> };
    expect(second.generationConfig.imageConfig).toBeUndefined();
    expect(second.generationConfig.responseFormat).toEqual({ image: { aspectRatio: "16:9", imageSize: "1K" } });
  });

  it("demande bloquée par les filtres ou coupée : message clair en français", async () => {
    installNetwork([{ method: "POST", url: GEMINI, fixture: "gemini/blocked" }]);
    await expect(chatComplete([{ role: "user", text: "…" }], "Assistant")).rejects.toThrow(/filtres/);
    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: GEMINI, fixture: "gemini/max-tokens" }]);
    await expect(chatComplete([{ role: "user", text: "…" }], "Assistant")).rejects.toThrow(/limite de longueur/);
  });

  it("quota : 3 essais puis GeminiQuotaError avec le délai indiqué par Google", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const net = installNetwork([{ method: "POST", url: GEMINI, status: 429, fixture: "gemini/error-quota" }]);
    const pending = chatComplete([{ role: "user", text: "…" }], "Assistant").catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await pending;
    expect(err).toBeInstanceOf(GeminiQuotaError);
    expect((err as GeminiQuotaError).retryAfterSeconds).toBe(43);
    expect(net.sent).toHaveLength(3);
  });

  it("surcharge passagère puis succès", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    installNetwork([
      { method: "POST", url: GEMINI, times: 1, status: 503, fixture: "gemini/error-overloaded" },
      { method: "POST", url: GEMINI, fixture: "gemini/text" }
    ]);
    const pending = chatComplete([{ role: "user", text: "…" }], "Assistant");
    await vi.runAllTimersAsync();
    expect(await pending).toMatch(/Nouveau menu/);
  });

  it("modèle retiré par Google : message clair et propriétaire prévenu (réglage GEMINI_MODEL)", async () => {
    installNetwork([{ method: "POST", url: GEMINI, status: 404, fixture: "gemini/error-model-not-found" }]);
    await expect(chatComplete([{ role: "user", text: "…" }], "Assistant")).rejects.toThrow(/n'est plus disponible/);
    await flush();
    expect(alerts.list[0]).toMatchObject({ title: "Gemini : modèle IA indisponible" });
    expect(alerts.list[0].body).toContain("GEMINI_MODEL");
  });

  it("crédits prépayés épuisés (402, 07/10/2026) : pas de nouvel essai, message clair, propriétaire prévenu une fois par jour", async () => {
    // Réponse annoncée par Google le 18/09/2026 (402 au lieu de 429) :
    // https://discuss.ai.google.dev/t/api-update-depleted-prepay-credits-now-return-http-402-instead-of-429/183654
    const net = installNetwork([{ method: "POST", url: GEMINI, status: 402, fixture: "gemini/error-prepay-depleted" }]);
    const err = await chatComplete([{ role: "user", text: "…" }], "Assistant").catch((e) => e);
    expect(err).not.toBeInstanceOf(GeminiQuotaError);
    expect((err as Error).message).toMatch(/^Les fonctions IA de Nebula sont momentanément indisponibles/);
    expect((err as Error).message).not.toMatch(/prepayment/i);
    expect(net.sent).toHaveLength(1);
    await flush();
    await flush();
    expect(alerts.list[0]).toMatchObject({ title: "Gemini : crédits épuisés, l'IA de Nebula est en pause" });
    expect(alerts.list[0].dedupeKey).toMatch(/^gemini-credits:\d{4}-\d{2}-\d{2}$/);
  });

  it("ancienne réponse (429 RESOURCE_EXHAUSTED « prepayment credits are depleted ») : traitée comme des crédits épuisés, pas comme un quota", async () => {
    const net = installNetwork([{ method: "POST", url: GEMINI, status: 429, body: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing." } } }]);
    const err = await chatComplete([{ role: "user", text: "…" }], "Assistant").catch((e) => e);
    expect(err).not.toBeInstanceOf(GeminiQuotaError);
    expect((err as Error).message).toMatch(/momentanément indisponibles/);
    expect(net.sent).toHaveLength(1);
  });

  it("clé refusée : propriétaire prévenu, aucune clé dans le message", async () => {
    installNetwork([{ method: "POST", url: GEMINI, status: 400, fixture: "gemini/error-key-invalid" }]);
    const err = await chatComplete([{ role: "user", text: "…" }], "Assistant").catch((e) => e);
    expect((err as Error).message).not.toContain("cle-gemini");
    await flush();
    expect(alerts.list[0]).toMatchObject({ title: "Gemini : clé d'API refusée", dedupeKey: "gemini-key" });
  });

  it("dérive : ni candidats ni explication → format inattendu, propriétaire prévenu", async () => {
    installNetwork([{ method: "POST", url: GEMINI, body: { results: [] } }]);
    await expect(chatComplete([{ role: "user", text: "…" }], "Assistant")).rejects.toThrow(/format inattendu/);
    await flush();
    expect(alerts.list[0].title).toBe("Gemini répond dans un nouveau format");
  });
});

// 07/10/2026 : en production, l'assistant répondait « Gemini met trop de
// temps à répondre » alors que la clé et les crédits étaient en place. Cette
// erreur regroupait le vrai délai dépassé ET toute coupure avant la réponse
// (y compris une clé mal collée, refusée par Node avant même l'envoi), sans
// trace dans les journaux. Désormais : clé nettoyée, une relance, message
// juste, cause journalisée, et un test de connexion dans /admin/ia.
describe("Gemini : pannes réseau et diagnostic (07/10/2026)", () => {
  const MODEL = /^generativelanguage\.googleapis\.com\/v1beta\/models\/[^/:]+$/;
  const modelInfo = { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", inputTokenLimit: 1048576, outputTokenLimit: 65536 };

  it("clé collée avec un retour à la ligne, des guillemets ou un caractère invisible : nettoyée avant l'envoi", async () => {
    expect(cleanApiKey(" cle-gemini\n")).toEqual({ key: "cle-gemini", issues: ["retour à la ligne", "espace au début ou à la fin"] });
    expect(cleanApiKey('"cle-gemini"').key).toBe("cle-gemini");
    expect(cleanApiKey("cle-\u200bgemini\u00a0").issues).toEqual(["caractère invisible (espace insécable ou de largeur nulle)"]);
    expect(cleanApiKey("cle-gemini")).toEqual({ key: "cle-gemini", issues: [] });
    // Sans nettoyage, Node refuse l'en-tête AVANT l'envoi (« Cannot convert
    // argument to a ByteString ») : c'était « met trop de temps à répondre ».
    process.env.GEMINI_API_KEY = "cle-\u200bgemini\n";
    const net = installNetwork([{ method: "POST", url: GEMINI, fixture: "gemini/text" }]);
    expect(await chatComplete([{ role: "user", text: "Bonjour" }], "Assistant")).toMatch(/Nouveau menu/);
    expect(net.sent[0].headers["x-goog-api-key"]).toBe("cle-gemini");
  });

  it("504 de Google puis réponse : une relance, et la cause est dans les journaux (sans la clé)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const net = installNetwork([
      { method: "POST", url: GEMINI, times: 1, status: 504, body: { error: { code: 504, status: "DEADLINE_EXCEEDED", message: "Deadline expired before operation could complete." } } },
      { method: "POST", url: GEMINI, fixture: "gemini/text" }
    ]);
    const pending = chatComplete([{ role: "user", text: "…" }], "Assistant");
    await vi.runAllTimersAsync();
    expect(await pending).toMatch(/Nouveau menu/);
    expect(net.sent).toHaveLength(2);
    const line = logs.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith("[gemini]"));
    expect(line).toContain("HTTP 504");
    expect(line).toContain("DEADLINE_EXCEEDED");
    expect(line).not.toContain("cle-gemini");
    logs.mockRestore();
  });

  it("connexion coupée deux fois : message « connexion coupée », pas « trop de temps »", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = chatComplete([{ role: "user", text: "…" }], "Assistant").catch((e) => e);
    await vi.runAllTimersAsync();
    const err = (await pending) as Error;
    expect(err.message).toMatch(/connexion au service IA de Google \(Gemini\) a été coupée/);
    expect(err.message).not.toMatch(/trop de temps/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    logs.mockRestore();
  });

  it("vrai délai dépassé deux fois : « met trop de temps à répondre »", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = chatComplete([{ role: "user", text: "…" }], "Assistant").catch((e) => e);
    await vi.runAllTimersAsync();
    expect(((await pending) as Error).message).toMatch(/met trop de temps à répondre/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    logs.mockRestore();
  });

  it("diagnostic : tout va bien → deux étapes OK, 4 derniers caractères de la clé seulement", async () => {
    const net = installNetwork([
      { method: "GET", url: MODEL, body: modelInfo },
      { method: "POST", url: GEMINI, fixture: "gemini/text" }
    ]);
    const d = await diagnoseGemini();
    expect(d).toMatchObject({ ok: true, keyPresent: true, keyEnd: "mini", keyIssues: [], model: "gemini-3.8-flash" });
    expect(d.steps.map((x) => x.ok)).toEqual([true, true]);
    expect(d.steps[0].detail).toContain("Gemini 3.8 Flash");
    expect(d.verdict).toMatch(/répond normalement/);
    expect(JSON.stringify(d)).not.toContain("cle-gemini");
    expect(net.sent[0].headers["x-goog-api-key"]).toBe("cle-gemini");
    const body = net.sent[1].json as { generationConfig: { maxOutputTokens: number; thinkingConfig: { thinkingLevel: string } } };
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe("low");
  });

  it("diagnostic : clé refusée dès la lecture du modèle → une seule étape, verdict sur la clé", async () => {
    const net = installNetwork([{ method: "GET", url: MODEL, status: 400, fixture: "gemini/error-key-invalid" }]);
    const d = await diagnoseGemini();
    expect(d.ok).toBe(false);
    expect(d.steps).toHaveLength(1);
    expect(d.steps[0]).toMatchObject({ ok: false, httpStatus: 400 });
    expect(d.verdict).toMatch(/Google refuse la clé/);
    expect(net.sent).toHaveLength(1);
  });

  it("diagnostic : refus qui ne vient pas de Google (pare-feu, proxy) → pas accusé à tort la clé", async () => {
    installNetwork([{ method: "GET", url: MODEL, status: 403, raw: "Host not in allowlist", headers: { "content-type": "text/plain" } }]);
    const d = await diagnoseGemini();
    expect(d.verdict).toMatch(/intermédiaire/);
    expect(d.verdict).not.toMatch(/refuse la clé/);
  });

  it("diagnostic : modèle introuvable → verdict GEMINI_MODEL", async () => {
    installNetwork([{ method: "GET", url: MODEL, status: 404, fixture: "gemini/error-model-not-found" }]);
    expect((await diagnoseGemini()).verdict).toMatch(/GEMINI_MODEL/);
  });

  it("diagnostic : crédits épuisés (402) → verdict sur les crédits", async () => {
    installNetwork([
      { method: "GET", url: MODEL, body: modelInfo },
      { method: "POST", url: GEMINI, status: 402, fixture: "gemini/error-prepay-depleted" }
    ]);
    const d = await diagnoseGemini();
    expect(d.steps[1]).toMatchObject({ ok: false, httpStatus: 402 });
    expect(d.verdict).toMatch(/crédits prépayés sont épuisés/);
  });

  it("diagnostic : Google ne répond pas à temps → verdict « ne termine pas la réponse à temps »", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith(":generateContent")) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return new Response(JSON.stringify(modelInfo), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const d = await diagnoseGemini();
    expect(d.steps[1]).toMatchObject({ ok: false, httpStatus: null, googleStatus: "TIMEOUT" });
    expect(d.steps[1].detail).toMatch(/n'a pas répondu en 45 s/);
    expect(d.verdict).toMatch(/ne termine pas la réponse à temps/);
  });

  it("diagnostic : clé absente, ou collée avec un retour à la ligne (signalé)", async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await diagnoseGemini()).toMatchObject({ ok: false, keyPresent: false, steps: [] });
    process.env.GEMINI_API_KEY = "cle-gemini\n";
    installNetwork([
      { method: "GET", url: MODEL, body: modelInfo },
      { method: "POST", url: GEMINI, fixture: "gemini/text" }
    ]);
    const d = await diagnoseGemini();
    expect(d.ok).toBe(true);
    expect(d.keyIssues).toEqual(["retour à la ligne"]);
  });
});

describe("Resend", () => {
  const mail = { to: "client@exemple.fr", subject: "Bonjour", html: "<p>Bonjour</p>" };

  it("envoi : identifiant renvoyé ; clé d'idempotence envoyée pour les envois automatiques", async () => {
    const net = installNetwork([{ method: "POST", url: "api.resend.com/emails", fixture: "resend/sent" }]);
    const key = emailIdempotencyKey("lifecycle", "Client@Exemple.fr ", "welcome");
    expect(await sendEmail({ ...mail, idempotencyKey: key })).toEqual({ ok: true });
    expect(net.sent[0].headers["idempotency-key"]).toBe(key);
    // Le destinataire n'apparaît pas en clair, et la casse n'y change rien.
    expect(key).not.toContain("exemple");
    expect(key).toBe(emailIdempotencyKey("lifecycle", "client@exemple.fr", "welcome"));
  });

  it("même clé déjà utilisée (contenu différent) : l'e-mail est déjà parti → succès, pas de doublon", async () => {
    installNetwork([{ method: "POST", url: "api.resend.com/emails", status: 409, fixture: "resend/error-idempotent-different" }]);
    expect(await sendEmail({ ...mail, idempotencyKey: "k" })).toEqual({ ok: true });
  });

  it("domaine non vérifié, clé refusée ou quota du jour : propriétaire prévenu (tous les e-mails bloqués)", async () => {
    for (const [name, status] of [
      ["resend/error-validation-domain", 403],
      ["resend/error-invalid-key", 403],
      ["resend/error-daily-quota", 429]
    ] as const) {
      vi.unstubAllGlobals();
      installNetwork([{ method: "POST", url: "api.resend.com/emails", status, fixture: name }]);
      const res = await sendEmail(mail);
      expect(res.ok).toBe(false);
    }
    await flush();
    expect(alerts.list.map((a) => a.dedupeKey)).toEqual(["resend:validation_error", "resend:invalid_api_key", "resend:daily_quota_exceeded"]);
    expect(alerts.list[0].body).toMatch(/réinitialisations de mot de passe/);
  });

  it("limite par seconde ou adresse invalide : pas d'alerte ; limite = à réessayer", async () => {
    installNetwork([{ method: "POST", url: "api.resend.com/emails", status: 429, fixture: "resend/error-rate-limit" }]);
    expect(await sendEmail(mail)).toMatchObject({ ok: false, retryable: true });
    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: "api.resend.com/emails", status: 422, fixture: "resend/error-invalid-recipient" }]);
    expect(await sendEmail(mail)).toMatchObject({ ok: false, retryable: false });
    await flush();
    expect(alerts.list).toEqual([]);
  });

  it("pas de réponse : « peut-être parti », à réessayer avec la même clé", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(Object.assign(new Error("délai"), { name: "TimeoutError" }))));
    expect(await sendEmail({ ...mail, idempotencyKey: "k" })).toMatchObject({ ok: false, retryable: true, error: expect.stringMatching(/peut-être parti/) });
  });
});

describe("Cloudflare Turnstile", () => {
  it("jeton valide / invalide", async () => {
    installNetwork([{ method: "POST", url: "challenges.cloudflare.com/turnstile/v0/siteverify", fixture: "turnstile/success" }]);
    expect(await verifyTurnstileToken("jeton")).toBe(true);
    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: "challenges.cloudflare.com/turnstile/v0/siteverify", fixture: "turnstile/invalid-token" }]);
    expect(await verifyTurnstileToken("jeton")).toBe(false);
    await flush();
    expect(alerts.list).toEqual([]);
  });

  it("clé secrète refusée : inscriptions bloquées → propriétaire prévenu", async () => {
    installNetwork([{ method: "POST", url: "challenges.cloudflare.com/turnstile/v0/siteverify", fixture: "turnstile/invalid-secret" }]);
    expect(await verifyTurnstileToken("jeton")).toBe(false);
    await flush();
    expect(alerts.list[0]).toMatchObject({ dedupeKey: "turnstile-config" });
  });

  it("Cloudflare muet : refus prudent, avec un délai garanti (plus d'inscription bloquée sans fin)", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      })
    );
    expect(await verifyTurnstileToken("jeton")).toBe(false);
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe("Stripe et Linktree", () => {
  it("client Stripe : 20 s par appel (au lieu de 80), 2 nouvelles tentatives", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_exemple";
    const client = stripe() as unknown as { getApiField(name: string): unknown };
    expect(client.getApiField("timeout")).toBe(20_000);
    expect(client.getApiField("maxNetworkRetries")).toBe(2);
  });

  it("page Linktree : liens lus dans le bloc de données ; sans lui, méthode de secours signalée", () => {
    const dir = path.join(__dirname, "fixtures/linktree");
    const withData = extractLinktreeLinksDetailed(readFileSync(path.join(dir, "page.html"), "utf8"));
    expect(withData.structured).toBe(true);
    expect(withData.links).toEqual([
      { label: "Réserver une table", url: "https://reservation.exemple.fr/cafe" },
      { label: "Menu d'automne", url: "https://cafe.exemple.fr/menu" }
    ]);
    const fallback = extractLinktreeLinksDetailed(readFileSync(path.join(dir, "page-sans-donnees.html"), "utf8"));
    expect(fallback.structured).toBe(false);
    expect(fallback.links.map((l) => l.label)).toEqual(["Réserver une table", "Menu d'automne"]);
  });
});
