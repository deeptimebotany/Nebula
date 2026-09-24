import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dropboxConfig, gdriveConfig, isCanvaConfigured, isOneDriveConfigured, isUnsplashConfigured, type PublicMediaSources } from "@/lib/integrations/config";
import { getIntegration } from "@/lib/integrations/oauth-accounts";

export const dynamic = "force-dynamic";

// GET /api/media/sources — sources d'import proposées dans Publier (lot 3) :
// seulement celles dont les clés sont configurées, avec l'état de connexion
// Canva / OneDrive de la personne. Les clés renvoyées (Google Picker,
// Dropbox) sont publiques par nature : elles sont faites pour être utilisées
// dans le navigateur, et restreintes au domaine du site côté Google/Dropbox.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const [canva, onedrive] = await Promise.all([
    isCanvaConfigured() ? getIntegration(userId, "canva") : Promise.resolve(null),
    isOneDriveConfigured() ? getIntegration(userId, "onedrive") : Promise.resolve(null)
  ]);
  const body: PublicMediaSources = {
    gdrive: gdriveConfig(),
    dropbox: dropboxConfig(),
    onedrive: isOneDriveConfigured() ? { connected: Boolean(onedrive) } : null,
    unsplash: isUnsplashConfigured(),
    canva: isCanvaConfigured() ? { connected: Boolean(canva) } : null
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
