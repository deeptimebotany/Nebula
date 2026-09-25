import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, NO_RESPONSE_CODES, parseRetryAfter, SocialApiError } from "@/lib/social/base";
import { classifyProviderError, MAX_AUTO_RETRIES, retryDelayMs } from "@/lib/social/errors";
import { errorAdvice } from "@/lib/social/error-advice";

// Classement des erreurs des réseaux (lot 5, résilience des API).
const err = (network: string, status: number | undefined, raw?: unknown, code?: string, message = "erreur") =>
  new SocialApiError(network as "INSTAGRAM", message, status, raw, code);
const cat = (e: unknown) => classifyProviderError(e).category;

describe("classement par réseau", () => {
  it("Meta : codes et sous-codes", () => {
    expect(cat(err("INSTAGRAM", 400, {}, "190/463"))).toBe("AUTH_EXPIRED");
    expect(cat(err("FACEBOOK", 403, {}, "200"))).toBe("PERMISSION_MISSING");
    expect(cat(err("INSTAGRAM", 400, {}, "4"))).toBe("RATE_LIMITED");
    expect(cat(err("INSTAGRAM", 400, {}, "80002"))).toBe("RATE_LIMITED");
    expect(cat(err("INSTAGRAM", 400, {}, "9/2207042"))).toBe("QUOTA_EXHAUSTED");
    expect(cat(err("INSTAGRAM", 400, {}, "100/2207026"))).toBe("INVALID_MEDIA");
    expect(cat(err("THREADS", 400, {}, "2635"))).toBe("VERSION_SUNSET");
    expect(cat(err("FACEBOOK", 500, {}, "2"))).toBe("TRANSIENT");
    expect(cat(err("INSTAGRAM", 400, { error: { is_transient: true } }, "100"))).toBe("TRANSIENT");
    // Code inconnu : on retombe sur le statut HTTP.
    expect(cat(err("INSTAGRAM", 400, {}, "100"))).toBe("INVALID_REQUEST");
  });

  it("TikTok, YouTube, Bluesky, LinkedIn", () => {
    expect(cat(err("TIKTOK", 401, {}, "access_token_invalid"))).toBe("AUTH_EXPIRED");
    expect(cat(err("TIKTOK", 429, {}, "rate_limit_exceeded"))).toBe("RATE_LIMITED");
    expect(cat(err("TIKTOK", 403, {}, "spam_risk_too_many_posts"))).toBe("QUOTA_EXHAUSTED");
    expect(cat(err("TIKTOK", 400, {}, "duration_check_failed"))).toBe("INVALID_MEDIA");
    expect(cat(err("TIKTOK", 400, { error: "invalid_grant" }))).toBe("AUTH_EXPIRED");
    expect(cat(err("YOUTUBE", 403, { error: { errors: [{ reason: "quotaExceeded" }] } }, "403"))).toBe("QUOTA_EXHAUSTED");
    expect(cat(err("YOUTUBE", 403, { error: { errors: [{ reason: "userRateLimitExceeded" }] } }, "403"))).toBe("RATE_LIMITED");
    expect(cat(err("YOUTUBE", 400, { error: "invalid_grant" }))).toBe("AUTH_EXPIRED");
    expect(cat(err("BLUESKY", 400, { error: "ExpiredToken" }))).toBe("AUTH_EXPIRED");
    expect(cat(err("BLUESKY", 413, { error: "BlobTooLarge" }))).toBe("INVALID_MEDIA");
    expect(cat(err("LINKEDIN", 426))).toBe("VERSION_SUNSET");
  });

  it("codes HTTP génériques et erreurs sans réponse", () => {
    expect(cat(err("PINTEREST", 401))).toBe("AUTH_EXPIRED");
    expect(cat(err("PINTEREST", 429))).toBe("RATE_LIMITED");
    expect(cat(err("PINTEREST", 502))).toBe("TRANSIENT");
    expect(cat(err("PINTEREST", 504))).toBe("TIMEOUT");
    expect(cat(err("PINTEREST", 504, undefined, NO_RESPONSE_CODES.TIMEOUT))).toBe("TIMEOUT");
    expect(cat(err("PINTEREST", 503, undefined, NO_RESPONSE_CODES.CONNECTION_LOST))).toBe("TIMEOUT");
    expect(cat(err("PINTEREST", 503, undefined, NO_RESPONSE_CODES.UNREACHABLE))).toBe("TRANSIENT");
    expect(cat(err("PINTEREST", 400, undefined, undefined, "Format de vidéo refusé"))).toBe("INVALID_MEDIA");
    // Erreur de contenu levée par Nebula avant tout appel.
    expect(cat(err("LINKEDIN", undefined, undefined, undefined, "Texte trop long pour LinkedIn"))).toBe("INVALID_REQUEST");
    expect(cat(new Error("bug"))).toBe("UNKNOWN");
  });
});

describe("décisions tirées de la catégorie", () => {
  it("relance automatique seulement quand rien n'a pu être publié", () => {
    expect(classifyProviderError(err("TIKTOK", 429)).autoRetry).toBe(true);
    expect(classifyProviderError(err("TIKTOK", 502)).autoRetry).toBe(true);
    // Délai dépassé ou connexion coupée : peut-être publié → jamais renvoyé seul.
    expect(classifyProviderError(err("TIKTOK", 504, undefined, NO_RESPONSE_CODES.TIMEOUT)).autoRetry).toBe(false);
    expect(classifyProviderError(err("TIKTOK", 503, undefined, NO_RESPONSE_CODES.CONNECTION_LOST)).autoRetry).toBe(false);
    expect(classifyProviderError(err("YOUTUBE", 403, { error: { errors: [{ reason: "quotaExceeded" }] } })).autoRetry).toBe(false);
    expect(classifyProviderError(err("INSTAGRAM", 400, {}, "190")).autoRetry).toBe(false);
  });

  it("reconnexion, panne et délai demandé par le réseau", () => {
    const auth = classifyProviderError(err("INSTAGRAM", 400, {}, "190"));
    expect(auth.needsReconnect).toBe(true);
    expect(auth.outage).toBe(false);
    const limited = err("TIKTOK", 429);
    limited.retryAfterMs = 120_000;
    expect(classifyProviderError(limited)).toMatchObject({ outage: true, retryAfterMs: 120_000 });
  });

  it("délais de relance : 2, 10 puis 30 min à ±20 %, ou le délai du réseau", () => {
    expect(retryDelayMs(1, undefined, () => 0.5)).toBe(2 * 60_000);
    expect(retryDelayMs(2, undefined, () => 0)).toBe(8 * 60_000);
    expect(retryDelayMs(3, undefined, () => 1)).toBe(36 * 60_000);
    expect(retryDelayMs(9, undefined, () => 0.5)).toBe(30 * 60_000);
    expect(retryDelayMs(1, 5_000)).toBe(30_000); // au moins 30 s
    expect(retryDelayMs(1, 5 * 3_600_000)).toBe(3_600_000); // au plus 1 h
    expect(MAX_AUTO_RETRIES).toBe(3);
  });

  it("conseils affichés à l'utilisateur", () => {
    expect(errorAdvice("AUTH_EXPIRED", "TikTok")).toMatch(/reconnectez/);
    expect(errorAdvice("TIMEOUT", "TikTok")).toMatch(/déjà en ligne/);
    expect(errorAdvice("INTERRUPTED", "TikTok")).toMatch(/déjà en ligne/);
    expect(errorAdvice(null, "TikTok")).toBeNull();
  });

  it("lit Retry-After en secondes ou en date", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
    const now = Date.parse("2026-09-25T10:00:00Z");
    expect(parseRetryAfter("Fri, 25 Sep 2026 10:01:00 GMT", now)).toBe(60_000);
    expect(parseRetryAfter("n'importe quoi")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("fetchJson : lectures réessayées, écritures jamais", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  it("GET : panne passagère puis succès", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(503, { error: { message: "busy" } })).mockResolvedValueOnce(reply(200, { ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchJson("TIKTOK", "https://x.test/a")).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("GET : limite de débit avec Retry-After trop long → pas d'attente, erreur classée", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(429, { error: { message: "slow down" } }, { "retry-after": "120" }));
    vi.stubGlobal("fetch", fetchMock);
    const e = (await fetchJson("TIKTOK", "https://x.test/a").catch((x) => x)) as SocialApiError;
    expect(e).toBeInstanceOf(SocialApiError);
    expect(e.retryAfterMs).toBe(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cat(e)).toBe("RATE_LIMITED");
  });

  it("POST : jamais renvoyé automatiquement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(503, { error: { message: "busy" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchJson("TIKTOK", "https://x.test/a", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(SocialApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("connexion impossible avant l'envoi : marquée « rien n'a été envoyé »", async () => {
    const boom = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(boom));
    const e = (await fetchJson("TIKTOK", "https://x.test/a", { method: "POST" }).catch((x) => x)) as SocialApiError;
    expect(e.code).toBe(NO_RESPONSE_CODES.UNREACHABLE);
    expect(classifyProviderError(e).autoRetry).toBe(true);
  });
});
