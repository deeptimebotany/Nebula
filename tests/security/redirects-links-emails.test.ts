import { describe, expect, it, vi } from "vitest";

// Ces tests n'utilisent pas la base : client Prisma factice.
vi.mock("@/lib/prisma", () => ({ prisma: {}, backfillSecrets: async () => ({ sealed: 0, failed: 0 }) }));
import { safeRelativePath } from "@/lib/safe-redirect";
import { isSafeLinkUrl, safeHref } from "@/lib/safe-url";
import { safeEmailHref } from "@/lib/emails/brand";
import { toolPathFor } from "@/lib/tool-leads";
import { isPlaceholderSecret, safeEqual } from "@/lib/secrets";
import { providerEmailVerified } from "@/lib/account-security";

describe("redirections internes", () => {
  it.each(["//evil.com", "/\\evil.com", "/\\\\evil.com", "https://evil.com", "javascript:alert(1)", "/\u0000x", "", "evil.com", "/%0d%0aSet-Cookie:x"])(
    "%j retombe sur la valeur de repli",
    (value) => {
      const out = safeRelativePath(value, "/dashboard");
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      expect(new URL(out, "https://nebulahub.space").origin).toBe("https://nebulahub.space");
    }
  );
  it("garde un chemin interne avec ses paramètres", () => {
    expect(safeRelativePath("/composer?draft=1#top", "/dashboard")).toBe("/composer?draft=1#top");
  });
});

describe("liens de la Page bio", () => {
  it.each(["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>", "vbscript:x", "file:///etc/passwd"])("%s est refusé", (url) => {
    expect(isSafeLinkUrl(url)).toBe(false);
    expect(safeHref(url)).toBe("#");
  });
  it.each(["https://example.com", "http://example.com", "mailto:a@b.fr", "tel:+33123456789"])("%s est accepté", (url) => expect(isSafeLinkUrl(url)).toBe(true));
});

describe("liens dans les e-mails", () => {
  it("neutralise une injection dans l'attribut href", () => {
    const out = safeEmailHref('https://nebulahub.space/outils/"><a href=//ev.il>Reset</a><b x="');
    expect(out).not.toContain('"');
    expect(out).not.toContain("<");
  });
  it("remplace un protocole dangereux par le site", () => {
    expect(safeEmailHref("javascript:alert(1)")).toMatch(/^https:\/\//);
  });
  it("un nom d'outil inconnu mène à la page des outils", () => {
    expect(toolPathFor('"><script>')).toBe("/outils");
    expect(toolPathFor("legendes")).toBe("/outils/legendes");
  });
});

describe("secrets et comptes", () => {
  it("refuse les valeurs d'exemple de .env.example", () => {
    expect(isPlaceholderSecret("générez avec: openssl rand -base64 32")).toBe(true);
    expect(isPlaceholderSecret("générez une chaîne aléatoire pour protéger /api/cron")).toBe(true);
    expect(isPlaceholderSecret("")).toBe(true);
    expect(isPlaceholderSecret("k3N9x0vQm2yP8sLr4tZa1bC6dE7fG5hJ")).toBe(false);
  });
  it("comparaison en temps constant", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("court", "beaucoup plus long")).toBe(false);
  });
  it("seuls Google (email_verified) et Apple garantissent l'adresse", () => {
    expect(providerEmailVerified("google", { email_verified: true })).toBe(true);
    expect(providerEmailVerified("google", { email_verified: false })).toBe(false);
    expect(providerEmailVerified("google", {})).toBe(false);
    expect(providerEmailVerified("apple", { email_verified: "true" })).toBe(true);
    expect(providerEmailVerified("apple", { email_verified: "false" })).toBe(false);
    expect(providerEmailVerified("facebook", { email_verified: true })).toBe(false);
  });
});
