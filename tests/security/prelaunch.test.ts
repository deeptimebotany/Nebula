// Pré-lancement (30/09/2026) : site visible, inscriptions fermées, seules
// quelques adresses entrent (src/lib/launch.ts). Règles pures, middleware,
// et ordre des vérifications côté serveur (avant toute lecture en base).
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ token: null as null | Record<string, unknown> }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => auth.token) }));

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import {
  EARLY_ACCESS_QUERY,
  LAUNCH_STEPS,
  PRELAUNCH_CONTACT_EMAIL,
  canEnterSite,
  extraAllowedEmails,
  isPrelaunchAllowed,
  isSiteOpen,
  launchProgress,
  parseEmailList,
  prelaunchAllowedEmails
} from "@/lib/launch";

const ROOT = path.join(__dirname, "../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

beforeEach(() => {
  auth.token = null;
  vi.stubEnv("NEXT_PUBLIC_SITE_OPEN", "");
  vi.stubEnv("PRELAUNCH_ALLOWED_EMAILS", "");
  vi.stubEnv("ADMIN_EMAILS", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("règles du pré-lancement", () => {
  it("fermé par défaut ; ouvert seulement avec une valeur explicite (retour à la ligne et guillemets ignorés)", () => {
    expect(isSiteOpen()).toBe(false);
    for (const v of ["false", "0", "non", "ouvert", " "]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_OPEN", v);
      expect(isSiteOpen(), v).toBe(false);
    }
    for (const v of ["true", "TRUE", "1", "oui", '"true"', "true\n"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_OPEN", v);
      expect(isSiteOpen(), JSON.stringify(v)).toBe(true);
    }
  });

  it("toujours autorisés : le propriétaire et l'adresse de contact (majuscules et espaces ignorés)", () => {
    expect(isPrelaunchAllowed("nommelucas@gmail.com")).toBe(true);
    expect(isPrelaunchAllowed("  NommeLucas@Gmail.com ")).toBe(true);
    expect(isPrelaunchAllowed(PRELAUNCH_CONTACT_EMAIL)).toBe(true);
    expect(PRELAUNCH_CONTACT_EMAIL).toBe("contact.nebulahub@gmail.com");
    expect(isPrelaunchAllowed("inconnu@exemple.fr")).toBe(false);
    expect(isPrelaunchAllowed("")).toBe(false);
    expect(isPrelaunchAllowed(null)).toBe(false);
    // Pas d'autorisation par ressemblance.
    expect(isPrelaunchAllowed("nommelucas@gmail.com.pirate.fr")).toBe(false);
    expect(isPrelaunchAllowed("xnommelucas@gmail.com")).toBe(false);
  });

  it("liste réglable PRELAUNCH_ALLOWED_EMAILS (virgules, points-virgules, retours à la ligne, guillemets) et ADMIN_EMAILS", () => {
    vi.stubEnv("PRELAUNCH_ALLOWED_EMAILS", ' "Testeur.Meta@Exemple.fr" ,partenaire@exemple.fr;\n tiktok-review@exemple.com\npas-une-adresse ');
    vi.stubEnv("ADMIN_EMAILS", "admin@exemple.fr");
    expect(extraAllowedEmails()).toEqual(["testeur.meta@exemple.fr", "partenaire@exemple.fr", "tiktok-review@exemple.com"]);
    for (const e of ["testeur.meta@exemple.fr", "PARTENAIRE@exemple.fr", "tiktok-review@exemple.com", "admin@exemple.fr"]) expect(isPrelaunchAllowed(e), e).toBe(true);
    expect(isPrelaunchAllowed("pas-une-adresse")).toBe(false);
    expect(prelaunchAllowedEmails()).toEqual([
      "nommelucas@gmail.com",
      "contact.nebulahub@gmail.com",
      "testeur.meta@exemple.fr",
      "partenaire@exemple.fr",
      "tiktok-review@exemple.com",
      "admin@exemple.fr"
    ]);
  });

  it("site ouvert : tout le monde entre", () => {
    expect(canEnterSite("inconnu@exemple.fr")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SITE_OPEN", "true");
    expect(canEnterSite("inconnu@exemple.fr")).toBe(true);
    expect(canEnterSite(null)).toBe(true);
  });

  it("barre de chargement : terminé = 1, en cours = 0,5 ; étapes honnêtes (ouverture pas encore faite)", () => {
    expect(launchProgress([])).toBe(0);
    expect(launchProgress([{ label: "a", detail: "", state: "done" }, { label: "b", detail: "", state: "doing" }, { label: "c", detail: "", state: "todo" }, { label: "d", detail: "", state: "todo" }])).toBe(38);
    expect(LAUNCH_STEPS.at(-1)?.state).toBe("todo");
    const p = launchProgress();
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(100);
  });

  it("adresses collées (reçues par e-mail) : triées, sans doublon, sans texte autour", () => {
    expect(parseEmailList("Alice <Alice@Exemple.fr>, bob@exemple.com\nalice@exemple.fr; (carole@exemple.org) n'importe quoi")).toEqual([
      "alice@exemple.fr",
      "bob@exemple.com",
      "carole@exemple.org"
    ]);
    expect(parseEmailList("rien ici")).toEqual([]);
  });
});

describe("middleware pendant le pré-lancement", () => {
  const run = (url: string) => middleware(new NextRequest(url));

  it("/register → /bientot (paramètres utm gardés) ; ?acces=anticipe garde le formulaire", async () => {
    const res = await run("https://nebulahub.space/register?utm_source=tiktok&utm_campaign=teaser");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://nebulahub.space/bientot?utm_source=tiktok&utm_campaign=teaser");
    const invited = await run(`https://nebulahub.space/register?${EARLY_ACCESS_QUERY.name}=${EARLY_ACCESS_QUERY.value}`);
    expect(invited.headers.get("location")).toBeNull();
  });

  it("application : session d'une adresse non invitée → /bientot ; adresse invitée → entre", async () => {
    auth.token = { uid: "u1", email: "inconnu@exemple.fr" };
    const out = await run("https://nebulahub.space/dashboard");
    expect(out.headers.get("location")).toBe("https://nebulahub.space/bientot");
    auth.token = { uid: "u2", email: "NommeLucas@gmail.com" };
    const inside = await run("https://nebulahub.space/composer");
    expect(inside.headers.get("location")).toBeNull();
    expect(inside.headers.get("content-security-policy-report-only") ?? inside.headers.get("content-security-policy")).toContain("'strict-dynamic'");
  });

  it("accueil : seul un compte autorisé part vers le tableau de bord ; la page reste visible pour les autres", async () => {
    auth.token = { uid: "u1", email: "inconnu@exemple.fr" };
    expect((await run("https://nebulahub.space/")).headers.get("location")).toBeNull();
    auth.token = { uid: "u2", email: "contact.nebulahub@gmail.com" };
    expect((await run("https://nebulahub.space/")).headers.get("location")).toBe("https://nebulahub.space/dashboard");
    auth.token = null;
    const visitor = await run("https://nebulahub.space/tarifs");
    expect(visitor.status).toBe(200);
  });

  it("site ouvert : /register normal, /bientot → /register", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_OPEN", "true");
    expect((await run("https://nebulahub.space/register")).headers.get("location")).toBeNull();
    expect((await run("https://nebulahub.space/bientot?utm_source=x")).headers.get("location")).toBe("https://nebulahub.space/register?utm_source=x");
    auth.token = { uid: "u1", email: "inconnu@exemple.fr" };
    expect((await run("https://nebulahub.space/dashboard")).headers.get("location")).toBeNull();
  });
});

describe("barrières côté serveur (ordre des vérifications)", () => {
  it("connexion par mot de passe : refus avant la lecture du compte (aucune indication d'existence)", () => {
    const src = read("src/lib/auth.ts");
    const check = src.indexOf("if (!canEnterSite(emailKey)) throw new Error(PRELAUNCH_ERROR)");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(src.indexOf("const user = await prisma.user.findUnique({"));
  });

  it("Google / Apple / Meta : refus avant la création du compte ; sessions existantes coupées", () => {
    const src = read("src/lib/auth.ts");
    const check = src.indexOf("if (!canEnterSite(user.email)) return `/login?error=${PRELAUNCH_ERROR}`");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(src.indexOf("const result = await resolveOAuthSignIn({"));
    expect(src).toMatch(/if \(!canEnterSite\(typeof token\.email === "string" \? token\.email : null\)\) throw new Error/);
  });

  it("inscription : refus avant Turnstile et avant la recherche d'un compte existant", () => {
    const src = read("src/app/api/auth/register/route.ts");
    const check = src.indexOf("if (!canEnterSite(email))");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(src.indexOf("await verifyTurnstileToken("));
    expect(check).toBeLessThan(src.indexOf("await prisma.user.findUnique("));
  });

  it("tout fichier qui crée un compte passe par la barrière", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name)) files.push(full);
      }
    };
    walk(path.join(ROOT, "src"));
    const creators = files.filter((f) => /\buser\.(create|upsert|createMany)\(/.test(readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
    expect(creators.sort()).toEqual(["src/app/api/auth/register/route.ts", "src/lib/auth.ts"]);
    for (const f of creators) expect(read(f), f).toMatch(/canEnterSite/);
  });
});
