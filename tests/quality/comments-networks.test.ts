// Commentaires (03/10/2026) : seuls les réseaux dont l'API laisse lire les
// commentaires apparaissent dans l'onglet Commentaires et dans le lien
// « Commentaires » de Comptes connectés. TikTok et Pinterest n'y sont plus
// (plus de bandeau d'explication) ; Bluesky, lui, est bien pris en charge.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { NETWORKS, NETWORK_META, commentNetworks, networksSentence } from "@/lib/types";
import { getSocialClient } from "@/lib/social";

const ROOT = path.resolve(__dirname, "../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("réseaux et commentaires", () => {
  it("NETWORK_META.readsComments correspond au client (lecture des commentaires = fetchEngagement)", () => {
    for (const n of NETWORKS) {
      expect(NETWORK_META[n].readsComments !== false, n).toBe(Boolean(getSocialClient(n).fetchEngagement));
    }
  });

  it("TikTok et Pinterest exclus, Bluesky gardé", () => {
    expect(NETWORK_META.TIKTOK.readsComments).toBe(false);
    expect(NETWORK_META.PINTEREST.readsComments).toBe(false);
    expect(NETWORK_META.BLUESKY.readsComments).toBeUndefined();
    expect(networksSentence(commentNetworks(), "ou")).toBe("Instagram, Facebook, YouTube ou Bluesky");
  });

  it("plus de bandeau ni de filtre pour les réseaux sans commentaires, lien masqué dans Comptes connectés", () => {
    const comments = read("src/components/interactions/comments-view.tsx");
    expect(comments).not.toContain("ne permet pas encore de lire les commentaires");
    expect(comments).toContain(".filter((c) => c.supportsEngagement)");
    const accounts = read("src/app/(dashboard)/accounts/page.tsx");
    expect(accounts).toMatch(/readsComments !== false && \(\s*<Link\s+href=\{`\/interactions\?connectionId=/);
  });
});
