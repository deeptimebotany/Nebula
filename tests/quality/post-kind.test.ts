// Formats de la page Publications (09/10/2026) : Short, vidéo, post, story,
// déduits comme à l'envoi (src/lib/posts/post-kind.ts).
import { describe, expect, it } from "vitest";
import { postKinds, targetKind } from "@/lib/posts/post-kind";

const vertical = { type: "VIDEO" as const, count: 1, width: 1080, height: 1920, durationSeconds: 40 };
const horizontal = { type: "VIDEO" as const, count: 1, width: 1920, height: 1080, durationSeconds: 400 };
const longVertical = { ...vertical, durationSeconds: 600 };
const image = { type: "IMAGE" as const, count: 1, width: 1080, height: 1080 };
const none = { type: null, count: 0 };

describe("format d'une publication", () => {
  it("YouTube : Short si verticale ou carrée de 3 minutes au plus, vidéo sinon", () => {
    expect(targetKind("YOUTUBE", null, vertical)).toBe("SHORT");
    expect(targetKind("YOUTUBE", null, horizontal)).toBe("VIDEO");
    expect(targetKind("YOUTUBE", null, longVertical)).toBe("VIDEO");
  });
  it("Instagram et Facebook : le format choisi, sinon celui appliqué à l'envoi", () => {
    expect(targetKind("INSTAGRAM", null, vertical)).toBe("SHORT");
    expect(targetKind("INSTAGRAM", { format: "STORY" }, image)).toBe("STORY");
    expect(targetKind("INSTAGRAM", null, image)).toBe("POST");
    expect(targetKind("FACEBOOK", null, vertical)).toBe("VIDEO");
    expect(targetKind("FACEBOOK", { format: "REEL" }, vertical)).toBe("SHORT");
    expect(targetKind("FACEBOOK", null, none)).toBe("POST");
  });
  it("TikTok : vidéo courte ; autres réseaux : vidéo ou post", () => {
    expect(targetKind("TIKTOK", null, horizontal)).toBe("SHORT");
    expect(targetKind("PINTEREST", null, image)).toBe("POST");
    expect(targetKind("BLUESKY", null, horizontal)).toBe("VIDEO");
  });
  it("plusieurs réseaux : formats distincts, dans l'ordre ; brouillon sans réseau : d'après le média", () => {
    expect(postKinds([{ network: "YOUTUBE", metadata: null }, { network: "FACEBOOK", metadata: null }], vertical)).toEqual(["SHORT", "VIDEO"]);
    expect(postKinds([], vertical)).toEqual(["SHORT"]);
    expect(postKinds([], horizontal)).toEqual(["VIDEO"]);
    expect(postKinds([], image)).toEqual(["POST"]);
  });
});
