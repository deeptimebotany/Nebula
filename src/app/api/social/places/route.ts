import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBrandMembership } from "@/lib/brand-access";
import { fetchJson } from "@/lib/social/base";
import { GRAPH_BASE } from "@/lib/social/meta";

export const dynamic = "force-dynamic";

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

// GET /api/social/places?brandId=…&q=… — recherche de lieux pour le
// sélecteur « Lieu » du Composer (voir components/composer/location-picker.tsx).
// Un lieu, pour Instagram et Facebook, c'est une Page Facebook qui a une
// adresse : on interroge la recherche de Pages de Meta (/pages/search) avec
// le jeton d'un compte Facebook ou Instagram connecté à la marque, et on ne
// garde que les Pages dotées d'une adresse.
//
// Cette recherche demande à l'application Meta de Nebula une autorisation
// supplémentaire (fonction « Page Public Metadata Access », à obtenir via
// l'App Review de Meta). Tant qu'elle n'est pas accordée, Meta refuse :
// on renvoie alors `unavailable: true` et l'interface propose de coller le
// lien de la Page Facebook du lieu à la place.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;
  const pageLink = (req.nextUrl.searchParams.get("page") ?? "").trim().slice(0, 300);
  if (!pageLink && q.length < 2) return NextResponse.json({ places: [] });

  const connections: { network: string; accessToken: string }[] = await prisma.socialConnection.findMany({
    where: { brandId, status: "CONNECTED", network: { in: ["FACEBOOK", "INSTAGRAM"] } },
    select: { network: true, accessToken: true }
  });
  const connection = connections.find((c) => c.network === "FACEBOOK") ?? connections[0];
  if (!connection) {
    return NextResponse.json({ places: [], unavailable: true, reason: "no_connection", message: "Connectez un compte Facebook ou Instagram pour rechercher un lieu." });
  }

  // Lien (ou identifiant) de la Page Facebook d'un lieu, collé à la main.
  if (pageLink) {
    const ref = pageRefFromLink(pageLink);
    if (!ref) return NextResponse.json({ error: "Lien de Page Facebook non reconnu." }, { status: 400 });
    try {
      const page = await fetchJson<{ id: string; name: string; location?: { street?: string; city?: string; zip?: string; country?: string; latitude?: number; longitude?: number } }>(
        connection.network === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM",
        `${GRAPH_BASE}/${encodeURIComponent(ref)}?fields=id,name,location&access_token=${encodeURIComponent(connection.accessToken)}`
      );
      const place: PlaceResult = {
        id: page.id,
        name: page.name,
        address: [page.location?.street, [page.location?.zip, page.location?.city].filter(Boolean).join(" "), page.location?.country].filter(Boolean).join(", "),
        latitude: page.location?.latitude,
        longitude: page.location?.longitude
      };
      return NextResponse.json({ place, hasAddress: Boolean(page.location) });
    } catch {
      // Lecture de la Page refusée : un identifiant numérique suffit quand
      // même pour publier (Instagram/Facebook le vérifient à la publication).
      if (/^\d{5,}$/.test(ref)) {
        return NextResponse.json({ place: { id: ref, name: `Page Facebook n° ${ref}`, address: "" }, hasAddress: null });
      }
      return NextResponse.json(
        { error: "Impossible de lire cette Page. Collez plutôt un lien qui contient son identifiant numérique (ex. facebook.com/profile.php?id=…)." },
        { status: 422 }
      );
    }
  }

  try {
    const params = new URLSearchParams({
      q,
      fields: "id,name,location",
      limit: "10",
      access_token: connection.accessToken
    });
    const data = await fetchJson<{
      data?: { id: string; name: string; location?: { street?: string; city?: string; zip?: string; country?: string; latitude?: number; longitude?: number } }[];
    }>(connection.network === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM", `${GRAPH_BASE}/pages/search?${params.toString()}`);
    const places: PlaceResult[] = (data.data ?? [])
      .filter((p) => p.location && (p.location.city || p.location.street || typeof p.location.latitude === "number"))
      .map((p) => ({
        id: p.id,
        name: p.name,
        address: [p.location?.street, [p.location?.zip, p.location?.city].filter(Boolean).join(" "), p.location?.country].filter(Boolean).join(", "),
        latitude: p.location?.latitude,
        longitude: p.location?.longitude
      }));
    return NextResponse.json({ places });
  } catch (err) {
    console.error("[places] recherche de lieux refusée par Meta :", err);
    return NextResponse.json({
      places: [],
      unavailable: true,
      reason: "meta_permission",
      message: "La recherche de lieux n'est pas encore activée par Meta pour Nebula. Collez le lien de la Page Facebook du lieu ci-dessous."
    });
  }
}

// facebook.com/profile.php?id=123 · facebook.com/pages/Nom/123 ·
// facebook.com/Nom-123 · facebook.com/nomdepage · 123 → « 123 » ou « nomdepage ».
function pageRefFromLink(input: string): string | null {
  const raw = input.trim();
  if (/^\d{5,}$/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$|(^|\.)fb\.com$/i.test(url.hostname)) return null;
  const idParam = url.searchParams.get("id");
  if (idParam && /^\d+$/.test(idParam)) return idParam;
  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  if (/^\d{5,}$/.test(last)) return last;
  const trailingId = last.match(/-(\d{5,})$/);
  if (trailingId) return trailingId[1];
  if (parts[0] === "pages" || parts[0] === "profile.php") return null;
  return /^[A-Za-z0-9.]+$/.test(parts[0]) ? parts[0] : null;
}
