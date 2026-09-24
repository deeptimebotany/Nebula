import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiJson, authenticateApi } from "@/lib/api/auth";
import { brandFor, isResponse } from "@/lib/api/context";
import { UnsafeUrlError, fetchPublic } from "@/lib/net-safety";
import { ImportError, storeDownloadedMedia } from "@/lib/integrations/remote-media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({ brandId: z.string().min(1), url: z.string().url().max(2048), filename: z.string().max(200).optional() });

// POST /api/v1/media — ajoute un média à une marque depuis une adresse
// publique (https) : image ou vidéo, 2 Go maximum. Renvoie son identifiant,
// à passer dans mediaIds de POST /api/v1/posts.
export async function POST(req: NextRequest) {
  const auth = await authenticateApi(req, "write");
  if (!auth.ok) return auth.res;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_body", "Attendu : { brandId, url, filename? }.");
  const brand = await brandFor(auth.ctx, parsed.data.brandId, true);
  if (isResponse(brand)) return brand;

  try {
    // Chaque redirection est revérifiée : jamais d'adresse privée ou locale.
    const res = await fetchPublic(parsed.data.url);
    if (!res.ok) throw new ImportError(`Le serveur du média a répondu ${res.status}.`, 502);
    const current = res.url || parsed.data.url;
    const name = parsed.data.filename || decodeURIComponent(new URL(current).pathname.split("/").pop() || "media");
    const asset = await storeDownloadedMedia(brand.id, res, name);
    return apiJson({ data: { id: asset.id, url: asset.url, type: asset.type, mimeType: asset.mimeType, filename: asset.filename } }, 201);
  } catch (err) {
    if (err instanceof UnsafeUrlError) return apiError(400, "unsafe_url", err.message);
    if (err instanceof ImportError) return apiError(err.status, "import_failed", err.message);
    return apiError(502, "import_failed", "Téléchargement du média impossible.");
  }
}
