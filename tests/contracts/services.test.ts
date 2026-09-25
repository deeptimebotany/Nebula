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
      create: vi.fn(async (args: { data: { title: string; body: string; dedupeKey: string | null } }) => {
        alerts.list.push(args.data);
        return args.data;
      }),
      update: vi.fn(async () => ({}))
    }
  }
}));

import { GeminiQuotaError, chatComplete, generateThumbnail } from "@/lib/ai/gemini";
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
