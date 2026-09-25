import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { consumeRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { dropboxConfig, gdriveConfig, isOneDriveConfigured, isUnsplashConfigured } from "@/lib/integrations/config";
import { ALLOWED_HOSTS, ImportError, fetchFromAllowedHost, storeDownloadedMedia } from "@/lib/integrations/remote-media";
import { prepareUnsplashImport } from "@/lib/integrations/unsplash";
import { freshIntegrationToken } from "@/lib/integrations/oauth-accounts";
import { GRAPH, oneDriveItem, refreshOneDriveToken } from "@/lib/integrations/onedrive";

export const dynamic = "force-dynamic";
// Téléchargement + enregistrement d'une vidéo : jusqu'à une minute.
export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("source", [
  // Google Drive (Google Picker) : identifiant du fichier choisi et jeton
  // d'accès limité aux fichiers choisis (scope drive.file).
  z.object({ source: z.literal("gdrive"), brandId: z.string().min(1), fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/), accessToken: z.string().min(10).max(4096), filename: z.string().max(255).optional(), mimeType: z.string().max(100).optional() }),
  // Dropbox (Dropbox Chooser) : lien direct temporaire renvoyé par Dropbox.
  z.object({ source: z.literal("dropbox"), brandId: z.string().min(1), url: z.string().url(), filename: z.string().max(255).optional() }),
  // OneDrive : fichier du OneDrive relié (voir /api/integrations/onedrive).
  z.object({ source: z.literal("onedrive"), brandId: z.string().min(1), itemId: z.string().min(1).max(200) }),
  // Unsplash : identifiant de la photo.
  z.object({ source: z.literal("unsplash"), brandId: z.string().min(1), photoId: z.string().min(5).max(40) })
]);

// POST /api/media/import — importe dans Publier un média choisi sur une
// autre plateforme (lot 3, 25/09/2026) : téléchargé côté serveur depuis un
// domaine autorisé de cette plateforme, puis enregistré comme un envoi
// normal. Renvoie la fiche du média (et, pour Unsplash, le crédit à citer).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const rate = await consumeRateLimit("media-import", userId, 40, 10);
  if (!rate.ok) return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Demande d'import invalide." }, { status: 400 });
  const input = parsed.data;

  const denied = await requireBrandMembership(userId, input.brandId);
  if (denied) return denied;

  try {
    switch (input.source) {
      case "gdrive": {
        if (!gdriveConfig()) throw new ImportError("Google Drive n'est pas configuré.", 503);
        const headers = { Authorization: `Bearer ${input.accessToken}` };
        const res = await fetchFromAllowedHost(`https://www.googleapis.com/drive/v3/files/${input.fileId}?alt=media&supportsAllDrives=true`, ALLOWED_HOSTS.gdrive, { headers });
        const asset = await storeDownloadedMedia(input.brandId, res, input.filename || "google-drive", input.mimeType, "gdrive");
        return NextResponse.json({ asset });
      }
      case "dropbox": {
        if (!dropboxConfig()) throw new ImportError("Dropbox n'est pas configuré.", 503);
        const res = await fetchFromAllowedHost(input.url, ALLOWED_HOSTS.dropbox);
        const fallback = decodeURIComponent(new URL(input.url).pathname.split("/").pop() || "dropbox");
        const asset = await storeDownloadedMedia(input.brandId, res, input.filename || fallback, null, "dropbox");
        return NextResponse.json({ asset });
      }
      case "onedrive": {
        if (!isOneDriveConfigured()) throw new ImportError("OneDrive n'est pas configuré.", 503);
        const token = await freshIntegrationToken(userId, "onedrive", refreshOneDriveToken);
        const item = await oneDriveItem(token, input.itemId);
        if (item.kind !== "image" && item.kind !== "video") throw new ImportError("Choisissez une image ou une vidéo.", 415);
        const res = await fetchFromAllowedHost(`${GRAPH}/me/drive/items/${input.itemId}/content`, ALLOWED_HOSTS.onedrive, { headers: { Authorization: `Bearer ${token}` } });
        const asset = await storeDownloadedMedia(input.brandId, res, item.name, item.mimeType, "onedrive");
        return NextResponse.json({ asset });
      }
      case "unsplash": {
        if (!isUnsplashConfigured()) throw new ImportError("Unsplash n'est pas configuré.", 503);
        const prepared = await prepareUnsplashImport(input.photoId);
        const res = await fetchFromAllowedHost(prepared.fileUrl, ALLOWED_HOSTS.unsplash);
        const asset = await storeDownloadedMedia(input.brandId, res, prepared.filename, "image/jpeg", "unsplash");
        return NextResponse.json({ asset, credit: prepared.credit });
      }
    }
  } catch (err) {
    const status = err instanceof ImportError ? err.status : 500;
    const message = err instanceof ImportError ? err.message : "Import impossible pour le moment. Réessayez dans un instant.";
    if (!(err instanceof ImportError)) console.error("[media-import]", (err as Error).message);
    return NextResponse.json({ error: message }, { status });
  }
}
