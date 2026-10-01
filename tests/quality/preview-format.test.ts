// Aperçu de Publier (01/10/2026) : le cadre suit le format de la vidéo.
// Vidéo verticale : écrans Reels / Shorts / TikTok plein écran ; vidéo en
// paysage ou carrée : publication à son format (fil Instagram, lecteur
// YouTube, lecteur horizontal TikTok sur ordinateur, « Plein écran » sur mobile).
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkPreviewUi, type MediaShape, type PreviewDevice, type PreviewPost } from "@/components/composer/preview-network-ui";
import type { Network } from "@/lib/types";

const post = (network: Network, shape: MediaShape, extra: Partial<PreviewPost> = {}): PreviewPost => ({
  network,
  accountName: "Studio Nova",
  handle: "studio.nova",
  avatarUrl: null,
  asset: { id: "a1", url: "/v.mp4", filename: "v.mp4", type: "VIDEO", previewUrl: "blob:v" },
  title: "Titre",
  caption: "Légende",
  shape,
  onMediaShape: () => undefined,
  ...extra
});
const html = (p: PreviewPost, device: PreviewDevice) => renderToStaticMarkup(createElement(NetworkPreviewUi, { post: p, device }));

describe("aperçu au format de la vidéo", () => {
  it("Instagram : Reel pour une vidéo verticale, publication du fil en 16:9 ou carrée sinon", () => {
    for (const device of ["mobile", "desktop"] as const) {
      expect(html(post("INSTAGRAM", "portrait"), device)).toContain("Reels");
      const wide = html(post("INSTAGRAM", "landscape"), device);
      expect(wide).not.toContain("Son original");
      expect(wide).toContain("aspect-video");
      expect(html(post("INSTAGRAM", "square"), device)).toContain("aspect-square");
    }
  });

  it("TikTok : plein écran en vertical ; en paysage, « Plein écran » sur mobile et lecteur 16:9 sur ordinateur", () => {
    expect(html(post("TIKTOK", "portrait"), "mobile")).not.toContain("Plein écran");
    expect(html(post("TIKTOK", "landscape"), "mobile")).toContain("Plein écran");
    expect(html(post("TIKTOK", "landscape"), "desktop")).toContain("aspect-ratio:16/9");
    expect(html(post("TIKTOK", "portrait"), "desktop")).toContain("aspect-ratio:9/16");
    expect(html(post("TIKTOK", "square"), "desktop")).toContain("aspect-ratio:1/1");
  });

  it("YouTube : Shorts en vertical, page vidéo en paysage", () => {
    for (const device of ["mobile", "desktop"] as const) {
      expect(html(post("YOUTUBE", "portrait"), device)).toContain("Remix");
      expect(html(post("YOUTUBE", "landscape"), device)).not.toContain("Remix");
    }
  });

  it("Instagram : collaborateurs dans l'en-tête, comme dans l'application", () => {
    expect(html(post("INSTAGRAM", "landscape", { coAuthors: ["cafe.nova"] }), "mobile")).toContain("studio.nova et cafe.nova");
    expect(html(post("INSTAGRAM", "portrait", { coAuthors: ["a", "b"] }), "mobile")).toContain("studio.nova et 2 autres");
  });
});
