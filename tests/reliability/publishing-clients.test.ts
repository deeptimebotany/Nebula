import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pas de base de données dans ces tests : client Prisma factice.
vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) } } }));

import { fetchJson, isPendingPublish, pollUntil, SocialApiError, waitBudgetMs, type ConnectionLike, type PublishInput } from "@/lib/social/base";
import { facebookClient, instagramClient } from "@/lib/social/meta";
import { tiktokClient } from "@/lib/social/tiktok";
import { parseSignedRequest } from "@/lib/meta-callbacks";
import { createHmac } from "crypto";

type Call = { url: string; method: string; body: string };
let calls: Call[] = [];

function mockFetch(handler: (url: string, method: string, body: string) => { status?: number; json?: unknown } | Promise<never>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
      calls.push({ url, method, body });
      const out = await handler(url, method, body);
      return new Response(JSON.stringify(out.json ?? {}), { status: out.status ?? 200, headers: { "Content-Type": "application/json" } });
    })
  );
}

const conn = (over: Partial<ConnectionLike> = {}): ConnectionLike => ({
  id: "c1",
  externalAccountId: "ACC",
  accessToken: "TOKEN",
  refreshToken: null,
  tokenExpiresAt: null,
  scopes: "page_token",
  ...over
});
const input = (over: Partial<PublishInput> = {}): PublishInput => ({ caption: "Bonjour", mediaUrls: ["https://cdn.test/v.mp4"], mediaType: "VIDEO", ...over });

beforeEach(() => {
  calls = [];
  process.env.META_APP_SECRET = "meta-secret";
});
afterEach(() => vi.unstubAllGlobals());

describe("outils communs", () => {
  it("pollUntil s'arrête dès qu'une valeur arrive, ou à la fin du budget", async () => {
    let n = 0;
    expect(await pollUntil(async () => (++n === 2 ? "ok" : undefined), 1000, 1)).toBe("ok");
    expect(await pollUntil(async () => undefined, 0, 1)).toBeUndefined();
  });
  it("waitBudgetMs ne dépasse jamais 20 s ni l'heure limite", () => {
    expect(waitBudgetMs({ waitUntil: Date.now() - 5 })).toBe(0);
    expect(waitBudgetMs({ waitUntil: Date.now() + 60_000 })).toBeLessThanOrEqual(20_000);
  });
  it("un appel trop long échoue proprement (délai dépassé)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_: string, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))))
    );
    const err = await fetchJson("INSTAGRAM", "https://graph.test/x", { method: "POST", timeoutMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(SocialApiError);
    expect((err as SocialApiError).status).toBe(504);
    expect((err as Error).message).toMatch(/vérifiez sur le réseau avant de relancer/);
  });
  it("les codes d'erreur Meta sont conservés", async () => {
    mockFetch(() => ({ status: 400, json: { error: { message: "Invalid", code: 100, error_subcode: 2207026 } } }));
    const err = (await fetchJson("INSTAGRAM", "https://graph.test/x").catch((e) => e)) as SocialApiError;
    expect(err.code).toBe("100/2207026");
    expect(err.isRequestRejected).toBe(true);
  });
});

describe("Instagram : traitement de la vidéo", () => {
  it("vidéo pas encore prête : point de reprise, rien n'est publié", async () => {
    mockFetch((url, method) => {
      if (method === "POST" && url.endsWith("/ACC/media")) return { json: { id: "CONT1" } };
      if (url.includes("/CONT1")) return { json: { status_code: "IN_PROGRESS" } };
      throw new Error(`appel inattendu ${method} ${url}`);
    });
    const out = await instagramClient.publishPost(conn(), input({ waitUntil: Date.now() }));
    expect(isPendingPublish(out)).toBe(true);
    expect(isPendingPublish(out) && out.checkpoint).toEqual({ step: "ig_container", containerId: "CONT1" });
    expect(calls.some((c) => c.url.includes("media_publish"))).toBe(false);
    // Version de l'API à jour et jeton jamais dans l'adresse d'un POST.
    expect(calls[0].url).toContain("/v25.0/");
    expect(calls[0].url).not.toContain("TOKEN");
    expect(calls[0].body).toContain("appsecret_proof=");
  });

  it("reprise : publie une seule fois, avec le vrai lien de la publication", async () => {
    mockFetch((url, method) => {
      if (url.includes("/CONT1")) return { json: { status_code: "FINISHED" } };
      if (method === "POST" && url.includes("/ACC/media_publish")) return { json: { id: "MEDIA9" } };
      if (url.includes("/MEDIA9")) return { json: { permalink: "https://www.instagram.com/reel/abc/" } };
      throw new Error(`appel inattendu ${method} ${url}`);
    });
    const out = await instagramClient.resumePublish!(conn(), input(), { step: "ig_container", containerId: "CONT1" });
    expect(out).toEqual({ externalPostId: "MEDIA9", externalUrl: "https://www.instagram.com/reel/abc/" });
    expect(calls.filter((c) => c.url.includes("media_publish"))).toHaveLength(1);
  });

  it("conteneur déjà publié par un essai précédent : pas de nouvelle publication", async () => {
    mockFetch((url) => (url.includes("/CONT1") ? { json: { status_code: "PUBLISHED" } } : { status: 500 }));
    const out = await instagramClient.resumePublish!(conn(), input(), { step: "ig_container", containerId: "CONT1" });
    expect(isPendingPublish(out)).toBe(false);
    expect(calls.some((c) => c.url.includes("media_publish"))).toBe(false);
  });

  it("lieu refusé (400) : nouveau conteneur sans lieu ; erreur serveur (500) : pas de second envoi", async () => {
    let n = 0;
    mockFetch((url, method, body) => {
      if (method === "POST" && url.endsWith("/ACC/media")) {
        n++;
        return body.includes("location_id") ? { status: 400, json: { error: { message: "Invalid location" } } } : { json: { id: "C2" } };
      }
      if (url.includes("/C2")) return { json: { status_code: "IN_PROGRESS" } };
      return { status: 404 };
    });
    await instagramClient.publishPost(conn(), input({ location: { id: "LOC", name: "Paris" }, waitUntil: Date.now() }));
    expect(n).toBe(2);

    n = 0;
    calls = [];
    mockFetch(() => {
      n++;
      return { status: 500, json: { error: { message: "Oops" } } };
    });
    await expect(instagramClient.publishPost(conn(), input({ location: { id: "LOC", name: "Paris" } }))).rejects.toThrow();
    expect(n).toBe(1);
  });
});

describe("Facebook", () => {
  it("photo avec lieu : un délai dépassé ne republie jamais sans le lieu", async () => {
    let posts = 0;
    mockFetch((url, method) => {
      if (method === "POST") {
        posts++;
        return { status: 504, json: { error: { message: "timeout" } } };
      }
      return { json: {} };
    });
    await expect(facebookClient.publishPost(conn(), input({ mediaType: "IMAGE", mediaUrls: ["https://cdn.test/p.jpg"], location: { id: "L", name: "X" } }))).rejects.toThrow();
    expect(posts).toBe(1);
  });
  it("texte seul : publication dans le fil de la Page", async () => {
    mockFetch((url, method) => (method === "POST" && url.endsWith("/ACC/feed") ? { json: { id: "ACC_1" } } : { status: 404 }));
    const out = await facebookClient.publishPost(conn(), input({ mediaUrls: [], mediaType: "IMAGE" }));
    expect(out).toEqual({ externalPostId: "ACC_1", externalUrl: "https://www.facebook.com/ACC_1" });
  });
});

describe("TikTok", () => {
  it("statut pas encore final : point de reprise, puis identifiant de la vidéo", async () => {
    mockFetch((url) => {
      if (url.includes("/video/init/")) return { json: { data: { publish_id: "P1" } } };
      if (url.includes("/status/fetch/")) return { json: { data: { status: "PROCESSING_UPLOAD" } } };
      return { status: 404 };
    });
    const first = await tiktokClient.publishPost(conn({ tokenExpiresAt: new Date(Date.now() + 3_600_000) }), input({ waitUntil: Date.now() }));
    expect(isPendingPublish(first) && first.checkpoint).toEqual({ step: "tiktok_status", publishId: "P1" });

    mockFetch((url) =>
      url.includes("/status/fetch/") ? { json: { data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [7412345] } } } : { status: 404 }
    );
    const done = await tiktokClient.resumePublish!(conn({ tokenExpiresAt: new Date(Date.now() + 3_600_000) }), input(), { step: "tiktok_status", publishId: "P1" });
    expect(done).toEqual({ externalPostId: "7412345", externalUrl: "https://www.tiktok.com/video/7412345" });
  });
  it("échec annoncé par TikTok : erreur claire", async () => {
    mockFetch((url) => (url.includes("/status/fetch/") ? { json: { data: { status: "FAILED", fail_reason: "file_format_check_failed" } } } : { status: 404 }));
    await expect(
      tiktokClient.resumePublish!(conn({ tokenExpiresAt: new Date(Date.now() + 3_600_000) }), input(), { step: "tiktok_status", publishId: "P1" })
    ).rejects.toThrow(/file_format_check_failed/);
  });
});

describe("rappels Meta (signed_request)", () => {
  const sign = (payload: object, secret: string) => {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    return `${sig}.${body}`;
  };
  it("accepte une signature valide", () => {
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "42" }, "s3cret"), "s3cret")?.user_id).toBe("42");
  });
  it("refuse une signature fausse, un autre algorithme ou un contenu modifié", () => {
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "42" }, "autre"), "s3cret")).toBeNull();
    expect(parseSignedRequest(sign({ algorithm: "PLAIN", user_id: "42" }, "s3cret"), "s3cret")).toBeNull();
    const valid = sign({ algorithm: "HMAC-SHA256", user_id: "42" }, "s3cret");
    const tampered = `${valid.split(".")[0]}.${Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "666" })).toString("base64url")}`;
    expect(parseSignedRequest(tampered, "s3cret")).toBeNull();
    expect(parseSignedRequest("n'importe quoi", "s3cret")).toBeNull();
  });
});
