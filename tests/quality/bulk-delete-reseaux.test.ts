// Suppression groupée (10/10/2026, retour de Lucas) : la fenêtre ne renvoie
// plus à « la corbeille de sa ligne » ; elle propose elle-même « Supprimer
// aussi sur … » réseau par réseau, et dit clairement ce qui reste en ligne.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { readFileSync } from "node:fs";
import { bulkDeleteMessage, bulkManualReason, bulkRemoteTargetIds, bulkUnit, summarizeBulkOnline, type BulkPost } from "@/lib/posts/bulk-delete";
import { onlineSentence } from "@/components/posts/bulk-delete-dialog";
import { deleteButtonLabel } from "@/components/posts/delete-post-dialog";

const fbConn = { scopes: "pages_manage_posts", status: "ACTIVE" };
const t = (id: string, network: string, extra: Partial<BulkPost["targets"][number]> = {}) => ({
  id,
  network,
  status: "PUBLISHED",
  externalPostId: `ext-${id}`,
  externalUrl: null,
  metadata: {},
  connection: fbConn,
  ...extra
});

describe("suppression groupée : ce qui se passe sur les réseaux", () => {
  const posts: BulkPost[] = [
    { id: "p1", status: "PUBLISHED", targets: [t("a", "FACEBOOK"), t("b", "YOUTUBE"), t("c", "INSTAGRAM", { connection: { scopes: "instagram_basic", status: "ACTIVE" } })] },
    { id: "p2", status: "PUBLISHED", targets: [t("d", "FACEBOOK"), t("e", "FACEBOOK", { metadata: { removedFromNetworkAt: "2026-10-01" } })] },
    { id: "p3", status: "DRAFT", targets: [t("f", "FACEBOOK", { status: "PENDING", externalPostId: null })] },
    { id: "p4", status: "PUBLISHING", targets: [t("g", "FACEBOOK")] }
  ];
  it("réseau par réseau : ce que Nebula peut supprimer, ce qui restera en ligne et pourquoi", () => {
    const rows = summarizeBulkOnline(posts);
    expect(rows.map((r) => r.network)).toEqual(["INSTAGRAM", "FACEBOOK", "YOUTUBE"]);
    expect(rows.find((r) => r.network === "FACEBOOK")).toEqual({ network: "FACEBOOK", viaApi: 2, manual: 0, why: null, reconnect: false });
    expect(rows.find((r) => r.network === "YOUTUBE")).toMatchObject({ viaApi: 0, manual: 1, why: expect.stringContaining("YouTube Studio") });
    expect(rows.find((r) => r.network === "INSTAGRAM")).toMatchObject({ viaApi: 0, manual: 1 });
  });
  it("seulement les cibles en ligne des réseaux cochés que Nebula peut supprimer", () => {
    expect(bulkRemoteTargetIds(posts[0], ["FACEBOOK", "YOUTUBE", "INSTAGRAM"])).toEqual(["a"]);
    expect(bulkRemoteTargetIds(posts[1], ["FACEBOOK"])).toEqual(["d"]);
    expect(bulkRemoteTargetIds(posts[1], [])).toEqual([]);
  });
  it("phrases claires, au pluriel", () => {
    expect(bulkUnit("YOUTUBE", 1)).toBe("1 vidéo");
    expect(bulkUnit("FACEBOOK", 3)).toBe("3 publications");
    expect(bulkManualReason("TIKTOK", false)).toContain("supprimez-les depuis l'application TikTok");
    expect(bulkManualReason("INSTAGRAM", true)).toContain("Reconnectez le compte Instagram");
    expect(onlineSentence(true, 0, false)).toBe("Aucune n'est en ligne sur un réseau : rien ne change sur vos comptes.");
    expect(onlineSentence(true, 4, true)).toBe("Celles qui sont déjà en ligne restent sur les réseaux, sauf si vous cochez le réseau ci-dessous.");
    expect(onlineSentence(false, 1, false)).toBe("Elle reste en ligne sur les réseaux (voir ci-dessous).");
    expect(deleteButtonLabel(["FACEBOOK"])).toBe("Supprimer de Nebula et de Facebook");
    expect(bulkDeleteMessage(8, { FACEBOOK: 3 })).toBe("8 publications supprimées de Nebula et de Facebook.");
    expect(bulkDeleteMessage(1, {})).toBe("Publication supprimée de Nebula.");
  });
  it("plus de « corbeille de sa ligne » ; la fenêtre propose les réseaux elle-même", () => {
    const page = readFileSync("src/app/(dashboard)/publications/page.tsx", "utf8");
    const dialog = readFileSync("src/components/posts/bulk-delete-dialog.tsx", "utf8");
    expect(page).not.toContain("corbeille de sa ligne");
    expect(dialog).not.toContain("corbeille de sa ligne");
    expect(dialog).toContain("Supprimer aussi sur {label(row.network)}");
    expect(dialog).toContain('fetch("/api/posts/bulk-delete/preview"');
    expect(dialog).toContain("Supprimer de Nebula seulement");
  });
});
