import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerUserId } from "@/lib/admin";
import { NETWORKS, type Network } from "@/lib/types";
import { listNetworkControls, updateNetworkControl, wakeWaitingTargets } from "@/lib/social/network-control";
import { prisma } from "@/lib/prisma";

// /api/admin/network-controls — interrupteurs par réseau (lot 5).
// Réservé au compte propriétaire (404 sinon, comme les autres pages admin).
//   GET   → état de chaque réseau + publications en attente
//   PATCH { network, publishEnabled?, syncEnabled?, message?, resetBreaker? }
export async function GET() {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const controls = await listNetworkControls({ fresh: true });
  const waiting = await prisma.postTarget.groupBy({ by: ["network", "errorCategory"], where: { status: "RETRY_WAIT" }, _count: { _all: true } });
  return NextResponse.json({
    controls,
    waiting: (waiting as { network: string; errorCategory: string | null; _count: { _all: number } }[]).map((w) => ({
      network: w.network,
      category: w.errorCategory,
      count: w._count._all
    })),
    now: new Date().toISOString()
  });
}

const patchSchema = z.object({
  network: z.enum(NETWORKS as unknown as [Network, ...Network[]]),
  publishEnabled: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  message: z.string().max(300).nullable().optional(),
  resetBreaker: z.boolean().optional()
});

export async function PATCH(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const { network, ...patch } = parsed.data;
  const control = await updateNetworkControl(network, patch);
  // Réactivation : les publications en attente partent au prochain passage du cron.
  const woken = control.publishEnabled && (patch.publishEnabled === true || patch.resetBreaker) ? await wakeWaitingTargets(network) : 0;
  return NextResponse.json({ ok: true, control, woken });
}
