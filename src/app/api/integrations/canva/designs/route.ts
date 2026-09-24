import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { freshIntegrationToken } from "@/lib/integrations/oauth-accounts";
import { listCanvaDesigns, refreshCanvaToken } from "@/lib/integrations/canva";
import { ImportError } from "@/lib/integrations/remote-media";

export const dynamic = "force-dynamic";

// GET /api/integrations/canva/designs?q=…&continuation=… — designs du compte Canva relié.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  try {
    const token = await freshIntegrationToken(userId, "canva", refreshCanvaToken);
    const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100) || undefined;
    const continuation = req.nextUrl.searchParams.get("continuation")?.slice(0, 500) || undefined;
    return NextResponse.json(await listCanvaDesigns(token, { query: q, continuation }));
  } catch (err) {
    const status = err instanceof ImportError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ImportError ? err.message : "Canva ne répond pas pour le moment." }, { status });
  }
}
