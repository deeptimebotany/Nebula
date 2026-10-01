// « Supprimer aussi sur … » (01/10/2026) : une case seulement là où le
// réseau donne ce droit à Nebula, sinon la marche à suivre et le bon lien.
import { describe, expect, it } from "vitest";
import { isOnlineTarget, remoteDeleteSupport, removedFromNetworkAt, type RemoteDeleteTarget } from "@/lib/social/remote-delete-support";
import { deleteButtonLabel, deleteSuccessMessage } from "@/components/posts/delete-post-dialog";

const online = (network: string, over: Partial<RemoteDeleteTarget> = {}): RemoteDeleteTarget => ({
  network,
  status: "PUBLISHED",
  externalPostId: "ID-1",
  externalUrl: `https://exemple.test/${network.toLowerCase()}/ID-1`,
  ...over
});
const connected = (scopes = "") => ({ scopes, status: "CONNECTED" });

describe("ce que chaque réseau permet", () => {
  it("Facebook, LinkedIn, Pinterest, Bluesky : case de suppression", () => {
    for (const n of ["FACEBOOK", "LINKEDIN", "PINTEREST", "BLUESKY"]) {
      expect(remoteDeleteSupport(online(n), connected()), n).toEqual({ mode: "api" });
    }
  });

  it("Instagram : case seulement avec instagram_manage_contents ; sinon application, ou reconnexion si activée", () => {
    expect(remoteDeleteSupport(online("INSTAGRAM"), connected("instagram_basic,instagram_manage_contents"))).toEqual({ mode: "api" });
    const off = remoteDeleteSupport(online("INSTAGRAM"), connected("instagram_basic"));
    expect(off).toMatchObject({ mode: "manual", manageUrl: "https://exemple.test/instagram/ID-1" });
    expect(off).not.toHaveProperty("reconnect");
    expect(remoteDeleteSupport(online("INSTAGRAM"), connected("instagram_basic"), { instagramDeleteEnabled: true })).toMatchObject({ mode: "manual", reconnect: true });
  });

  it("Threads : case avec threads_delete, sinon reconnexion", () => {
    expect(remoteDeleteSupport(online("THREADS"), connected("threads_basic,threads_delete"))).toEqual({ mode: "api" });
    expect(remoteDeleteSupport(online("THREADS"), connected("threads_basic"))).toMatchObject({ mode: "manual", reconnect: true });
  });

  it("YouTube : YouTube Studio ; TikTok : application, avec le lien de la vidéo", () => {
    expect(remoteDeleteSupport(online("YOUTUBE", { externalPostId: "dQw4w9WgXcQ" }), connected())).toMatchObject({
      mode: "manual",
      manageUrl: "https://studio.youtube.com/video/dQw4w9WgXcQ/edit"
    });
    const tiktok = remoteDeleteSupport(online("TIKTOK"), connected());
    expect(tiktok).toMatchObject({ mode: "manual", manageUrl: "https://exemple.test/tiktok/ID-1" });
    expect((tiktok as { how: string }).how).toMatch(/application TikTok/);
  });

  it("compte déconnecté : pas de case, reconnexion ou à la main", () => {
    expect(remoteDeleteSupport(online("FACEBOOK"), { scopes: "", status: "DISCONNECTED" })).toMatchObject({ mode: "manual", reconnect: true });
    expect(remoteDeleteSupport(online("FACEBOOK"), null)).toMatchObject({ mode: "manual" });
  });
});

describe("cibles concernées", () => {
  it("seulement une publication en ligne, pas déjà retirée", () => {
    expect(isOnlineTarget(online("FACEBOOK"))).toBe(true);
    expect(isOnlineTarget(online("FACEBOOK", { status: "FAILED" }))).toBe(false);
    expect(isOnlineTarget(online("FACEBOOK", { status: "SCHEDULED", externalPostId: null }))).toBe(false);
    expect(isOnlineTarget(online("FACEBOOK", { externalPostId: null }))).toBe(false);
    const removed = online("FACEBOOK", { metadata: { removedFromNetworkAt: "2026-10-01T10:00:00.000Z" } });
    expect(isOnlineTarget(removed)).toBe(false);
    expect(removedFromNetworkAt(removed.metadata)).toBe("2026-10-01T10:00:00.000Z");
    expect(removedFromNetworkAt({ youtube: {} })).toBeNull();
  });
});

describe("textes de la fenêtre", () => {
  it("bouton selon les cases cochées", () => {
    expect(deleteButtonLabel([])).toBe("Supprimer de Nebula");
    expect(deleteButtonLabel(["FACEBOOK"])).toBe("Supprimer de Nebula et de Facebook");
    expect(deleteButtonLabel(["FACEBOOK", "LINKEDIN"])).toBe("Supprimer de Nebula et de 2 réseaux");
  });

  it("message final", () => {
    expect(deleteSuccessMessage([])).toBe("Publication supprimée de Nebula.");
    expect(deleteSuccessMessage([{ network: "FACEBOOK", ok: true }])).toBe("Publication supprimée de Nebula et de Facebook.");
    expect(
      deleteSuccessMessage([
        { network: "FACEBOOK", ok: true },
        { network: "LINKEDIN", ok: true },
        { network: "BLUESKY", ok: true }
      ])
    ).toBe("Publication supprimée de Nebula et de Facebook, LinkedIn et Bluesky.");
  });
});
