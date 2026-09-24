import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { freshIntegrationToken } from "@/lib/integrations/oauth-accounts";
import { refreshCanvaToken, startCanvaExport } from "@/lib/integrations/canva";
import { ImportError } from "@/lib/integrations/remote-media";

const bodySchema = z.object({ designId: z.string().regex(/^[A-Za-z0-9_-]{3,100}$/), kind: z.enum(["image", "video"]), portrait: z.boolean().optional() });

// POST /api/integrations/canva/export — lance l'export d'un design (1re page).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Design invalide." }, { status: 400 });
  try {
    const token = await freshIntegrationToken((session.user as { id: string }).id, "canva", refreshCanvaToken);
    const jobId = await startCanvaExport(token, parsed.data.designId, parsed.data.kind, Boolean(parsed.data.portrait));
    return NextResponse.json({ jobId });
  } catch (err) {
    const status = err instanceof ImportError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ImportError ? err.message : "Export Canva impossible pour le moment." }, { status });
  }
}
