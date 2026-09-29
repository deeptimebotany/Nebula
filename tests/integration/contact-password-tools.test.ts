import { beforeEach, describe, expect, it, vi } from "vitest";

// Corrections du 29/09/2026, sur une vraie base : le formulaire de contact
// n'est plus perdu quand l'e-mail ne part pas ; le mot de passe se définit
// (compte Google) ou se change (compte e-mail) de façon sûre ; les outils IA
// de /outils demandent un compte et comptent un quota par compte.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// Pas d'appel à l'IA dans les tests : réponse fixe.
vi.mock("@/lib/ai/gemini", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/gemini")>()),
  isAiEnabled: () => true,
  generateFreeList: vi.fn(async () => ["Idée 1", "Idée 2", "Idée 3"]),
  pickBestFrames: vi.fn(async () => [
    { index: 4, reason: "Nette et bien cadrée.", sharpness: 5, framing: 4, clickPotential: 4 },
    { index: 99, reason: "Index inventé : doit être écarté.", sharpness: 1, framing: 1, clickPotential: 1 },
    { index: 1, reason: "Sujet reconnaissable.", sharpness: 4, framing: 3, clickPotential: 3 }
  ])
}));

import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST as postContact } from "@/app/api/contact/route";
import { POST as postPassword } from "@/app/api/settings/password/route";
import { DELETE as deleteAccount } from "@/app/api/settings/account/route";
import { POST as postGenerate } from "@/app/api/public/tools/generate/route";
import { POST as postPickFrames } from "@/app/api/public/tools/pick-frames/route";
import { GET as getAccess } from "@/app/api/public/tools/access/route";
import { OWNER_EMAIL } from "@/lib/owner";
import { TOOL_DAILY_LIMITS } from "@/lib/tools/quota";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

function req(url: string, body?: unknown, method = "POST", ip = "203.0.113.7") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip }
  });
}

describe.skipIf(!hasDatabase)("formulaire de contact", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    delete process.env.RESEND_API_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("sans envoi d'e-mail configuré : message enregistré, signalé au propriétaire, réponse OK", async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Lucas" } });
    const res = await postContact(req("/api/contact", { name: "Alex Martin", email: "alex@exemple.fr", subject: "tarifs", message: "Bonjour, je voudrais savoir si le palier Agence convient à 12 marques." }));
    expect(res.status).toBe(200);
    const saved = await prisma.contactMessage.findMany();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: "Alex Martin", email: "alex@exemple.fr", subject: "Tarifs et abonnement", emailSent: false, handledAt: null });
    const bell = await prisma.notification.findMany({ where: { userId: owner.id } });
    expect(bell).toHaveLength(1);
    expect(bell[0].href).toBe("/admin/messages");
  });

  it("formulaire incomplet : refusé, rien d'enregistré ; robot (champ piège) : rien d'enregistré", async () => {
    expect((await postContact(req("/api/contact", { name: "A", email: "x", subject: "autre", message: "court" }))).status).toBe(400);
    expect((await postContact(req("/api/contact", { name: "Robot", email: "r@exemple.fr", subject: "autre", message: "x".repeat(40), website: "spam" }))).status).toBe(200);
    expect(await prisma.contactMessage.count()).toBe(0);
  });
});

describe.skipIf(!hasDatabase)("mot de passe (Paramètres → Compte)", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("compte Google sans mot de passe : il en DÉFINIT un sans « actuel » ; sessions coupées", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    const res = await postPassword(req("/api/settings/password", { currentPassword: "", newPassword: "NouveauMotDePasse-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, firstTime: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare("NouveauMotDePasse-1", after.passwordHash!)).toBe(true);
    expect(after.sessionVersion).toBe(user.sessionVersion + 1);
  });

  it("compte e-mail : actuel obligatoire et vérifié, nouveau différent, 5 essais par quart d'heure", async () => {
    const { user } = await makeBrand();
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash("Actuel-2026!", 4) } });
    session.userId = user.id;
    expect((await postPassword(req("/api/settings/password", { newPassword: "Nouveau-2026!" }))).status).toBe(400);
    const wrong = await postPassword(req("/api/settings/password", { currentPassword: "faux", newPassword: "Nouveau-2026!" }));
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toMatch(/actuel incorrect/);
    expect((await (await postPassword(req("/api/settings/password", { currentPassword: "Actuel-2026!", newPassword: "Actuel-2026!" }))).json()).error).toMatch(/différent/);
    expect((await postPassword(req("/api/settings/password", { currentPassword: "Actuel-2026!", newPassword: "Nouveau-2026!" }))).status).toBe(200);
    expect((await postPassword(req("/api/settings/password", { currentPassword: "faux", newPassword: "Encore-2026!" }))).status).toBe(400);
    // 5 essais déjà faits : le 6e est freiné.
    expect((await postPassword(req("/api/settings/password", { currentPassword: "Nouveau-2026!", newPassword: "Encore-2026!" }))).status).toBe(429);
  });

  it("suppression d'un compte Google : confirmée par l'adresse e-mail (plus bloquée)", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    expect((await deleteAccount(req("/api/settings/account", { confirmEmail: "autre@exemple.fr" }, "DELETE"))).status).toBe(400);
    expect((await deleteAccount(req("/api/settings/account", { confirmEmail: user.email.toUpperCase() }, "DELETE"))).status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("outils IA de /outils", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("sans compte : 401 « compte requis » (la page montre la démo), aucun quota consommé", async () => {
    const res = await postGenerate(req("/api/public/tools/generate", { tool: "hashtags", niche: "pâtisserie maison" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ signupRequired: true });
    expect(await prisma.publicToolUsage.count()).toBe(0);
    expect(await (await getAccess()).json()).toEqual({ signedIn: false });
  });

  it("compte Gratuit : vraie génération, quota du jour par compte, puis 429", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    const limit = TOOL_DAILY_LIMITS.FREE.text;
    for (let i = 0; i < limit; i++) {
      const res = await postGenerate(req("/api/public/tools/generate", { tool: "titre-youtube", title: "Mon titre de vidéo" }));
      expect(res.status).toBe(200);
      expect((await res.json()).remaining).toBe(limit - i - 1);
    }
    const over = await postGenerate(req("/api/public/tools/generate", { tool: "titre-youtube", title: "Mon titre de vidéo" }));
    expect(over.status).toBe(429);
    expect(await (await getAccess()).json()).toMatchObject({ signedIn: true, plan: "FREE", quota: { text: { limit, remaining: 0 } } });
  });

  it("miniatures : choix des 3 meilleures images par l'IA — compte requis, quota « textes », index vérifiés", async () => {
    const frames = Array.from({ length: 12 }, (_, index) => ({ index, base64: "A".repeat(200), mimeType: "image/jpeg" }));
    const anon = await postPickFrames(req("/api/public/tools/pick-frames", { frames }));
    expect(anon.status).toBe(401);
    expect(await prisma.publicToolUsage.count()).toBe(0);

    const { user } = await makeBrand();
    session.userId = user.id;
    expect((await postPickFrames(req("/api/public/tools/pick-frames", { frames: frames.slice(0, 2) }))).status).toBe(400);
    expect((await postPickFrames(req("/api/public/tools/pick-frames", { frames: [{ ...frames[0], mimeType: "image/png" }, ...frames.slice(1)] }))).status).toBe(400);
    const res = await postPickFrames(req("/api/public/tools/pick-frames", { frames }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.picks.map((p: { index: number }) => p.index)).toEqual([4, 1]);
    expect(data.remaining).toBe(TOOL_DAILY_LIMITS.FREE.text - 1);
  });

  it("comptes Gratuits multiples sur la même connexion : plafond par adresse IP", async () => {
    let ok = 0;
    for (let a = 0; a < 4; a++) {
      const { user } = await makeBrand();
      session.userId = user.id;
      for (let i = 0; i < TOOL_DAILY_LIMITS.FREE.text; i++) {
        const res = await postGenerate(req("/api/public/tools/generate", { tool: "hashtags", niche: "cuisine" }, "POST", "198.51.100.9"));
        if (res.status === 200) ok++;
      }
    }
    expect(ok).toBe(30);
  });
});
