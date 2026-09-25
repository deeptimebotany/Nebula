import { beforeEach, describe, expect, it, vi } from "vitest";

// Audit de présence (produit n°8), sur une vraie base : parcours complet de
// la route publique (Turnstile non configuré = accepté), quota de 3 audits
// par jour et par IP, rapport resservi pendant 24 h, e-mail facultatif,
// conseils de l'IA écrits une seule fois (2 essais au plus), suppression par
// le lien, purge à 30 jours. Les sources sont simulées (aucun réseau).
const calls = vi.hoisted(() => ({ youtube: 0, website: 0, websiteFails: false, emails: [] as string[], leads: [] as string[] }));

vi.mock("@/lib/audit/sources/youtube", () => ({
  auditYoutube: vi.fn(async () => {
    calls.youtube++;
    const day = 86_400_000;
    return {
      status: "ok",
      facts: {
        id: "UCx",
        title: "Café Nebula",
        handle: "@cafenebula",
        url: "https://www.youtube.com/@cafenebula",
        description: "Recettes de café maison, une vidéo chaque mardi. https://cafe-nebula.fr",
        avatarUrl: null,
        bannerUrl: null,
        keywords: "",
        country: "FR",
        createdAt: null,
        subscribers: 8_000,
        views: 100_000,
        videoCount: 50,
        videos: [3, 10, 17, 24, 31].map((d, i) => ({
          id: `v${i}`,
          title: `Vidéo ${i}`,
          descriptionLength: 120,
          tagsCount: 0,
          publishedAt: new Date(Date.now() - d * day).toISOString(),
          durationSec: 300,
          views: 900,
          likes: 40,
          comments: 3,
          thumbnailUrl: "https://i.ytimg.com/x"
        }))
      }
    };
  })
}));
vi.mock("@/lib/audit/sources/instagram", () => ({ auditInstagram: vi.fn(async () => ({ status: "private", message: "compte personnel" })) }));
vi.mock("@/lib/audit/sources/tiktok", () => ({ auditTiktok: vi.fn(async () => ({ status: "not_found", message: "introuvable" })) }));
vi.mock("@/lib/audit/sources/website", () => ({
  auditWebsite: vi.fn(async () => {
    calls.website++;
    if (calls.websiteFails) return { status: "not_found", message: "Page introuvable (erreur 404) : vérifiez l'adresse." };
    return {
      status: "ok",
      facts: {
        url: "https://cafe-nebula.fr/",
        host: "cafe-nebula.fr",
        https: true,
        responseMs: 200,
        title: "Café Nebula",
        description: null,
        ogImage: false,
        viewport: true,
        lang: "fr",
        noindex: false,
        textLength: 900,
        socialLinks: { youtube: "cafenebula" }
      }
    };
  })
}));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(async (p: { to: string }) => {
    calls.emails.push(p.to);
    return { ok: true };
  })
}));
vi.mock("@/lib/tool-leads", () => ({
  recordToolLead: vi.fn(async (p: { email: string }) => {
    calls.leads.push(p.email);
  })
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/public/audit/route";
import { DELETE } from "@/app/api/public/audit/[token]/route";
import { ensureAdvice, findAudit, publicAuditDb, purgeExpiredAudits } from "@/lib/audit/run";
import type { AuditResult } from "@/lib/audit/types";
import { hasDatabase, resetDatabase } from "./helpers";

function post(body: Record<string, unknown>, ip = "203.0.113.7") {
  return POST(
    new NextRequest("http://localhost/api/public/audit", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-forwarded-for": ip }
    })
  );
}

describe.skipIf(!hasDatabase)("audit de présence : parcours, quota, cache, conseils, suppression", () => {
  beforeEach(async () => {
    await resetDatabase();
    calls.youtube = 0;
    calls.website = 0;
    calls.emails = [];
    calls.leads = [];
    calls.websiteFails = false;
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("audit enregistré 30 jours : jeton secret, score, sources, IP en empreinte ; sources non lisibles expliquées", async () => {
    const res = await post({ youtube: "youtube.com/@cafenebula", instagram: "@compte.perso", tiktok: "@personne", website: "cafe-nebula.fr" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; cached: boolean; sources: Record<string, { status: string }> };
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(data.cached).toBe(false);
    expect(data.sources).toMatchObject({ youtube: { status: "ok" }, instagram: { status: "private" }, tiktok: { status: "not_found" }, website: { status: "ok" } });
    const row = await publicAuditDb.findUnique({ where: { token: data.token } });
    expect(row).toMatchObject({ sources: "youtube,website", adviceAttempts: 0, emailSentAt: null });
    expect(row!.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.ipHash).not.toContain("203.0.113.7");
    const days = (row!.expiresAt.getTime() - row!.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    const result = row!.result as AuditResult;
    expect(result.score.global).toBe(row!.score);
    expect(result.recommendations.some((r) => r.key === "ig-pro")).toBe(true);
    expect(await prisma.growthEvent.count({ where: { name: "audit_created" } })).toBe(1);
  });

  it("mêmes comptes dans les 24 h : même rapport, sans relire les sources ni consommer le quota", async () => {
    const first = (await (await post({ youtube: "@CafeNebula" })).json()) as { token: string };
    const again = (await (await post({ youtube: "https://www.youtube.com/@cafenebula" })).json()) as { token: string; cached: boolean };
    expect(again).toMatchObject({ token: first.token, cached: true });
    expect(calls.youtube).toBe(1);
    const usage = await prisma.publicToolUsage.findFirst({ where: { tool: "audit" } });
    expect(usage?.count).toBe(1);
  });

  it("3 audits par jour et par IP, puis 429 ; une autre IP n'est pas bloquée", async () => {
    for (const site of ["a.fr", "b.fr", "c.fr"]) expect((await post({ website: site })).status).toBe(200);
    const blocked = await post({ website: "d.fr" });
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: string }).error).toContain("3 audits par jour");
    expect((await post({ website: "d.fr" }, "198.51.100.9")).status).toBe(200);
  });

  it("rien de lisible (faute de frappe) : 422 détaillé, essai rendu au quota — 10 par jour, ensuite il compte", async () => {
    calls.websiteFails = true;
    const count = async (tool: string) => (await prisma.publicToolUsage.findFirst({ where: { tool } }))?.count ?? 0;
    const first = await post({ website: "cafe-nebula.frr" });
    expect(first.status).toBe(422);
    expect(((await first.json()) as { sources: Record<string, { status: string }> }).sources).toEqual({ website: { status: "not_found", message: expect.any(String) } });
    for (let i = 0; i < 9; i++) expect((await post({ website: `faute${i}.fr` })).status).toBe(422);
    expect(await count("audit")).toBe(0);
    expect(await count("audit-miss")).toBe(10);
    await post({ website: "encore.fr" });
    expect(await count("audit")).toBe(1);
    expect(await publicAuditDb.count()).toBe(0);
    calls.websiteFails = false;
    expect((await post({ website: "cafe-nebula.fr" })).status).toBe(200);
  });

  it("entrées invalides : 400 avec l'erreur du champ, rien d'enregistré ni de quota consommé", async () => {
    const res = await post({ youtube: "https://youtu.be/abc" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { errors: Record<string, string> }).errors.youtube).toContain("vidéo");
    expect((await post({})).status).toBe(400);
    expect((await post({ website: "a.fr", email: "pas-un-email" })).status).toBe(400);
    expect(await publicAuditDb.count()).toBe(0);
    expect(await prisma.publicToolUsage.count({ where: { tool: "audit" } })).toBe(0);
  });

  it("e-mail facultatif : lien envoyé (adresse non conservée) ; conseils seulement si la case est cochée", async () => {
    const withMail = (await (await post({ website: "cafe-nebula.fr", email: "Moi@Exemple.fr" })).json()) as { token: string };
    expect(calls.emails).toEqual(["moi@exemple.fr"]);
    expect(calls.leads).toEqual([]);
    const row = await publicAuditDb.findUnique({ where: { token: withMail.token } });
    expect(row!.emailSentAt).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain("exemple.fr");
    // Rapport en cache + e-mail : l'envoi compte comme un audit (pas d'envois illimités).
    await post({ website: "cafe-nebula.fr", email: "autre@exemple.fr", tips: true });
    expect(calls.emails).toEqual(["moi@exemple.fr", "autre@exemple.fr"]);
    expect(calls.leads).toEqual(["autre@exemple.fr"]);
    expect(calls.website).toBe(1);
    expect((await prisma.publicToolUsage.findFirst({ where: { tool: "audit" } }))?.count).toBe(2);
  });

  it("conseils de l'IA : écrits une fois et gardés ; au plus 2 essais en cas d'échec", async () => {
    process.env.GEMINI_API_KEY = "cle-test";
    try {
      const { token } = (await (await post({ youtube: "@cafenebula", website: "cafe-nebula.fr" })).json()) as { token: string };
      let calls = 0;
      const fake = async () => {
        calls++;
        return { paragraphs: ["Paragraphe de conseils."], generatedAt: new Date().toISOString() };
      };
      expect(await ensureAdvice(token, new Date(), fake)).toMatchObject({ ok: true, advice: { paragraphs: ["Paragraphe de conseils."] } });
      expect(await ensureAdvice(token, new Date(), fake)).toMatchObject({ ok: true });
      expect(calls).toBe(1);

      const other = (await (await post({ website: "autre.fr" })).json()) as { token: string };
      let fails = 0;
      const failing = async () => {
        fails++;
        return null;
      };
      for (let i = 0; i < 4; i++) expect(await ensureAdvice(other.token, new Date(), failing)).toMatchObject({ ok: false, reason: "unavailable" });
      expect(fails).toBe(2);
      expect(await ensureAdvice("jeton-inconnu-1234567890", new Date(), fake)).toMatchObject({ ok: false, status: 404 });
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("suppression par le lien, expiration à 30 jours, purge du cron", async () => {
    const { token } = (await (await post({ website: "cafe-nebula.fr" })).json()) as { token: string };
    expect((await findAudit(token)).state).toBe("found");
    expect((await findAudit(token, new Date(Date.now() + 31 * 86_400_000))).state).toBe("expired");
    expect(await purgeExpiredAudits(new Date(Date.now() + 29 * 86_400_000))).toBe(0);
    const del = await DELETE(new Request("http://localhost"), { params: { token } });
    expect(del.status).toBe(200);
    expect((await findAudit(token)).state).toBe("missing");
    expect((await DELETE(new Request("http://localhost"), { params: { token } })).status).toBe(404);

    const { token: t2 } = (await (await post({ website: "b.fr" })).json()) as { token: string };
    expect(await purgeExpiredAudits(new Date(Date.now() + 31 * 86_400_000))).toBe(1);
    expect((await findAudit(t2)).state).toBe("missing");
  });
});
