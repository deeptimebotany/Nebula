import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { isUnsplashConfigured } from "@/lib/integrations/config";
import { ImportError } from "@/lib/integrations/remote-media";
import { searchUnsplash, UNSPLASH_HOME } from "@/lib/integrations/unsplash";

export const dynamic = "force-dynamic";

// GET /api/media/unsplash/search?q=…&page=1&orientation=portrait — recherche
// de photos libres pour Publier (lot 3). Limitée par personne pour ne pas
// épuiser le quota horaire partagé de l'application Unsplash.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isUnsplashConfigured()) return NextResponse.json({ error: "Unsplash n'est pas configuré." }, { status: 503 });
  const userId = (session.user as { id: string }).id;

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ photos: [], total: 0, totalPages: 0 });
  const page = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1));
  const o = req.nextUrl.searchParams.get("orientation");
  const orientation = o === "landscape" || o === "portrait" || o === "squarish" ? o : undefined;

  const rate = await consumeRateLimit("unsplash-search", userId, 30, 10);
  if (!rate.ok) return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });

  try {
    const result = await searchUnsplash(q, page, orientation);
    return NextResponse.json({ ...result, unsplashUrl: UNSPLASH_HOME() });
  } catch (err) {
    const status = err instanceof ImportError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ImportError ? err.message : "Recherche impossible pour le moment." }, { status });
  }
}
