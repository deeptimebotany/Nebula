import { beforeEach, describe, expect, it, vi } from "vitest";

// Générateur de publications (30/09/2026 : légendes, titres et miniatures
// réunis dans /outils/publier) : « Programmer avec Nebula » met de côté la
// publication COMPLÈTE — titre, texte et image — que le Composer reprend
// après l'inscription. Sur une vraie base.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { POST as postDraft } from "@/app/api/public/drafts/route";
import { GET as getDraft } from "@/app/api/public/drafts/[id]/route";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

function req(url: string, body?: unknown, method = "POST") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" }
  });
}

describe.skipIf(!hasDatabase)("générateur de publications : « Programmer avec Nebula »", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("titre, texte et image arrivent ensemble dans le Composer", async () => {
    const imageBase64 = "A".repeat(400);
    const res = await postDraft(
      req("/api/public/drafts", { kind: "POST", tool: "publier", network: "YOUTUBE", content: { title: "Mon titre", caption: "Ma légende #lyon", imageBase64, imageMimeType: "image/jpeg" } })
    );
    expect(res.status).toBe(200);
    const { id, next } = (await res.json()) as { id: string; next: string };
    expect(next).toBe(`/composer?draft=${id}`);

    // Lecture réservée à un compte connecté.
    expect((await getDraft(req(`/api/public/drafts/${id}`, undefined, "GET"), { params: { id } })).status).toBe(401);
    const { user } = await makeBrand();
    session.userId = user.id;
    const got = await getDraft(req(`/api/public/drafts/${id}`, undefined, "GET"), { params: { id } });
    expect(await got.json()).toMatchObject({ kind: "POST", network: "YOUTUBE", content: { title: "Mon titre", caption: "Ma légende #lyon", imageBase64, imageMimeType: "image/jpeg" } });
  });

  it("les anciens types (légende seule, miniature seule) restent acceptés ; un type inconnu ou un brouillon vide non", async () => {
    expect((await postDraft(req("/api/public/drafts", { kind: "CAPTION", tool: "legendes", content: { caption: "Texte" } }))).status).toBe(200);
    expect((await postDraft(req("/api/public/drafts", { kind: "THUMBNAIL", tool: "miniatures", content: { imageBase64: "B".repeat(200), imageMimeType: "image/png" } }))).status).toBe(200);
    expect((await postDraft(req("/api/public/drafts", { kind: "AUTRE", content: { caption: "Texte" } }))).status).toBe(400);
    expect((await postDraft(req("/api/public/drafts", { kind: "POST", tool: "publier", content: {} }))).status).toBe(400);
  });
});
