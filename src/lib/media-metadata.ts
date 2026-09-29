// Métadonnées cachées des photos et vidéos (29/09/2026, demande de Lucas) :
// un téléphone écrit dans chaque photo la position GPS, le modèle, la date,
// parfois le nom de l'auteur ; dans chaque vidéo, la position du tournage.
// Ces informations partaient telles quelles dans le stockage (URL publiques)
// et vers les réseaux. On les retire AVANT l'enregistrement :
//  - JPEG : segments EXIF / XMP (APP1), IPTC (APP13), commentaires retirés ;
//    l'orientation est gardée (seule valeur réécrite), sinon la photo
//    s'afficherait couchée ; le profil de couleurs (APP2) est gardé ;
//  - PNG : blocs de texte (tEXt, zTXt, iTXt), EXIF (eXIf) et date (tIME) ;
//  - WebP : blocs EXIF et XMP (et leurs drapeaux dans l'en-tête VP8X) ;
//  - MP4 / MOV : la position (atomes ©xyz et loci, et la clé Apple
//    com.apple.quicktime.location.*) est effacée dans l'index « moov »,
//    sans toucher aux images ni au son ; le fichier garde sa taille.
// Aucun nouvel encodage : la qualité ne change pas. Fonctions pures sur des
// octets (navigateur et serveur) ; en cas de format inattendu, le fichier est
// rendu tel quel plutôt que risqué.

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// --- JPEG ---------------------------------------------------------------

/** Orientation EXIF (1 à 8) lue dans un segment APP1 « Exif », ou null. */
function exifOrientation(seg: Uint8Array): number | null {
  // seg : contenu du segment APP1 (sans marqueur ni longueur).
  if (seg.length < 14 || ascii(seg, 0, 6) !== "Exif\0\0") return null;
  const t = 6;
  const little = ascii(seg, t, 2) === "II";
  const r16 = (o: number) => (little ? seg[o] | (seg[o + 1] << 8) : u16(seg, o));
  const r32 = (o: number) => (little ? (seg[o] | (seg[o + 1] << 8) | (seg[o + 2] << 16) | (seg[o + 3] << 24)) >>> 0 : u32(seg, o));
  if (r16(t + 2) !== 42) return null;
  const ifd = t + r32(t + 4);
  if (ifd + 2 > seg.length) return null;
  const count = r16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > seg.length) return null;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** Segment APP1 minimal qui ne contient QUE l'orientation. */
function orientationSegment(orientation: number): Uint8Array {
  // 'Exif\0\0' + en-tête TIFF (MM, 42, IFD0 à 8) + 1 entrée (0x0112, SHORT, 1) + fin.
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
}

export function stripJpegMetadata(b: Uint8Array): Uint8Array {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return b;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let orientation: number | null = null;
  let o = 2;
  let removed = false;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return b; // structure inattendue : on ne touche à rien
    const marker = b[o + 1];
    if (marker === 0xff) {
      o += 1; // octet de remplissage
      continue;
    }
    if (marker === 0xda || marker === 0xd9) {
      // Début des données d'image (ou fin) : tout le reste est recopié tel quel.
      parts.push(b.subarray(o));
      o = b.length;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(o, o + 2));
      o += 2;
      continue;
    }
    const len = u16(b, o + 2);
    if (len < 2 || o + 2 + len > b.length) return b;
    const seg = b.subarray(o + 4, o + 2 + len);
    const drop =
      (marker === 0xe1 && (ascii(seg, 0, 6) === "Exif\0\0" || ascii(seg, 0, 28).startsWith("http://ns.adobe.com/xap/1.0/") || ascii(seg, 0, 34).startsWith("http://ns.adobe.com/xmp/extension/"))) ||
      marker === 0xed || // IPTC / Photoshop
      marker === 0xfe; // commentaire
    if (drop) {
      if (marker === 0xe1 && orientation === null) orientation = exifOrientation(seg);
      removed = true;
    } else {
      parts.push(b.subarray(o, o + 2 + len));
    }
    o += 2 + len;
  }
  if (!removed) return b;
  if (orientation && orientation !== 1) parts.splice(1, 0, orientationSegment(orientation));
  return concat(parts);
}

// --- PNG ------------------------------------------------------------------

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

export function stripPngMetadata(b: Uint8Array): Uint8Array {
  if (b.length < 8 || PNG_SIG.some((v, i) => b[i] !== v)) return b;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let o = 8;
  let removed = false;
  while (o + 12 <= b.length) {
    const len = u32(b, o);
    const type = ascii(b, o + 4, 4);
    const end = o + 12 + len;
    if (end > b.length) return b;
    if (PNG_DROP.has(type)) removed = true;
    else parts.push(b.subarray(o, end));
    o = end;
    if (type === "IEND") break;
  }
  if (o < b.length) parts.push(b.subarray(o));
  return removed ? concat(parts) : b;
}

// --- WebP -----------------------------------------------------------------

export function stripWebpMetadata(b: Uint8Array): Uint8Array {
  if (b.length < 12 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return b;
  const chunks: Uint8Array[] = [];
  let o = 12;
  let removed = false;
  while (o + 8 <= b.length) {
    const type = ascii(b, o, 4);
    const len = b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24);
    const end = o + 8 + len + (len & 1);
    if (len < 0 || end > b.length + 1) return b;
    if (type === "EXIF" || type === "XMP ") removed = true;
    else chunks.push(b.slice(o, Math.min(end, b.length)));
    o = end;
  }
  if (!removed) return b;
  // En-tête étendu : on retire les drapeaux EXIF (0x08) et XMP (0x04).
  const vp8x = chunks.find((c) => ascii(c, 0, 4) === "VP8X");
  if (vp8x && vp8x.length > 8) vp8x[8] &= ~0x0c;
  const body = concat(chunks);
  const size = body.length + 4;
  const header = new Uint8Array([0x52, 0x49, 0x46, 0x46, size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff, 0x57, 0x45, 0x42, 0x50]);
  return concat([header, body]);
}

/** Photo sans métadonnées (JPEG, PNG, WebP) ; autres formats rendus tels quels. */
export function stripImageMetadata(bytes: Uint8Array, mimeType: string): Uint8Array {
  const t = mimeType.toLowerCase();
  try {
    if (t === "image/jpeg" || t === "image/jpg" || t === "image/pjpeg") return stripJpegMetadata(bytes);
    if (t === "image/png") return stripPngMetadata(bytes);
    if (t === "image/webp") return stripWebpMetadata(bytes);
  } catch {
    return bytes;
  }
  return bytes;
}

// --- MP4 / MOV ---------------------------------------------------------------

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "udta", "edts", "dinf", "stbl", "meta", "ilst"]);
const LOCATION_ATOMS = new Set(["©xyz", "loci"]);

function boxType(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
}

/**
 * Efface la position d'un atome « moov » (modifié EN PLACE, même taille) :
 * atomes ©xyz / loci vidés et renommés « free » (ignorés par tous les lecteurs) et
 * valeurs des clés de position (com.apple.quicktime.location.*, « location »…) remplacées par des
 * espaces. Renvoie le nombre d'éléments effacés.
 */
export function scrubMoovLocation(moov: Uint8Array): number {
  let count = 0;
  const locationKeyIndexes = new Set<number>();

  function walk(start: number, end: number, parent: string): void {
    let o = start;
    // « meta » : en MP4, boîte « complète » (4 octets version + drapeaux, à
    // zéro) ; en QuickTime (.mov), les enfants commencent tout de suite.
    if (parent === "meta" && o + 4 <= end && u32(moov, o) === 0) o += 4;
    while (o + 8 <= end) {
      let size = u32(moov, o);
      const type = boxType(moov, o);
      let header = 8;
      if (size === 1) {
        if (o + 16 > end) return;
        size = u32(moov, o + 8) * 2 ** 32 + u32(moov, o + 12);
        header = 16;
      } else if (size === 0) size = end - o;
      if (size < header || o + size > end) return;
      if (LOCATION_ATOMS.has(type)) {
        // Contenu effacé, puis atome renommé « free » (ignoré par tous les lecteurs).
        moov.fill(0, o + header, o + size);
        moov.set([0x66, 0x72, 0x65, 0x65], o + 4);
        count += 1;
      } else if (type === "keys") {
        // keys : version/flags (4), nombre (4), puis [taille][espace de noms][nom]…
        let k = o + header + 8;
        let index = 1;
        while (k + 8 <= o + size) {
          const ksize = u32(moov, k);
          if (ksize < 8 || k + ksize > o + size) break;
          const name = ascii(moov, k + 8, ksize - 8);
          if (/location|iso6709|gps/i.test(name)) locationKeyIndexes.add(index);
          k += ksize;
          index += 1;
        }
      } else if (type === "ilst" && locationKeyIndexes.size) {
        // ilst : éléments dont le « type » est l'index de la clé (1, 2, …).
        let k = o + header;
        while (k + 8 <= o + size) {
          const isize = u32(moov, k);
          if (isize < 8 || k + isize > o + size) break;
          if (locationKeyIndexes.has(u32(moov, k + 4))) {
            // Atome « data » : [taille][data][type 4][locale 4][valeur…]
            const d = k + 8;
            if (d + 16 <= k + isize && boxType(moov, d) === "data") {
              moov.fill(0x20, d + 16, k + isize);
              count += 1;
            }
          }
          k += isize;
        }
      }
      if (CONTAINERS.has(type)) walk(o + header, o + size, type);
      o += size;
    }
  }

  walk(0, moov.length, "");
  return count;
}

/** Version « tout en mémoire » (serveur) : fichier MP4 / MOV complet. */
export function stripVideoLocation(bytes: Uint8Array): Uint8Array {
  try {
    let o = 0;
    while (o + 8 <= bytes.length) {
      let size = u32(bytes, o);
      const type = boxType(bytes, o);
      if (size === 1 && o + 16 <= bytes.length) size = u32(bytes, o + 8) * 2 ** 32 + u32(bytes, o + 12);
      else if (size === 0) size = bytes.length - o;
      if (size < 8) return bytes;
      if (type === "moov") {
        const copy = bytes.slice();
        const moov = copy.subarray(o, Math.min(o + size, copy.length));
        return scrubMoovLocation(moov) > 0 ? copy : bytes;
      }
      o += size;
    }
  } catch {
    return bytes;
  }
  return bytes;
}

export function isMp4Like(mimeType: string): boolean {
  const t = mimeType.toLowerCase();
  return t === "video/mp4" || t === "video/quicktime" || t === "video/x-m4v" || t === "video/3gpp";
}
