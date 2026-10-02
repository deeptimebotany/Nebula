import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lien de confirmation de l'adresse (01/10/2026), sur une vraie base :
//  - une minute au moins entre deux envois, même avec deux clics simultanés ;
//  - 3 renvois par heure ;
//  - le lien renvoyé est LE MÊME tant qu'il reste valable : un ancien
//    e-mail ouvert après un renvoi confirme quand même ;
//  - chaque e-mail porte un X-Entity-Ref-ID unique (pas de regroupement Gmail) ;
//  - /status dit si l'adresse est confirmée (bandeau qui attend le clic).
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/billing/partners", () => ({ applyPendingPartnerGrant: vi.fn(async () => undefined) }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST as resend } from "@/app/api/auth/verify-email/resend/route";
import { GET as status } from "@/app/api/auth/verify-email/status/route";
import { GET as verify } from "@/app/api/auth/verify-email/route";
import { hashToken, sendVerificationEmail } from "@/lib/account-security";
import { installNetwork } from "../contracts/harness";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

function mailbox() {
  return installNetwork([{ method: "POST", url: "api.resend.com/emails", body: { id: "email-1" } }]);
}
const linkIn = (html: string) => /verify-email\?token=([A-Za-z0-9_-]+)/.exec(html)?.[1] ?? "";

async function unverifiedUser() {
  const { user } = await makeBrand();
  await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null, emailVerifySentAt: null, emailVerifyTokenHash: null, emailVerifyTokenExpiresAt: null } });
  session.userId = user.id;
  return user;
}

describe.skipIf(!hasDatabase)("renvoi du lien de confirmation", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    process.env.RESEND_API_KEY = "re_test";
    process.env.NEXTAUTH_SECRET = "secret-de-test-assez-long-pour-hkdf-0123456789";
    process.env.NEXTAUTH_URL = "https://nebulahub.space";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.RESEND_API_KEY;
  });

  it("une minute entre deux envois, même avec deux clics simultanés ; date du prochain envoi renvoyée", async () => {
    await unverifiedUser();
    const net = mailbox();
    const [a, b] = await Promise.all([resend(), resend()]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 429]);
    expect(net.sent).toHaveLength(1);
    const refused = (await (a.status === 429 ? a : b).json()) as { reason: string; nextResendAt: string; error: string };
    expect(refused.reason).toBe("cooldown");
    const wait = new Date(refused.nextResendAt).getTime() - Date.now();
    expect(wait).toBeGreaterThan(50_000);
    expect(wait).toBeLessThanOrEqual(60_000);
    expect(refused.error).toMatch(/attendez \d+ s/);
  });

  it("le même lien à chaque renvoi : un ancien e-mail confirme encore", async () => {
    const user = await unverifiedUser();
    const net = mailbox();
    expect((await resend()).status).toBe(200);
    // Une minute plus tard, nouvel envoi.
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifySentAt: new Date(Date.now() - 61_000) } });
    expect((await resend()).status).toBe(200);
    const bodies = net.sent.map((r) => r.json as { html: string; headers: Record<string, string> });
    expect(bodies).toHaveLength(2);
    const [first, second] = bodies.map((b) => linkIn(b.html));
    expect(first.length).toBeGreaterThan(20);
    expect(second).toBe(first);
    // Chaque e-mail arrive à part dans Gmail.
    expect(bodies[0].headers["X-Entity-Ref-ID"]).toBeTruthy();
    expect(bodies[0].headers["X-Entity-Ref-ID"]).not.toBe(bodies[1].headers["X-Entity-Ref-ID"]);
    // Le lien du PREMIER e-mail confirme.
    const res = await verify(new NextRequest(`https://nebulahub.space/api/auth/verify-email?token=${first}`));
    expect(res.headers.get("location")).toContain("email=confirme");
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("lien bientôt expiré (moins de 6 h) ou ancien jeton aléatoire : nouveau lien de 48 h", async () => {
    const user = await unverifiedUser();
    mailbox();
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifyTokenHash: hashToken("ancien-jeton-aleatoire-0123456789"), emailVerifyTokenExpiresAt: new Date(Date.now() + 40 * 3_600_000) } });
    const out = await sendVerificationEmail(user);
    expect(out.ok).toBe(true);
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row?.emailVerifyTokenHash).not.toBe(hashToken("ancien-jeton-aleatoire-0123456789"));
    expect(row!.emailVerifyTokenExpiresAt!.getTime() - Date.now()).toBeGreaterThan(47 * 3_600_000);
    expect(row?.emailVerifySentAt).toBeInstanceOf(Date);
  });

  it("3 renvois par heure ; envoi raté : délai annulé pour pouvoir réessayer", async () => {
    const user = await unverifiedUser();
    mailbox();
    for (let i = 0; i < 3; i++) {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerifySentAt: new Date(Date.now() - 61_000) } });
      expect((await resend()).status).toBe(200);
    }
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifySentAt: new Date(Date.now() - 61_000) } });
    const fourth = await resend();
    expect(fourth.status).toBe(429);
    expect((await fourth.json()).reason).toBe("hourly");

    // Panne de Resend : le délai d'une minute n'est pas compté.
    await resetDatabase();
    const other = await unverifiedUser();
    installNetwork([{ method: "POST", url: "api.resend.com/emails", status: 500, body: { name: "internal_server_error", message: "panne" } }]);
    expect((await resend()).status).toBe(502);
    expect((await prisma.user.findUnique({ where: { id: other.id } }))?.emailVerifySentAt).toBeNull();
  });

  it("/status : en attente, puis confirmée ; adresse déjà confirmée : rien n'est envoyé", async () => {
    const user = await unverifiedUser();
    mailbox();
    await resend();
    const waiting = await (await status()).json();
    expect(waiting).toMatchObject({ verified: false });
    expect(new Date(waiting.nextResendAt).getTime()).toBeGreaterThan(Date.now());
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    expect(await (await status()).json()).toMatchObject({ verified: true });
    const net = mailbox();
    expect(await (await resend()).json()).toMatchObject({ alreadyVerified: true });
    expect(net.sent).toHaveLength(0);
  });
});
