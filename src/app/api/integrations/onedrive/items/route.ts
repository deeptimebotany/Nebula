import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { freshIntegrationToken } from "@/lib/integrations/oauth-accounts";
import { listOneDrive, refreshOneDriveToken } from "@/lib/integrations/onedrive";
import { ImportError } from "@/lib/integrations/remote-media";

export const dynamic = "force-dynamic";

// GET /api/integrations/onedrive/items?folderId=…&q=… — dossiers, images et
// vidéos du OneDrive relié (racine par défaut, ou résultats de recherche).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const token = await freshIntegrationToken((session.user as { id: string }).id, "onedrive", refreshOneDriveToken);
    const folderId = req.nextUrl.searchParams.get("folderId") || undefined;
    const query = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100) || undefined;
    return NextResponse.json({ items: await listOneDrive(token, { folderId, query }) });
  } catch (err) {
    const status = err instanceof ImportError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ImportError ? err.message : "OneDrive ne répond pas pour le moment." }, { status });
  }
}
