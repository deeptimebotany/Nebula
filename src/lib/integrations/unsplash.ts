// Unsplash (lot 3, 25/09/2026) — banque de photos libres, API gratuite.
// Clé : UNSPLASH_ACCESS_KEY (application créée sur unsplash.com/developers).
// En mode « démo », 50 requêtes par heure ; demander le passage en
// production (gratuit) pour 5 000 par heure.
//
// Règles d'utilisation respectées : les vignettes de recherche viennent
// directement d'Unsplash (pas de copie), chaque photo affiche son auteur avec
// des liens utm_source=<app>&utm_medium=referral, et l'événement de
// téléchargement (download_location) est déclenché à chaque import.
import type { ZodType, ZodTypeDef } from "zod";
import { sendRequest } from "@/lib/social/base";
import { idSchema, soft, textSchema, z } from "@/lib/social/contract";
import { unsplashAppName } from "./config";
import { ImportError } from "./errors";
import { importJson } from "./http";

const API = "https://api.unsplash.com";

// --- Contrat des réponses (lot 8, voir social/contract.ts) -------------------
// Doc : https://unsplash.com/documentation (search/photos, photos/:id).
// Réponses types : tests/contracts/fixtures/unsplash.
const photoSchema = z.object({
  id: idSchema,
  width: z.number(),
  height: z.number(),
  color: soft(z.string()),
  alt_description: textSchema,
  description: textSchema,
  urls: z.object({ raw: z.string().url(), small: z.string().url(), thumb: z.string().url(), regular: soft(z.string()) }),
  links: z.object({ html: z.string().url(), download_location: z.string().url() }),
  user: z.object({ name: z.string(), username: z.string(), links: z.object({ html: z.string().url() }) })
});
type ApiPhoto = z.output<typeof photoSchema>;

function key(): string {
  const k = process.env.UNSPLASH_ACCESS_KEY;
  if (!k) throw new ImportError("Unsplash n'est pas configuré.", 503);
  return k;
}

function call<T>(path: string, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  return importJson(
    "UNSPLASH",
    `${API}${path}`,
    { headers: { Authorization: `Client-ID ${key()}`, "Accept-Version": "v1" }, schema },
    // Unsplash signale la limite horaire par un 403 (« Rate Limit Exceeded »).
    (err) => (err.status === 403 ? new ImportError("Limite de recherches Unsplash atteinte pour cette heure : réessayez un peu plus tard.", 429) : null)
  );
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
    color: p.color ?? null,
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
  const data = await call(`/search/photos?${params.toString()}`, z.object({ total: z.number(), total_pages: z.number(), results: z.array(photoSchema) }));
  return { total: data.total, totalPages: data.total_pages, photos: data.results.map(toPhoto) };
}

/**
 * Prépare l'import d'une photo : déclenche l'événement de téléchargement
 * exigé par Unsplash et renvoie l'adresse du fichier (2 400 px de large,
 * largement assez pour tous les réseaux) et le crédit à afficher.
 */
export async function prepareUnsplashImport(id: string): Promise<{ fileUrl: string; filename: string; credit: { name: string; profileUrl: string; photoUrl: string } }> {
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(id)) throw new ImportError("Photo Unsplash introuvable.", 404);
  const photo = await call(`/photos/${id}`, photoSchema);
  // Événement de téléchargement (obligatoire, sans effet sur le fichier).
  await sendRequest("UNSPLASH", photo.links.download_location, { headers: { Authorization: `Client-ID ${key()}` }, cache: "no-store", timeoutMs: 10_000 }).catch(() => undefined);
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
