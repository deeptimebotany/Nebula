import { afterEach, describe, expect, it } from "vitest";
import { isAllowedMediaMime, isOwnFileUnder, ownStoragePath, sniffMediaMime, isRasterImageMime } from "@/lib/upload-policy";

const bytes = (...values: Array<number | string>) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? Array.from(v).map((c) => c.charCodeAt(0)) : [v])));

describe("type réel des fichiers", () => {
  it("reconnaît les signatures d'images et de vidéos", () => {
    expect(sniffMediaMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMediaMime(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffMediaMime(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffMediaMime(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(sniffMediaMime(bytes(0, 0, 0, 0x18, "ftypisom"))).toBe("video/mp4");
    expect(sniffMediaMime(bytes(0, 0, 0, 0x14, "ftypqt  "))).toBe("video/quicktime");
    expect(sniffMediaMime(bytes(0, 0, 0, 0x18, "ftypheic"))).toBe("image/heic");
  });
  it("refuse HTML, SVG et contenus inconnus", () => {
    expect(sniffMediaMime(bytes("<!DOCTYPE html><html>"))).toBeNull();
    expect(sniffMediaMime(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffMediaMime(bytes('{"AccessKeyId":"x"}'))).toBeNull();
    expect(isAllowedMediaMime("image/svg+xml")).toBe(false);
    expect(isAllowedMediaMime("image/png")).toBe(true);
    expect(isRasterImageMime("video/mp4")).toBe(false);
  });
});

describe("appartenance des fichiers", () => {
  const saved = process.env.BLOB_READ_WRITE_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = saved;
  });

  it("n'accepte que notre stockage, dans le bon dossier", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_AbC123_secret";
    const mine = "https://abc123.public.blob.vercel-storage.com/b/brandA/photo-x1.jpg";
    expect(ownStoragePath(mine)).toBe("b/brandA/photo-x1.jpg");
    expect(isOwnFileUnder(mine, ["b/brandA/"])).toBe(true);
    expect(isOwnFileUnder(mine, ["b/brandB/"])).toBe(false);
    expect(ownStoragePath("https://autre.public.blob.vercel-storage.com/b/brandA/x.jpg")).toBeNull();
    // « .. » est résolu par l'analyse de l'adresse : le fichier réel est dans brandB.
    expect(isOwnFileUnder("https://abc123.public.blob.vercel-storage.com/b/brandA/../brandB/x.jpg", ["b/brandA/"])).toBe(false);
    expect(ownStoragePath("https://abc123.public.blob.vercel-storage.com/b/brandA%2F..%2FbrandB/x.jpg")).toBeNull();
    expect(ownStoragePath("https://evil.com/b/brandA/x.jpg")).toBeNull();
    expect(ownStoragePath("/uploads/../../etc/passwd")).toBeNull();
  });
});
