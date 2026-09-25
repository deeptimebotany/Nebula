// Garde-fous du lot 7 : les règles des contrats réseau restent vraies quand
// le code évolue (ajout d'un réseau, d'un appel…).
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  SocialApiError,
  UNEXPECTED_RESPONSE,
  checkShape,
  downloadMedia,
  fetchJson,
  parseProviderJson
} from "@/lib/social/base";
import { describeIssue, endpointLabel, idSchema, shapeOf, toDate, z } from "@/lib/social/contract";
import { errorAdvice } from "@/lib/social/error-advice";
import { classifyProviderError } from "@/lib/social/errors";
import { SOCIAL_CLIENTS } from "@/lib/social";

// Réseaux sociaux (lot 7), régies publicitaires et sources d'import (lot 8).
const PROVIDER_DIRS = ["social", "ads", "integrations"];
const sources = PROVIDER_DIRS.flatMap((dir) => {
  const full = path.join(__dirname, "../../src/lib", dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: `${dir}/${f}`, code: readFileSync(path.join(full, f), "utf8") }));
});

/** Code sans les commentaires (les explications peuvent citer fetch()). */
function codeOnly(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

afterEach(() => vi.unstubAllGlobals());

describe("règles du code réseau", () => {
  it("aucun fetch direct (réseaux, régies, imports) hors de la porte commune : délai et classement garantis", () => {
    const offenders = sources.filter(({ file, code }) => file !== "social/base.ts" && /(^|[^.\w])fetch\(/m.test(codeOnly(code))).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("aucun appel externe direct dans le code serveur (lot 9) : seuls les appels du navigateur vers l'API de Nebula (« /api/… ») utilisent fetch", () => {
    const roots = [path.join(__dirname, "../../src/lib"), path.join(__dirname, "../../src/app/api")];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    roots.forEach(walk);
    const offenders = files
      // La porte commune elle-même, et le code du navigateur (« use client »).
      .filter((f) => !f.endsWith(path.join("social", "base.ts")) && !/^\s*["']use client["']/.test(readFileSync(f, "utf8")))
      .flatMap((f) =>
        codeOnly(readFileSync(f, "utf8"))
          .split("\n")
          .filter((line) => /(^|[^.\w])fetch\(/.test(line) && !/(^|[^.\w])fetch\(\s*["`']\//.test(line))
          .map((line) => `${path.relative(path.join(__dirname, "../.."), f)}: ${line.trim()}`)
      );
    expect(offenders).toEqual([]);
  });

  it("aucune réponse « castée » sans contrat (fetchJson<Type>, graph<Type>…)", () => {
    const pattern = /\b(fetchJson|graph|graphGet|api|xrpc|tiktokApi|restJson|search|get|call|adsJson|importJson)<(?!T\b|T =|T extends)/;
    const files = [...sources, { file: "places/route.ts", code: readFileSync(path.join(__dirname, "../../src/app/api/social/places/route.ts"), "utf8") }];
    const offenders = files.flatMap(({ file, code }) =>
      codeOnly(code)
        .split("\n")
        .filter((line) => pattern.test(line))
        .map((line) => `${file}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });

  it("chaque réseau sait vérifier « déjà en ligne ? » (sauf LinkedIn : lecture des posts réservée aux partenaires)", () => {
    const missing = Object.entries(SOCIAL_CLIENTS)
      .filter(([, client]) => !client.listRecentPosts)
      .map(([network]) => network);
    expect(missing).toEqual(["LINKEDIN"]);
  });

  it("la catégorie « réponse inattendue » a un conseil pour l'utilisateur", () => {
    expect(errorAdvice("UNEXPECTED_RESPONSE", "Instagram")).toMatch(/vérifie d'abord/);
  });
});

describe("outils des contrats", () => {
  it("grands entiers gardés en texte, nombres ordinaires inchangés", () => {
    expect(parseProviderJson('{"ids":[7301234567890123456],"n":42,"x":1.5,"big":1e21}')).toEqual({ ids: ["7301234567890123456"], n: 42, x: 1.5, big: 1e21 });
  });

  it("dates : sans fuseau lue en UTC, secondes, invalide → undefined", () => {
    expect(toDate("2026-09-24T08:15:30")?.toISOString()).toBe("2026-09-24T08:15:30.000Z");
    expect(toDate("2026-09-24T08:15:30+0000")?.toISOString()).toBe("2026-09-24T08:15:30.000Z");
    expect(toDate(1790237730, "s")?.toISOString()).toBe("2026-09-24T08:15:30.000Z");
    expect(toDate("pas une date")).toBeUndefined();
    expect(toDate(undefined)).toBeUndefined();
  });

  it("forme d'une réponse : noms et types, jamais les valeurs", () => {
    const shape = JSON.stringify(shapeOf({ data: [{ id: "123", caption: "Légende privée", n: 3 }], token: "SECRET" }));
    expect(shape).toBe('{"data":[{"id":"string","caption":"string","n":"number"}],"token":"string"}');
    expect(shape).not.toContain("SECRET");
  });

  it("adresse d'un appel : sans paramètres (jeton) et sans identifiants", () => {
    expect(endpointLabel("post", "https://graph.facebook.com/v25.0/17841400000000001/media?access_token=SECRET")).toBe("POST graph.facebook.com/v25.0/{id}/media");
    expect(endpointLabel("GET", "https://api.linkedin.com/rest/videos/urn%3Ali%3Avideo%3AC5505")).toBe("GET api.linkedin.com/rest/videos/{id}");
  });

  it("écarts décrits en français", () => {
    const schema = z.object({ data: z.array(z.object({ id: idSchema, n: z.number() })) });
    const issue = (value: unknown) => describeIssue((schema.safeParse(value) as { error: z.ZodError }).error.issues[0]);
    expect(issue({})).toBe("champ « data » absent");
    expect(issue({ data: [{ n: 1 }] })).toBe("champ « data.0.id » absent");
    expect(issue({ data: [{ id: "a", n: "1" }] })).toBe("champ « data.0.n » : nombre attendu, texte reçu");
    expect(issue(undefined)).toBe("réponse vide ou non JSON");
  });

  it("écart : erreur classée « réponse inattendue », journal sans aucune valeur", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const err = (() => {
      try {
        return checkShape("INSTAGRAM", z.object({ id: idSchema }), { caption: "Légende privée" }, "POST graph.facebook.com/v25.0/{id}/media_publish", 200);
      } catch (e) {
        return e;
      }
    })() as SocialApiError;
    expect(err.code).toBe(UNEXPECTED_RESPONSE);
    expect(classifyProviderError(err)).toMatchObject({ category: "UNEXPECTED_RESPONSE", uncertain: true, outage: false, autoRetry: false, needsReconnect: false });
    expect(warn.mock.calls[0][0]).toContain('{"caption":"string"}');
    expect(warn.mock.calls[0][0]).not.toContain("Légende privée");
    warn.mockRestore();
  });

  it("réponse coupée pendant la lecture : envoi incertain (jamais « injoignable »)", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"id":'));
        controller.error(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));
      }
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const err = await fetchJson("INSTAGRAM", "https://graph.facebook.com/v25.0/1/media_publish", { method: "POST" }).catch((e) => e);
    expect(classifyProviderError(err)).toMatchObject({ category: "TIMEOUT", uncertain: true });
  });

  it("média de Nebula : introuvable → média à remplacer ; panne → relance sans risque", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("absent", { status: 404 })));
    expect(classifyProviderError(await downloadMedia("TIKTOK", "https://cdn.nebula.test/x.mp4").catch((e) => e)).category).toBe("INVALID_MEDIA");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(Object.assign(new Error("délai"), { name: "TimeoutError" }))));
    expect(classifyProviderError(await downloadMedia("TIKTOK", "https://cdn.nebula.test/x.mp4").catch((e) => e))).toMatchObject({ category: "TRANSIENT", autoRetry: true });
  });
});
