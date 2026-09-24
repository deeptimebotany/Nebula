// Unsplash (lot 3, 25/09/2026) — banque de photos libres, API gratuite.
// Clé : UNSPLASH_ACCESS_KEY (application créée sur unsplash.com/developers).
// En mode « démo », 50 requêtes par heure ; demander le passage en
// production (gratuit) pour 5 000 par heure.
//
// Règles d'utilisation respectées : les vignettes de recherche viennent
// directement d'Unsplash (pas de copie), chaque photo affiche son auteur avec
// des liens utm_source=<app>&utm_medium=referral, et l'événement de
// téléchargement (download_location) est déclenché à chaque import.
import { unsplashAppName } from "./config";
import { ImportError } from "./remote-media";

const API = "https://api.unsplash.com";

function key(): string {
  const k = process.env.UNSPLASH_ACCESS_KEY;
  if (!k) throw new ImportError("Unsplash n'est pas configuré.", 503);
  return k;
}

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Client-ID ${key()}`, "Accept-Version": "v1" }, cache: "no-store" });
  if (res.status === 403) throw new ImportError("Limite de recherches Unsplash atteinte pour cette heure : réessayez un peu plus tard.", 429);
  if (!res.ok) throw new ImportError(`Unsplash a répondu ${res.status}.`, 502);
  return (await res.json()) as T;
}

interface ApiPhoto {
  id: string;
  width: number;
  height: number;
  color: string | null;
  alt_description: string | null;
  description: string | null;
  urls: { raw: string; small: string; thumb: string; regular: string };
  links: { html: string; download_location: string };
  user: { name: string; username: string; links: { html: string } };
}

export interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string | null;
  alt: string;
  thumbUrl: string;
  smallUrl: string;
  photoUrl: string;
  author: { name: string; profileUrl: string };
}

function withUtm(url: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", unsplashAppName());
  u.searchParams.set("utm_medium", "referral");
  return u.toString();
}

export const UNSPLASH_HOME = () => withUtm("https://unsplash.com/");

function toPhoto(p: ApiPhoto): UnsplashPhoto {
  return {
    id: p.id,
    width: p.width,
    height: p.height,
    color: p.color,
    alt: p.alt_description || p.description || "",
    thumbUrl: p.urls.thumb,
    smallUrl: p.urls.small,
    photoUrl: withUtm(p.links.html),
    author: { name: p.user.name, profileUrl: withUtm(p.user.links.html) }
  };
}

export async function searchUnsplash(query: string, page: number, orientation?: "landscape" | "portrait" | "squarish") {
  const params = new URLSearchParams({ query, page: String(page), per_page: "24", content_filter: "high", lang: "fr" });
  if (orientation) params.set("orientation", orientation);
  const data = await call<{ total: number; total_pages: number; results: ApiPhoto[] }>(`/search/photos?${params.toString()}`);
  return { total: data.total, totalPages: data.total_pages, photos: data.results.map(toPhoto) };
}

/**
 * Prépare l'import d'une photo : déclenche l'événement de téléchargement
 * exigé par Unsplash et renvoie l'adresse du fichier (2 400 px de large,
 * largement assez pour tous les réseaux) et le crédit à afficher.
 */
export async function prepareUnsplashImport(id: string): Promise<{ fileUrl: string; filename: string; credit: { name: string; profileUrl: string; photoUrl: string } }> {
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(id)) throw new ImportError("Photo Unsplash introuvable.", 404);
  const photo = await call<ApiPhoto>(`/photos/${id}`);
  // Événement de téléchargement (obligatoire, sans effet sur le fichier).
  await fetch(photo.links.download_location, { headers: { Authorization: `Client-ID ${key()}` }, cache: "no-store" }).catch(() => undefined);
  const file = new URL(photo.urls.raw);
  file.searchParams.set("w", "2400");
  file.searchParams.set("fm", "jpg");
  file.searchParams.set("q", "85");
  file.searchParams.set("fit", "max");
  const slug = (photo.alt_description || "photo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "photo";
  return {
    fileUrl: file.toString(),
    filename: `unsplash-${slug}-${photo.id}.jpg`,
    credit: { name: photo.user.name, profileUrl: withUtm(photo.user.links.html), photoUrl: withUtm(photo.links.html) }
  };
}
