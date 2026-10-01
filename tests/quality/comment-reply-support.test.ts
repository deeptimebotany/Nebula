// Répondre depuis Nebula (01/10/2026) : un champ « Répondre » là où le
// réseau le permet, sinon la raison et le lien.
import { describe, expect, it } from "vitest";
import { commentReplySupport, REPLY_MAX_LENGTH, replyLength } from "@/lib/social/comment-reply-support";

const ok = { scopes: "", status: "CONNECTED" };

describe("ce que chaque réseau permet", () => {
  it("Instagram, Facebook, Threads, Bluesky : réponse depuis Nebula, avec la limite du réseau", () => {
    expect(commentReplySupport("INSTAGRAM", ok)).toEqual({ mode: "api", maxLength: 2200 });
    expect(commentReplySupport("FACEBOOK", ok)).toEqual({ mode: "api", maxLength: 8000 });
    expect(commentReplySupport("THREADS", ok)).toEqual({ mode: "api", maxLength: 500 });
    expect(commentReplySupport("BLUESKY", ok)).toEqual({ mode: "api", maxLength: 300 });
  });

  it("YouTube : seulement avec youtube.force-ssl ; sinon réponse sur YouTube, ou reconnexion si activé", () => {
    expect(commentReplySupport("YOUTUBE", { scopes: "youtube.upload,youtube.readonly,youtube.force-ssl", status: "CONNECTED" })).toEqual({ mode: "api", maxLength: 10000 });
    const off = commentReplySupport("YOUTUBE", { scopes: "youtube.upload,youtube.readonly", status: "CONNECTED" });
    expect(off).toMatchObject({ mode: "manual" });
    expect(off).not.toHaveProperty("reconnect");
    expect(commentReplySupport("YOUTUBE", { scopes: "youtube.upload", status: "CONNECTED" }, { youtubeReplyEnabled: true })).toMatchObject({ mode: "manual", reconnect: true });
  });

  it("TikTok, LinkedIn, Pinterest : réponse sur le réseau", () => {
    for (const n of ["TIKTOK", "LINKEDIN", "PINTEREST"]) expect(commentReplySupport(n, ok).mode, n).toBe("manual");
  });

  it("compte déconnecté ou expiré : reconnexion", () => {
    expect(commentReplySupport("INSTAGRAM", { scopes: "", status: "DISCONNECTED" })).toMatchObject({ mode: "manual", reconnect: true });
    expect(commentReplySupport("FACEBOOK", { scopes: "", status: "EXPIRED" })).toMatchObject({ mode: "manual", reconnect: true });
    expect(commentReplySupport("FACEBOOK", null)).toMatchObject({ mode: "manual", reconnect: true });
    expect(commentReplySupport("FACEBOOK", { scopes: "", status: "ERROR" })).toMatchObject({ mode: "api" });
  });
});

describe("longueur", () => {
  it("emoji compté pour un, espaces autour ignorés", () => {
    expect(replyLength("  Merci 🙏  ")).toBe(7);
    expect(replyLength("é".repeat(300))).toBeLessThanOrEqual(REPLY_MAX_LENGTH.BLUESKY!);
  });
});
