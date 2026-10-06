import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Revue de l'app Canva (06/10/2026), sur une vraie base : une fois Canva
// relié, Nebula montre le compte utilisé (nom du profil Canva) — dans la
// liste des sources et avec les designs ; une connexion faite sans nom le
// récupère une seule fois.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET as getDesigns } from "@/app/api/integrations/canva/designs/route";
import { GET as getSources } from "@/app/api/media/sources/route";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const fixture = (name: string) => readFileSync(`tests/contracts/fixtures/canva/${name}.json`, "utf8");
const calls: string[] = [];

describe.skipIf(!hasDatabase)("Canva : compte connecté affiché", () => {
  beforeEach(async () => {
    await resetDatabase();
    calls.length = 0;
    process.env.CANVA_CLIENT_ID = "canva-id";
    process.env.CANVA_CLIENT_SECRET = "canva-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        calls.push(new URL(url).pathname);
        if (url.includes("/users/me/profile")) return new Response(fixture("profile"), { status: 200, headers: { "content-type": "application/json" } });
        if (url.includes("/designs")) return new Response(fixture("designs"), { status: 200, headers: { "content-type": "application/json" } });
        return new Response("{}", { status: 404 });
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CANVA_CLIENT_ID;
    delete process.env.CANVA_CLIENT_SECRET;
  });

  it("liste des designs : le nom du compte, récupéré une fois puis gardé ; liste des sources : le même nom", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    await prisma.integrationAccount.create({ data: { userId: user.id, provider: "canva", accessToken: "tok", displayName: null } });

    const first = await getDesigns(new NextRequest("http://localhost/api/integrations/canva/designs"));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.account).toEqual({ name: "Lucas" });
    expect(body.designs.length).toBeGreaterThan(0);
    expect((await prisma.integrationAccount.findFirstOrThrow({ where: { userId: user.id } })).displayName).toBe("Lucas");
    expect(calls.filter((p) => p.endsWith("/users/me/profile"))).toHaveLength(1);

    // Déjà connu : plus d'appel au profil.
    const again = await (await getDesigns(new NextRequest("http://localhost/api/integrations/canva/designs"))).json();
    expect(again.account).toEqual({ name: "Lucas" });
    expect(calls.filter((p) => p.endsWith("/users/me/profile"))).toHaveLength(1);

    const sources = await (await getSources()).json();
    expect(sources.canva).toEqual({ connected: true, accountName: "Lucas" });
  });

  it("pas relié : la liste des sources le dit, sans nom", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    const sources = await (await getSources()).json();
    expect(sources.canva).toEqual({ connected: false, accountName: null });
  });
});
