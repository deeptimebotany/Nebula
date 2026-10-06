// Chiffrement des jetons (06/10/2026) : textes des alertes et branchement
// sur le cron — règles pures.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {}, secretsStatus: vi.fn() }));

import { failedAlert, missingKeyAlert } from "@/lib/secrets-health";

describe("chiffrement des jetons : alertes", () => {
  it("clé absente : dit combien de jetons sont en clair et quoi faire, sans jamais demander la clé", () => {
    const one = missingKeyAlert(1);
    expect(one.body).toContain("1 jeton (TikTok, YouTube, Meta, intégrations…) est enregistré en clair");
    const many = missingKeyAlert(12);
    expect(many.title).toBe("Jetons des comptes connectés enregistrés en clair");
    expect(many.body).toContain("12 jetons (TikTok, YouTube, Meta, intégrations…) sont enregistrés en clair");
    expect(many.body).toContain("Vercel");
    expect(many.body).not.toMatch(/envoyez|communiquez|transmettez/i);
    expect(failedAlert(3).body).toContain("TOKEN_ENCRYPTION_KEY_PREVIOUS");
  });

  it("le cron vérifie après chaque rattrapage", () => {
    const cron = readFileSync("src/app/api/cron/route.ts", "utf8");
    expect(cron).toContain("await checkSecretsHealth(result)");
    const env = readFileSync(".env.example", "utf8");
    expect(env).toContain("TOKEN_ENCRYPTION_KEY=\"\"");
  });
});
