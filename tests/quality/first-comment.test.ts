// Premier commentaire (07/10/2026) : plus jamais ignoré en silence.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { SOCIAL_CLIENTS } from "@/lib/social";
import { FIRST_COMMENT_MAX_LENGTH, firstCommentSupport } from "@/lib/social/first-comment-support";
import { NETWORKS } from "@/lib/types";

const read = (p: string) => readFileSync(path.join(__dirname, "../..", p), "utf8");

describe("premier commentaire", () => {
  it("un réseau a postComment si et seulement si Nebula dit qu'il est possible (hors autorisation YouTube)", () => {
    for (const network of NETWORKS) {
      const client = SOCIAL_CLIENTS[network];
      if (!client) continue;
      const support = firstCommentSupport(network, { scopes: "youtube.force-ssl" });
      expect(Boolean(client.postComment), network).toBe(support.mode === "api");
      expect(Boolean(FIRST_COMMENT_MAX_LENGTH[network]), network).toBe(support.mode === "api");
    }
  });

  it("publish.ts ne l'appelle plus directement : tout passe par first-comment.ts (sort noté)", () => {
    const publish = read("src/lib/publish.ts");
    expect(publish).not.toMatch(/client\.postComment\(/);
    expect((publish.match(/publishFirstComment\(/g) ?? []).length).toBe(2); // publication + publication retrouvée
  });

  it("le cron et le worker relancent les commentaires en attente", () => {
    expect(read("src/app/api/cron/route.ts")).toContain("retryWaitingFirstComments()");
    expect(read("scripts/worker.ts")).toContain("retryWaitingFirstComments()");
  });

  it("Publier dit réseau par réseau où il sera publié ; la fiche donne son sort, « Réessayer » et « Copier »", () => {
    const composer = read("src/app/(dashboard)/composer/page.tsx");
    expect(composer).toContain('data-testid="first-comment-networks"');
    expect(composer).not.toContain("pas encore TikTok, YouTube ni Pinterest");
    expect(composer).toMatch(/YouTube ne permet pas aux applications de l'épingler/);
    const page = read("src/app/(dashboard)/posts/[id]/page.tsx");
    expect(page).toContain('data-testid="first-comment-status"');
    expect(page).toContain("Réessayer");
    expect(page).toContain("Copier le commentaire");
  });
});
