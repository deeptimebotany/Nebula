// Contrats des sources d'import de médias — lot 8.
// Réponses types d'après la documentation officielle :
//  - Unsplash : https://unsplash.com/documentation (search/photos, photos/:id)
//  - Canva : https://www.canva.dev/docs/connect/api-reference/ (oauth/token, designs, exports)
//  - OneDrive : https://learn.microsoft.com/graph/api/driveitem-list-children,
//    https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ account: null as null | Record<string, unknown>, saved: [] as unknown[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => null) },
    integrationAccount: {
      findUnique: vi.fn(async () => db.account),
      upsert: vi.fn(async (args: unknown) => {
        db.saved.push(args);
        return {};
      })
    }
  }
}));

import { exchangeCanvaCode, getCanvaExport, listCanvaDesigns, refreshCanvaToken, startCanvaExport } from "@/lib/integrations/canva";
import { freshIntegrationToken } from "@/lib/integrations/oauth-accounts";
import { listOneDrive, oneDriveItem, refreshOneDriveToken } from "@/lib/integrations/onedrive";
import { ALLOWED_HOSTS, ImportError, fetchFromAllowedHost } from "@/lib/integrations/remote-media";
import { prepareUnsplashImport, searchUnsplash } from "@/lib/integrations/unsplash";
import { fixture, installNetwork, without } from "./harness";

async function importError(p: Promise<unknown>): Promise<ImportError> {
  const err = await p.catch((e) => e);
  expect(err).toBeInstanceOf(ImportError);
  return err as ImportError;
}

beforeEach(() => {
  process.env.NEXTAUTH_URL = "https://nebulahub.space";
  process.env.UNSPLASH_ACCESS_KEY = "unsplash-key";
  process.env.CANVA_CLIENT_ID = "canva-id";
  process.env.CANVA_CLIENT_SECRET = "canva-secret";
  process.env.ONEDRIVE_CLIENT_ID = "od-id";
  process.env.ONEDRIVE_CLIENT_SECRET = "od-secret";
  db.account = null;
  db.saved = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("Unsplash", () => {
  it("recherche : vignettes d'Unsplash, crédit avec liens utm", async () => {
    const net = installNetwork([{ url: "api.unsplash.com/search/photos", fixture: "unsplash/search" }]);
    const res = await searchUnsplash("café", 1);
    expect(res.total).toBe(133);
    expect(res.photos[0]).toMatchObject({ id: "LBI7cgq3pbM", alt: "white ceramic mug on brown wooden table", author: { name: "Photographe Exemple" } });
    expect(res.photos[0].author.profileUrl).toContain("utm_medium=referral");
    expect(net.sent[0].headers.authorization).toBe("Client-ID unsplash-key");
  });

  it("import : événement de téléchargement déclenché (règle Unsplash), fichier 2 400 px", async () => {
    const net = installNetwork([
      { url: "api.unsplash.com/photos/LBI7cgq3pbM", fixture: "unsplash/photo" },
      { url: "api.unsplash.com/photos/LBI7cgq3pbM/download", fixture: "unsplash/download" }
    ]);
    const prepared = await prepareUnsplashImport("LBI7cgq3pbM");
    expect(new URL(prepared.fileUrl).searchParams.get("w")).toBe("2400");
    expect(net.to(/\/download$/)).toHaveLength(1);
  });

  it("limite horaire (403 chez Unsplash) → message « limite atteinte » ; dérive → format inattendu", async () => {
    installNetwork([{ url: "api.unsplash.com/search/photos", status: 403, raw: "Rate Limit Exceeded" }]);
    expect(await importError(searchUnsplash("café", 1))).toMatchObject({ status: 429 });
    vi.unstubAllGlobals();
    installNetwork([{ url: "api.unsplash.com/search/photos", body: without(fixture("unsplash/search"), "results.0.urls.raw") }]);
    expect((await importError(searchUnsplash("café", 1))).status).toBe(502);
  });
});

describe("Canva", () => {
  it("connexion (PKCE) puis designs et export", async () => {
    const net = installNetwork([
      { method: "POST", url: "api.canva.com/rest/v1/oauth/token", fixture: "canva/oauth-token" },
      { url: "api.canva.com/rest/v1/designs", fixture: "canva/designs" },
      { method: "POST", url: "api.canva.com/rest/v1/exports", fixture: "canva/export-started" },
      { url: "api.canva.com/rest/v1/exports/e08861ae-3b29-45db-8dc1-1fe0bf7f1cc8", times: 1, fixture: "canva/export-success" },
      { url: "api.canva.com/rest/v1/exports/e08861ae-3b29-45db-8dc1-1fe0bf7f1cc8", times: 1, fixture: "canva/export-failed" }
    ]);
    expect(await exchangeCanvaCode("CODE", "VERIFIER")).toMatchObject({ accessToken: "canva-acces-exemple", expiresIn: 14400 });
    expect(net.sent[0].form?.get("code_verifier")).toBe("VERIFIER");
    const { designs, continuation } = await listCanvaDesigns("TOKEN", {});
    expect(designs[0]).toMatchObject({ id: "DAFVztcvd9z", title: "Menu d'automne", width: 595, updatedAt: "2026-09-24T08:15:30.000Z" });
    expect(continuation).toBe("RkFGMgXlsVTDbMd");
    expect(await startCanvaExport("TOKEN", "DAFVztcvd9z", "image", false)).toBe("e08861ae-3b29-45db-8dc1-1fe0bf7f1cc8");
    expect(await getCanvaExport("TOKEN", "e08861ae-3b29-45db-8dc1-1fe0bf7f1cc8")).toEqual({ status: "success", urls: ["https://export-download.canva.com/exemple/0001.png"], error: undefined });
    expect((await getCanvaExport("TOKEN", "e08861ae-3b29-45db-8dc1-1fe0bf7f1cc8")).error).toMatch(/license/);
  });

  it("renouvellement refusé → compte à relier ; panne → simple « réessayez » (avant : « compte délié »)", async () => {
    db.account = { accessToken: "old", refreshToken: "refresh", expiresAt: new Date(Date.now() - 1000) };
    installNetwork([{ method: "POST", url: "api.canva.com/rest/v1/oauth/token", status: 400, fixture: "canva/oauth-invalid-grant" }]);
    expect((await importError(freshIntegrationToken("u1", "canva", refreshCanvaToken))).status).toBe(401);

    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: "api.canva.com/rest/v1/oauth/token", status: 503, raw: "Service Unavailable" }]);
    const outage = await importError(freshIntegrationToken("u1", "canva", refreshCanvaToken));
    expect(outage.status).toBe(503);
    expect(outage.message).toMatch(/ne répond pas/);

    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: "api.canva.com/rest/v1/oauth/token", fixture: "canva/oauth-token" }]);
    expect(await freshIntegrationToken("u1", "canva", refreshCanvaToken)).toBe("canva-acces-exemple");
    expect(db.saved).toHaveLength(1);
  });

  it("dérive : statut d'export inconnu → format inattendu", async () => {
    installNetwork([{ url: "api.canva.com/rest/v1/exports/e08861ae-3b29-45db-8dc1-1fe0bf7f1cc8", body: { job: { id: "e08861ae", status: "queued" } } }]);
    expect((await importError(getCanvaExport("TOKEN", "e08861ae-3b29-45db-8dc1-1fe0bf7f1cc8"))).status).toBe(502);
  });
});

describe("OneDrive", () => {
  it("dossier : dossiers d'abord, images et vidéos seulement, vignettes", async () => {
    installNetwork([{ url: "graph.microsoft.com/v1.0/me/drive/root/children", fixture: "onedrive/children" }]);
    const items = await listOneDrive("TOKEN", {});
    expect(items.map((i) => [i.name, i.kind])).toEqual([
      ["Photos", "folder"],
      ["coulisses.mp4", "video"],
      ["menu.jpg", "image"]
    ]);
    expect(items.find((i) => i.name === "menu.jpg")?.thumbnailUrl).toBe("https://exemple-my.sharepoint.com/thumb-m.jpg");
  });

  it("fichier ; renouvellement refusé (AADSTS) → compte à relier", async () => {
    installNetwork([{ url: /^graph\.microsoft\.com\/v1\.0\/me\/drive\/items\//, fixture: "onedrive/item" }]);
    expect(await oneDriveItem("TOKEN", "01BYE5RZ4MYJ4TQOZPGNE3NBNWM2SHBO2W")).toMatchObject({ kind: "image", mimeType: "image/jpeg", size: 204800 });
    vi.unstubAllGlobals();
    installNetwork([{ method: "POST", url: "login.microsoftonline.com/common/oauth2/v2.0/token", status: 400, fixture: "onedrive/oauth-invalid-grant" }]);
    const err = await importError(refreshOneDriveToken("old"));
    expect(err.status).toBe(401);
    expect(err.message).toContain("AADSTS70000");
    expect(err.message).not.toContain("Trace ID");
  });

  it("dérive : « value » absent → format inattendu (jamais « dossier vide »)", async () => {
    installNetwork([{ url: "graph.microsoft.com/v1.0/me/drive/root/children", body: { items: [] } }]);
    expect((await importError(listOneDrive("TOKEN", {}))).status).toBe(502);
  });
});

describe("Téléchargement depuis une plateforme", () => {
  it("redirection vers un domaine de la plateforme suivie ; en-tête d'autorisation seulement au premier serveur", async () => {
    const net = installNetwork([
      { url: "www.googleapis.com/drive/v3/files/abcdefghij", status: 302, headers: { location: "https://doc-0s-exemple.googleusercontent.com/fichier" }, raw: "" },
      { url: "doc-0s-exemple.googleusercontent.com/fichier", raw: "image", headers: { "content-type": "image/jpeg" } }
    ]);
    const res = await fetchFromAllowedHost("https://www.googleapis.com/drive/v3/files/abcdefghij", ALLOWED_HOSTS.gdrive, { headers: { Authorization: "Bearer T" } });
    expect(await res.text()).toBe("image");
    expect(net.sent[0].headers.authorization).toBe("Bearer T");
    expect(net.sent[1].headers.authorization).toBeUndefined();
  });

  it("redirection vers un autre domaine : refusée", async () => {
    installNetwork([{ url: "www.dropbox.com/s/fichier.jpg", status: 302, headers: { location: "https://pirate.exemple/vol" }, raw: "" }]);
    expect((await importError(fetchFromAllowedHost("https://www.dropbox.com/s/fichier.jpg", ALLOWED_HOSTS.dropbox))).message).toMatch(/non autorisée/);
  });

  it("fichier supprimé → message clair ; plateforme muette → délai garanti et « réessayez »", async () => {
    installNetwork([{ url: "dl.dropboxusercontent.com/s/fichier.jpg", status: 404, raw: "" }]);
    expect((await importError(fetchFromAllowedHost("https://dl.dropboxusercontent.com/s/fichier.jpg", ALLOWED_HOSTS.dropbox))).message).toMatch(/introuvable sur Dropbox/);
    vi.stubGlobal(
      "fetch",
      vi.fn((_: string, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))))
    );
    const slow = await importError(fetchFromAllowedHost("https://dl.dropboxusercontent.com/s/fichier.jpg", ALLOWED_HOSTS.dropbox, { timeoutMs: 20 }));
    expect(slow).toMatchObject({ status: 503 });
    expect(slow.message).toMatch(/Dropbox ne répond pas/);
  });
});
