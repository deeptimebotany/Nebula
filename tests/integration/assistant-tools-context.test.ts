import { beforeEach, describe, expect, it, vi } from "vitest";

// Assistant sur les pages des outils (02/10/2026), sur une vraie base : la
// clé de contexte de l'outil fait entrer dans l'instruction les mêmes
// chiffres que la page (taux d'engagement de chaque compte, créneau
// personnel, fuseau). L'appel à Gemini et la porte de l'IA sont simulés.
const session = vi.hoisted(() => ({ userId: null as string | null }));
const captured = vi.hoisted(() => ({ system: "" }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/ai/gemini", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/gemini")>()),
  isAiEnabled: () => true,
  chatComplete: vi.fn(async (_messages: unknown, system: string) => {
    captured.system = system;
    return "Réponse de test";
  })
}));
vi.mock("@/lib/ai/guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/guard")>()),
  gateAppAi: vi.fn(async () => ({ ok: true, info: { plan: "PRO" }, allowance: { run: (fn: () => Promise<unknown>) => fn(), release: async () => undefined } }))
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/ai/chat/route";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const ask = (brandId: string, contextKey: string) =>
  POST(new NextRequest("http://localhost/api/ai/chat", { method: "POST", body: JSON.stringify({ brandId, contextKey, messages: [{ role: "user", text: "Mon taux d'engagement est-il bon ?" }] }), headers: { "content-type": "application/json" } }));

describe.skipIf(!hasDatabase)("assistant : contexte des outils", () => {
  beforeEach(async () => {
    await resetDatabase();
    captured.system = "";
  });

  it("taux d'engagement : les chiffres de la page entrent dans l'instruction", async () => {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    const ig = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: "ig-1", displayName: "Studio", handle: "studio.nova", accessToken: "x" } });
    await prisma.analyticsSnapshot.create({ data: { connectionId: ig.id, network: "INSTAGRAM", followers: 12000 } });
    await prisma.postMetric.create({ data: { connectionId: ig.id, network: "INSTAGRAM", postExternalId: "p1", publishedAt: new Date(Date.now() - 86_400_000), likes: 420, comments: 35, shares: 25 } });

    const res = await ask(brand.id, "tool-engagement");
    expect(res.status).toBe(200);
    expect((await res.json()).contextKey).toBe("tool-engagement");
    expect(captured.system).toContain("Outils → Calculateur de taux d'engagement");
    expect(captured.system).toContain("- Instagram · @studio.nova : taux d'engagement 4 % par publication (1 publication des 30 derniers jours, 12000 abonnés) — excellent");
    expect(captured.system).toContain("Créneau personnel INSTAGRAM : pas encore assez de relevés (1 sur 5)");
    expect(captured.system).toContain("Fuseau de la marque : Europe/Paris");
    expect(captured.system).toMatch(/Menu latéral de Nebula, sans catégories : .*Outils \(/);
  });

  it("bio : pas de chiffres des outils (le module ne les demande pas)", async () => {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    expect((await ask(brand.id, "tool-bio")).status).toBe(200);
    expect(captured.system).toContain("Générateur de bio Instagram");
    expect(captured.system).not.toContain("Chiffres des outils");
  });
});
