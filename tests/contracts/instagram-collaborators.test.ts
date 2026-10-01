// Collaborateurs Instagram (01/10/2026) : noms nettoyés, 3 au plus, envoyés
// à l'API Graph dans `collaborators` (liste JSON) ; si Instagram refuse un
// compte, la publication part sans collaborateur.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { socialConnection: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) } } }));

import type { ConnectionLike, PublishInput } from "@/lib/social/base";
import { instagramClient } from "@/lib/social/meta";
import { API_VERSIONS } from "@/lib/social/versions";
import { normalizeInstagramUsername, parseInstagramCollaborators } from "@/lib/social/instagram-collaborators";
import { installNetwork } from "./harness";

const G = `graph.facebook.com/${API_VERSIONS.META_GRAPH.version}`;
const ig = (): ConnectionLike => ({ id: "c-ig", externalAccountId: "17841400000000001", accessToken: "TOKEN-IG", refreshToken: null, tokenExpiresAt: null, scopes: "" });
const photo = (over: Partial<PublishInput> = {}): PublishInput => ({
  caption: "Collab !",
  mediaUrls: ["https://cdn.nebula.test/menu.jpg"],
  mediaType: "IMAGE",
  waitUntil: Date.now() + 5_000,
  ...over
});
const finish = [
  { url: `${G}/17889455560051444`, fixture: "meta/ig-container-finished" },
  { method: "POST", url: `${G}/17841400000000001/media_publish`, fixture: "meta/ig-media-publish" },
  { url: `${G}/17920238422030506`, fixture: "meta/ig-media-permalink" }
];

beforeEach(() => {
  process.env.META_APP_ID = "app-id";
  process.env.META_APP_SECRET = "app-secret";
  process.env.META_REDIRECT_URI = "https://nebulahub.space/api/connections/meta/callback";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("noms des collaborateurs", () => {
  it("@, majuscules, lien instagram.com → nom propre ; invalides refusés", () => {
    expect(normalizeInstagramUsername(" @Cafe.Nova ")).toBe("cafe.nova");
    expect(normalizeInstagramUsername("https://www.instagram.com/studio_nova/?hl=fr")).toBe("studio_nova");
    for (const bad of ["", "@", "nom avec espace", "a".repeat(31), ".commence", "finit.", "deux..points", "émoji😀"]) {
      expect(normalizeInstagramUsername(bad), bad).toBeNull();
    }
  });

  it("3 au plus, sans doublon ni le compte qui publie, valeurs inconnues ignorées", () => {
    expect(parseInstagramCollaborators(["@A", "a", "b", "moi", "c", "d", 42], "@Moi")).toEqual(["a", "b", "c"]);
    expect(parseInstagramCollaborators("a,b")).toEqual([]);
    expect(parseInstagramCollaborators(undefined)).toEqual([]);
  });
});

describe("publication Instagram avec collaborateurs", () => {
  it("envoie la liste JSON dans le conteneur", async () => {
    const net = installNetwork([{ method: "POST", url: `${G}/17841400000000001/media`, fixture: "meta/ig-container-created" }, ...finish]);
    await instagramClient.publishPost(ig(), photo({ instagram: { collaborators: ["cafe.nova", "studio_nova"] } }));
    const [create] = net.to(/\/media$/, "POST");
    expect(create.form?.get("collaborators")).toBe('["cafe.nova","studio_nova"]');
    expect(net.unmatched).toEqual([]);
  });

  it("sans collaborateur : aucun paramètre envoyé", async () => {
    const net = installNetwork([{ method: "POST", url: `${G}/17841400000000001/media`, fixture: "meta/ig-container-created" }, ...finish]);
    await instagramClient.publishPost(ig(), photo());
    expect(net.to(/\/media$/, "POST")[0].form?.has("collaborators")).toBe(false);
  });

  it("collaborateur refusé par Instagram : nouvel essai sans lui (le lieu reste), la publication part", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const net = installNetwork([
      {
        method: "POST",
        url: `${G}/17841400000000001/media`,
        status: 400,
        times: 1,
        body: { error: { message: "Invalid collaborator username", type: "OAuthException", code: 100, error_subcode: 2207051 } }
      },
      { method: "POST", url: `${G}/17841400000000001/media`, fixture: "meta/ig-container-created" },
      ...finish
    ]);
    const out = await instagramClient.publishPost(ig(), photo({ instagram: { collaborators: ["compte.prive"] }, location: { id: "123456", name: "Paris" } }));
    expect(out).toMatchObject({ externalPostId: "17920238422030506" });
    const creates = net.to(/\/media$/, "POST");
    expect(creates).toHaveLength(2);
    expect(creates[0].form?.get("collaborators")).toBe('["compte.prive"]');
    expect(creates[1].form?.has("collaborators")).toBe(false);
    expect(creates[1].form?.get("location_id")).toBe("123456");
  });
});
