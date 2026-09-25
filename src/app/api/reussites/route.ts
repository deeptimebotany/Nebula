import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { refreshReussites } from "@/lib/reussites/engine";
import { buildPage } from "@/lib/reussites/view";
import { chooseProgress, openChest } from "@/lib/reussites/weekly";
import { chestItemLabel } from "@/lib/reussites/missions";
import { REVIEW_FOCUS, saveReview } from "@/lib/reussites/review";
import { saveShowcase } from "@/lib/reussites/showcase";
import { MAX_SHOWCASE } from "@/lib/reussites/skills";
import { removeFeatured, setFeatureConsent, spendFeatureTicket } from "@/lib/reussites/featured";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/reussites — page Réussites : évalue les réussites du compte
// (déblocages éventuels), puis renvoie rang, missions de la semaine, défi
// du mois et accomplissements. Marque aussi les nouveautés comme vues
// (compteur du menu).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const page = await buildPage((session.user as { id: string }).id);
  if (!page) return NextResponse.json({ error: "Réussites indisponibles pour le moment." }, { status: 503 });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}

const actionSchema = z.discriminatedUnion("action", [
  // Mission Progression : choisir parmi les 3 propositions (un changement par semaine).
  z.object({ action: z.literal("choose"), key: z.string().min(1).max(40) }),
  // Coffre d'une semaine aux 3 missions réussies (il n'expire jamais).
  z.object({ action: z.literal("open-chest"), week: z.string().regex(/^\d{4}-W\d{2}$/) }),
  // Bilan de la semaine : cap choisi (lot B).
  z.object({ action: z.literal("review"), focus: z.enum(REVIEW_FOCUS) }),
  // Vitrine : jusqu'à 3 badges gagnés (lot B).
  z.object({ action: z.literal("showcase"), keys: z.array(z.string().min(1).max(60)).max(MAX_SHOWCASE) }),
  // Vidéo à la une (lot C) : accord, utiliser un ticket, retirer sa vidéo.
  z.object({ action: z.literal("feature-consent"), consent: z.boolean() }),
  z.object({ action: z.literal("feature-use"), sharedVideoId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("feature-remove"), id: z.string().min(1).max(40) })
]);

// POST /api/reussites — actions de la page (Réussites v2, 26/09/2026 ; lot B
// le 27/09/2026 : bilan de la semaine et vitrine).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action inconnue." }, { status: 400 });

  if (parsed.data.action === "choose") {
    const res = await chooseProgress(userId, parsed.data.key);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    // La nouvelle mission est peut-être déjà remplie : on revalide tout de suite.
    await refreshReussites(userId);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "review") {
    const res = await saveReview(userId, parsed.data.focus);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    // Étoiles Stratégie (bilans) à jour.
    await refreshReussites(userId);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "showcase") {
    const res = await saveShowcase(userId, parsed.data.keys);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "feature-consent") {
    await setFeatureConsent(userId, parsed.data.consent);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "feature-use") {
    const res = await spendFeatureTicket(userId, parsed.data.sharedVideoId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true, startsAt: res.startsAt });
  }

  if (parsed.data.action === "feature-remove") {
    const res = await removeFeatured(parsed.data.id, { userId, admin: false });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true });
  }

  const res = await openChest(userId, parsed.data.week);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  // XP du coffre, rang et fragments d'étoile filante à jour.
  await refreshReussites(userId);
  return NextResponse.json({ ok: true, item: res.item, label: chestItemLabel(res.item), xp: res.xp }, { headers: { "Cache-Control": "no-store" } });
}
