// Limite de comptes connectés (09/10/2026, demande de Lucas) : la fenêtre
// bloquante est montée sur toutes les pages de l'application, seule la
// Facturation reste ouverte, et la fenêtre n'a pas de bouton « fermer ».
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { connectionSlotsFor } from "@/lib/connection-slots";
import { CONNECTION_LIMIT_OPEN_PATHS } from "@/components/billing/connection-limit-gate";

const read = (f: string) => readFileSync(f, "utf8");

describe("fenêtre « Trop de comptes connectés »", () => {
  it("montée dans le cadre de l'application, ouverte seulement au-delà du palier, sauf en Facturation", () => {
    expect(read("src/components/dashboard/app-shell.tsx")).toContain("<ConnectionLimitGate />");
    const gate = read("src/components/billing/connection-limit-gate.tsx");
    expect(gate).toContain("usage.connectionSlots > usage.limits.maxConnections");
    expect(CONNECTION_LIMIT_OPEN_PATHS).toEqual(["/billing"]);
  });
  it("impossible à fermer : déconnecter, payer ou se déconnecter de Nebula", () => {
    const dialog = read("src/components/billing/connection-limit-dialog.tsx");
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).not.toMatch(/aria-label="Fermer"|onClose|Escape/);
    expect(dialog).toContain('href="/billing"');
    expect(dialog).toContain('signOut({ callbackUrl: "/login" })');
    // Le bouton ne s'active que si les comptes gardés tiennent dans le palier.
    expect(dialog).toContain("disabled={!fits || count === 0}");
  });
  it("décompte partagé client / serveur (un compte connecté = un compte, Facebook compris)", () => {
    expect(read("src/lib/billing/plan.ts")).toContain('export { connectionSlotsFor } from "@/lib/connection-slots";');
    expect(connectionSlotsFor(["INSTAGRAM", "FACEBOOK", "TIKTOK"])).toBe(3);
    expect(read("src/app/(dashboard)/billing/garder/page.tsx")).toContain("return connectionSlotsFor(connections.map((c) => c.network));");
    for (const f of ["src/lib/billing/connection-limit.ts", "src/lib/billing/plan.ts", "src/components/billing/connection-limit-dialog.tsx", "src/app/(dashboard)/billing/garder/page.tsx", "src/app/(dashboard)/accounts/page.tsx"]) {
      expect(read(f)).not.toContain("comptent ensemble");
    }
  });
  it("côté serveur : publication refusée au-delà du palier, nouveau compte vérifié compte par compte", () => {
    expect(read("src/lib/billing/trial-expiry.ts")).toContain("reason: CONNECTION_LIMIT_REASON");
    expect(read("src/app/api/connections/[provider]/callback/route.ts")).toContain("await assertConnectionAllowed(brandId, network, token.externalAccountId);");
    expect(read("src/app/api/social/bluesky/connect/route.ts")).toContain('await assertConnectionAllowed(brandId, "BLUESKY", token.externalAccountId);');
    expect(read("src/lib/social/revoke.ts")).toContain("await wakeConnectionsWithinLimit(connection.brandId)");
  });
});
