import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pré-lancement (30/09/2026), sur une vraie base : inscription fermée sauf
// adresses invitées, connexion et sessions refusées, liste « Prévenez-moi du
// lancement », page propriétaire (ajout, export, annonce une seule fois).
const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.user ? { user: session.user } : null)) }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: () => undefined }), headers: () => new Headers() }));
vi.mock("@/lib/account-security", async (orig) => ({ ...(await orig<typeof import("@/lib/account-security")>()), sendVerificationEmail: vi.fn(async () => undefined) }));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_p: { to: string }) => ({ ok: true }) as { ok: boolean; error?: string; retryable?: boolean }) }));
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendEmail: mail.send }));

import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { POST as postRegister } from "@/app/api/auth/register/route";
import { POST as postWaitlist } from "@/app/api/public/waitlist/route";
import { DELETE as deleteLaunch, GET as getLaunch, POST as postLaunch } from "@/app/api/admin/lancement/route";
import { LAUNCH_BATCH, loadLaunchSummary, sendLaunchAnnouncement } from "@/lib/launch-list";
import { PRELAUNCH_ERROR } from "@/lib/launch";
import { hasDatabase, resetDatabase } from "./helpers";

let ipSeq = 0;
function req(url: string, body?: unknown, method = "POST") {
  ipSeq++;
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipSeq % 250}` }
  });
}

const signup = (email: string) => postRegister(req("/api/auth/register", { name: "Alex Martin", email, password: "MotDePasse-Test-1", acceptTerms: true, isAdult: true }) as unknown as Request);

type Authorize = (c: Record<string, string>, r: unknown) => Promise<unknown>;
const authorize = (authOptions.providers[0] as unknown as { options: { authorize: Authorize } }).options.authorize;
type Jwt = (a: { token: Record<string, unknown> }) => Promise<Record<string, unknown>>;
const jwt = authOptions.callbacks!.jwt as unknown as Jwt;
type SignIn = (a: { user: Record<string, unknown>; account: Record<string, unknown>; profile?: unknown }) => Promise<boolean | string>;
const signIn = authOptions.callbacks!.signIn as unknown as SignIn;

describe.skipIf(!hasDatabase)("pré-lancement", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.user = null;
    mail.send.mockClear();
    process.env.NEXTAUTH_SECRET = "secret-de-test-assez-long-pour-hkdf-0123456789";
    delete process.env.TURNSTILE_SECRET_KEY;
    vi.stubEnv("NEXT_PUBLIC_SITE_OPEN", "false");
    vi.stubEnv("PRELAUNCH_ALLOWED_EMAILS", " Testeur.Meta@Exemple.fr ,\npartenaire@exemple.fr\n");
    vi.stubEnv("ADMIN_EMAILS", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("inscription : refusée (403, aucun compte) sauf pour les adresses invitées ; ouverte à tous une fois le site ouvert", async () => {
    const refused = await signup("inconnu@exemple.fr");
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ prelaunch: true });
    expect(await prisma.user.count()).toBe(0);

    expect((await signup("TESTEUR.META@exemple.fr")).status).toBe(200);
    expect((await signup("contact.nebulahub@gmail.com")).status).toBe(200);
    expect(await prisma.user.count()).toBe(2);

    vi.stubEnv("NEXT_PUBLIC_SITE_OPEN", "true");
    expect((await signup("inconnu@exemple.fr")).status).toBe(200);
  });

  it("connexion : adresse non invitée refusée (même avec le bon mot de passe), invitée acceptée ; sessions coupées", async () => {
    const passwordHash = await bcrypt.hash("MotDePasse-Test-1", 4);
    const outsider = await prisma.user.create({ data: { email: "ami@exemple.fr", name: "Ami", passwordHash } });
    const partner = await prisma.user.create({ data: { email: "partenaire@exemple.fr", name: "Partenaire", passwordHash } });
    const headers = { "x-forwarded-for": "203.0.113.7" };

    await expect(authorize({ email: "ami@exemple.fr", password: "MotDePasse-Test-1" }, { headers })).rejects.toThrow(PRELAUNCH_ERROR);
    // Même réponse pour une adresse sans compte : rien n'est révélé.
    await expect(authorize({ email: "personne@exemple.fr", password: "x" }, { headers })).rejects.toThrow(PRELAUNCH_ERROR);
    expect(await authorize({ email: "Partenaire@exemple.fr", password: "MotDePasse-Test-1" }, { headers })).toMatchObject({ id: partner.id });

    // Session ouverte avant la fermeture : refusée ; celle d'un invité passe.
    await expect(jwt({ token: { uid: outsider.id, sv: 0, email: outsider.email } })).rejects.toThrow();
    await expect(jwt({ token: { uid: partner.id, sv: 0, email: partner.email } })).resolves.toMatchObject({ uid: partner.id });

    // Google : aucun compte créé pour une adresse non invitée.
    expect(await signIn({ user: { email: "nouveau@gmail.com", name: "N" }, account: { provider: "google", providerAccountId: "g-1" }, profile: { email_verified: true } })).toBe(`/login?error=${PRELAUNCH_ERROR}`);
    expect(await prisma.user.findUnique({ where: { email: "nouveau@gmail.com" } })).toBeNull();

    // Site ouvert : tout redevient normal.
    vi.stubEnv("NEXT_PUBLIC_SITE_OPEN", "true");
    expect(await authorize({ email: "ami@exemple.fr", password: "MotDePasse-Test-1" }, { headers: { "x-forwarded-for": "203.0.113.8" } })).toMatchObject({ id: outsider.id });
    await expect(jwt({ token: { uid: outsider.id, sv: 0, email: outsider.email } })).resolves.toMatchObject({ uid: outsider.id });
  });

  it("liste « lancement » : formulaire de /bientot, doublons ignorés, réseau inconnu refusé", async () => {
    const join = (email: string, network = "lancement", consent = false) => postWaitlist(req("/api/public/waitlist", { email, network, consent }));
    expect((await join("Fan@Exemple.fr", "lancement", true)).status).toBe(200);
    expect((await join("fan@exemple.fr")).status).toBe(200);
    expect((await join("autre@exemple.fr")).status).toBe(200);
    expect((await join("x@exemple.fr", "myspace")).status).toBe(400);
    const rows = await prisma.networkWaitlist.findMany({ where: { network: "lancement" }, orderBy: { email: "asc" } });
    expect(rows.map((r) => r.email)).toEqual(["autre@exemple.fr", "fan@exemple.fr"]);
    // Le second envoi met à jour le choix « conseils ».
    expect(rows[1].consent).toBe(false);
  });

  it("page propriétaire : réservée, ajout des adresses reçues par e-mail, export CSV sans formule, retrait", async () => {
    const owner = await prisma.user.create({ data: { email: "nommelucas@gmail.com", name: "Lucas" } });
    session.user = { id: "autre", email: "ami@exemple.fr" };
    expect((await getLaunch()).status).toBe(404);
    expect((await postLaunch(req("/api/admin/lancement", { action: "add", emails: "a@exemple.fr" }))).status).toBe(404);

    session.user = { id: owner.id, email: owner.email };
    const added = await postLaunch(req("/api/admin/lancement", { action: "add", emails: "Julie <julie@exemple.fr>\nmarc@exemple.com, julie@exemple.fr\n=cmd@exemple.fr" }));
    expect(await added.json()).toMatchObject({ found: 3, added: 3 });
    const again = await postLaunch(req("/api/admin/lancement", { action: "add", emails: "marc@exemple.com" }));
    expect(await again.json()).toMatchObject({ found: 1, added: 0 });
    expect((await postLaunch(req("/api/admin/lancement", { action: "add", emails: "rien" }))).status).toBe(400);

    const bytes = new Uint8Array(await (await getLaunch()).arrayBuffer());
    // Marque UTF-8 en tête : accents lus correctement par Excel.
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv.split("\n")[0]).toBe("email,inscrit_le,conseils,prevenu_le");
    expect(csv).toContain(`"julie@exemple.fr"`);
    // Une cellule qui commence par « = » ne devient jamais une formule.
    expect(csv).toContain(`"'=cmd@exemple.fr"`);

    const summary = await loadLaunchSummary();
    expect(summary).toMatchObject({ open: false, total: 3, notified: 0, pending: 3 });
    // Le compte propriétaire est autorisé : aucun compte bloqué.
    expect(summary.blockedAccounts).toBe(0);
    await prisma.user.create({ data: { email: "ami@exemple.fr", name: "Ami" } });
    expect((await loadLaunchSummary()).blockedAccounts).toBe(1);

    expect((await deleteLaunch(req("/api/admin/lancement", { email: "MARC@exemple.com" }, "DELETE"))).status).toBe(200);
    expect(await prisma.networkWaitlist.count({ where: { network: "lancement" } })).toBe(2);
  });

  it("annonce : jamais pendant le pré-lancement ; ensuite une seule fois par adresse, par paquets", async () => {
    await prisma.networkWaitlist.createMany({
      data: Array.from({ length: LAUNCH_BATCH + 5 }, (_, i) => ({ email: `p${i}@exemple.fr`, network: "lancement", createdAt: new Date(Date.now() - (1000 - i) * 1000) }))
    });
    await prisma.networkWaitlist.create({ data: { email: "reseau@exemple.fr", network: "threads" } });

    const locked = await sendLaunchAnnouncement();
    expect(locked).toMatchObject({ sent: 0, remaining: LAUNCH_BATCH + 5 });
    expect(locked.error).toMatch(/pré-lancement/);
    expect(mail.send).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_SITE_OPEN", "true");
    const first = await sendLaunchAnnouncement();
    expect(first).toEqual({ sent: LAUNCH_BATCH, failed: 0, remaining: 5 });
    expect(mail.send).toHaveBeenCalledTimes(LAUNCH_BATCH);
    // Les premiers inscrits d'abord ; contenu : ouverture, lien d'inscription, réponse vers l'adresse de contact.
    const call = mail.send.mock.calls[0][0] as unknown as { to: string; subject: string; html: string; text: string; replyTo: string; idempotencyKey: string };
    expect(call).toMatchObject({ to: "p0@exemple.fr", subject: "Nebula est ouvert !", replyTo: "contact.nebulahub@gmail.com" });
    expect(call.html).toContain("/register?utm_source=lancement");
    expect(call.text).toContain("c'est le grand jour");
    expect(call.idempotencyKey).toMatch(/^launch-announcement:/);

    // Resend refuse (quota du jour) : on s'arrête après 3 refus, rien n'est marqué.
    mail.send.mockImplementation(async () => ({ ok: false, error: "quota" }));
    const refused = await sendLaunchAnnouncement();
    expect(refused).toMatchObject({ sent: 0, failed: 3, remaining: 5, error: "quota" });

    mail.send.mockImplementation(async () => ({ ok: true }));
    expect(await sendLaunchAnnouncement()).toEqual({ sent: 5, failed: 0, remaining: 0 });
    expect(await sendLaunchAnnouncement()).toEqual({ sent: 0, failed: 0, remaining: 0 });
    // La liste d'un réseau à venir n'est jamais concernée.
    expect((await prisma.networkWaitlist.findFirst({ where: { network: "threads" } }))?.notifiedAt).toBeNull();
    expect(mail.send.mock.calls.some((c) => (c[0] as { to: string }).to === "reseau@exemple.fr")).toBe(false);
  });
});
