// Métadonnées cachées des photos et vidéos (29/09/2026) : position GPS,
// appareil, auteur retirés ; orientation des photos gardée ; image et son
// des vidéos intacts, taille du fichier vidéo inchangée.
import { describe, expect, it } from "vitest";
import { scrubMoovLocation, stripImageMetadata, stripJpegMetadata, stripPngMetadata, stripVideoLocation, stripWebpMetadata } from "@/lib/media-metadata";

const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, "latin1"));

/** EXIF « II » avec orientation + un faux pointeur GPS, et le texte « GPSDATA-SECRET ». */
function exifSegment(orientation: number): number[] {
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x02, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, ...enc("GPSDATA-SECRET")];
  const payload = [...enc("Exif\0\0"), ...tiff];
  return [0xff, 0xe1, ...be16(payload.length + 2), ...payload];
}

function jpeg(orientation: number): Uint8Array {
  const app0 = [0xff, 0xe0, ...be16(16), ...enc("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const icc = [0xff, 0xe2, ...be16(2 + 14), ...enc("ICC_PROFILE\0"), 1, 1];
  const xmpText = enc("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>AUTEUR-SECRET</x:xmpmeta>");
  const xmp = [0xff, 0xe1, ...be16(xmpText.length + 2), ...xmpText];
  const iptc = [0xff, 0xed, ...be16(2 + 8), ...enc("Photosh!")];
  const com = [0xff, 0xfe, ...be16(2 + 7), ...enc("COMMENT")];
  const sos = [0xff, 0xda, ...be16(8), 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56, 0xff, 0xd9];
  return new Uint8Array([0xff, 0xd8, ...app0, ...exifSegment(orientation), ...icc, ...xmp, ...iptc, ...com, ...sos]);
}

describe("photos", () => {
  it("JPEG : EXIF, XMP, IPTC et commentaire retirés ; JFIF, profil couleur et image gardés ; orientation réécrite", () => {
    const src = jpeg(6);
    const out = stripJpegMetadata(src);
    expect(has(out, "GPSDATA-SECRET")).toBe(false);
    expect(has(out, "AUTEUR-SECRET")).toBe(false);
    expect(has(out, "Photosh!")).toBe(false);
    expect(has(out, "COMMENT")).toBe(false);
    expect(has(out, "JFIF")).toBe(true);
    expect(has(out, "ICC_PROFILE")).toBe(true);
    // Fin identique : les données d'image sont recopiées telles quelles.
    expect(Array.from(out.slice(-6))).toEqual([0x00, 0x12, 0x34, 0x56, 0xff, 0xd9]);
    // Segment d'orientation minimal (valeur 6) juste après le début.
    const i = Buffer.from(out).indexOf(Buffer.from("Exif\0\0", "latin1"));
    expect(i).toBeGreaterThan(0);
    expect(out[i + 6 + 19]).toBe(6);
  });

  it("JPEG déjà à l'endroit : pas de segment d'orientation ajouté", () => {
    const out = stripJpegMetadata(jpeg(1));
    expect(has(out, "Exif")).toBe(false);
  });

  it("JPEG sans métadonnées ou illisible : rendu tel quel (même objet)", () => {
    const clean = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0xff, 0xd9]);
    expect(stripJpegMetadata(clean)).toBe(clean);
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    expect(stripImageMetadata(junk, "image/jpeg")).toBe(junk);
  });

  it("PNG : blocs de texte, EXIF et date retirés, le reste intact", () => {
    const chunk = (type: string, data: number[]) => [...be32(data.length), ...enc(type), ...data, 0, 0, 0, 0];
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", Array(13).fill(1)), ...chunk("tEXt", enc("Author\0SECRET")), ...chunk("eXIf", enc("GPS")), ...chunk("IDAT", [9, 9, 9]), ...chunk("tIME", [7, 7, 7, 7, 7, 7, 7]), ...chunk("IEND", [])]);
    const out = stripPngMetadata(png);
    expect(has(out, "SECRET")).toBe(false);
    expect(has(out, "eXIf")).toBe(false);
    expect(has(out, "tIME")).toBe(false);
    expect(has(out, "IHDR") && has(out, "IDAT") && has(out, "IEND")).toBe(true);
  });

  it("WebP : blocs EXIF et XMP retirés, drapeaux et taille RIFF corrigés", () => {
    const chunk = (type: string, data: number[]) => [...enc(type), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
    const vp8x = chunk("VP8X", [0x0c | 0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
    const body = [...enc("WEBP"), ...vp8x, ...chunk("VP8 ", [1, 2, 3, 4]), ...chunk("EXIF", enc("GPS-SECRET")), ...chunk("XMP ", enc("AUTEUR"))];
    const webp = new Uint8Array([...enc("RIFF"), ...le32(body.length), ...body]);
    const out = stripWebpMetadata(webp);
    expect(has(out, "GPS-SECRET")).toBe(false);
    expect(has(out, "AUTEUR")).toBe(false);
    expect(out[20] & 0x0c).toBe(0);
    expect(out[20] & 0x10).toBe(0x10);
    const riff = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24);
    expect(riff).toBe(out.length - 8);
  });
});

describe("vidéos", () => {
  const box = (type: string, payload: number[]) => [...be32(payload.length + 8), ...enc(type), ...payload];

  function mov(): Uint8Array {
    const xyz = box("©xyz", [0, 18, 0x15, 0xc7, ...enc("+48.8584+002.2945/")]);
    const hdlr = box("hdlr", [0, 0, 0, 0, 0, 0, 0, 0, ...enc("mdta"), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const key = (name: string) => [...be32(8 + name.length), ...enc("mdta"), ...enc(name)];
    const keys = box("keys", [0, 0, 0, 0, ...be32(2), ...key("com.apple.quicktime.make"), ...key("com.apple.quicktime.location.ISO6709")]);
    const item = (index: number, value: string) => {
      const data = box("data", [0, 0, 0, 1, 0, 0, 0, 0, ...enc(value)]);
      return [...be32(8 + data.length), ...be32(index), ...data];
    };
    const ilst = box("ilst", [...item(1, "Apple"), ...item(2, "+45.7640+004.8357+170.000/")]);
    const meta = box("meta", [...hdlr, ...keys, ...ilst]); // QuickTime : sans version
    const udta = box("udta", [...xyz]);
    const moov = box("moov", [...box("mvhd", Array(20).fill(0)), ...udta, ...meta]);
    const ftyp = box("ftyp", enc("qt  \0\0\0\0qt  "));
    const mdat = box("mdat", [0xde, 0xad, 0xbe, 0xef]);
    return new Uint8Array([...ftyp, ...mdat, ...moov]);
  }

  it("MOV : position (©xyz et clé Apple) effacée, marque de l'appareil gardée, taille inchangée", () => {
    const src = mov();
    const out = stripVideoLocation(src);
    expect(out.length).toBe(src.length);
    expect(has(out, "+48.8584")).toBe(false);
    expect(has(out, "+45.7640")).toBe(false);
    expect(has(out, "Apple")).toBe(true);
    // Images et son (mdat) intacts.
    expect(has(out, "\xde\xad\xbe\xef")).toBe(true);
    // Le fichier d'origine n'est pas modifié (copie).
    expect(has(src, "+48.8584")).toBe(true);
  });

  it("MP4 « 3GPP » : atome loci neutralisé ; rien à effacer → même objet", () => {
    const moov = new Uint8Array([...box("moov", [...box("udta", [...box("loci", [0, 0, 0, 0, ...enc("SECRET-PLACE")])])])]);
    expect(scrubMoovLocation(moov)).toBe(1);
    expect(has(moov, "loci")).toBe(false);
    const clean = new Uint8Array([...box("ftyp", enc("isom")), ...box("moov", box("mvhd", [0, 0, 0, 0]))]);
    expect(stripVideoLocation(clean)).toBe(clean);
  });
});
