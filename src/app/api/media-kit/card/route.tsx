import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getKitEditor } from "@/lib/media-kit/load";
import { formatCompact } from "@/lib/engagement-metrics";
import { NETWORK_META } from "@/lib/types";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// GET /api/media-kit/card?brandId=…&format=story|post — carte « mes
// chiffres » à partager sur les réseaux (02/10/2026), à partir des mêmes
// chiffres que le media kit : audience, vues sur 90 jours, engagement,
// publications par mois, et une ligne par compte affiché.
//  - story : 1080 × 1920 ; post : 1080 × 1350.
//  - Les chiffres viennent des relevés de Nebula (API officielles), jamais
//    saisis : la carte le dit, avec la date du relevé, et donne le lien du
//    kit publié pour que n'importe qui puisse vérifier. Pas le mot
//    « certifié » : aucun organisme tiers ne valide ces chiffres.
//  - Un chiffre inconnu s'affiche « — », jamais 0 (même règle que le kit).
//  - Tous les paliers : la carte se télécharge même en Gratuit ; le lien du
//    kit n'y figure que s'il est publié.
// Rendu par next/og (police intégrée, aucun service externe, aucun coût).
const SIZES = { story: { w: 1080, h: 1920 }, post: { w: 1080, h: 1350 } } as const;
const VIOLET = "#a066ff";
const CYAN = "#5fe0f0";
const BG = "#0e0e10";

/** La police intégrée n'a pas les espaces insécables : espace simple. */
const plain = (s: string) => s.replace(/[  ]/g, " ");
const compact = (n: number | null) => (n == null ? "—" : plain(formatCompact(n)));
const pct = (x: number | null) => (x == null ? "—" : plain(`${x.toLocaleString("fr-FR", { maximumFractionDigits: x < 1 ? 2 : 1 })} %`));
const perMonth = (x: number | null) => (x == null ? "—" : plain(x.toLocaleString("fr-FR", { maximumFractionDigits: 1 })));

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2)) || "N";
  return letters.toUpperCase();
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;
  const format = req.nextUrl.searchParams.get("format") === "story" ? "story" : "post";
  const rate = await consumeRateLimit("kit-card", userId, 40, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de cartes générées : réessayez dans quelques minutes." }, { status: 429 });

  const editor = await getKitEditor(brandId);
  if (!editor) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  const kit = editor.preview;
  const t = kit.stats.totals;
  const story = format === "story";
  const { w, h } = SIZES[format];
  const name = kit.brandName.slice(0, 32);
  const headline = kit.headline.slice(0, story ? 90 : 70);
  const site = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const link = editor.settings.published && editor.allowed ? `${site}/kit/${editor.slug}` : site;
  const updated = kit.stats.updatedAt
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(kit.stats.updatedAt))
    : null;
  const figures = [
    { value: compact(t.audience), label: "abonnés au total" },
    { value: compact(t.views90), label: "vues sur 90 jours" },
    { value: pct(t.engagementRate), label: "d'engagement moyen" },
    { value: perMonth(t.postsPerMonth), label: "publications par mois" }
  ];
  const accounts = kit.stats.accounts.slice(0, story ? 5 : 4);
  const big = story ? 92 : 78;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: story ? "110px 84px 96px" : "72px 80px",
          background: BG,
          backgroundImage: `radial-gradient(circle at 12% 6%, ${VIOLET}66, transparent 40%), radial-gradient(circle at 92% 94%, ${CYAN}3d, transparent 44%)`,
          color: "#ededef",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: "#c4b5fd" }}>MEDIA KIT · MES CHIFFRES</div>
          <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: story ? 56 : 40 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: story ? 150 : 128,
                height: story ? 150 : 128,
                borderRadius: 999,
                backgroundImage: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`,
                fontSize: story ? 58 : 50,
                fontWeight: 700,
                color: "#0e0e10"
              }}
            >
              {initials(name)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", fontSize: story ? 68 : 60, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 }}>{name}</div>
              {headline && <div style={{ display: "flex", fontSize: story ? 32 : 28, color: "#a1a1aa", marginTop: 12, lineHeight: 1.3 }}>{headline}</div>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          {figures.map((f) => (
            <div
              key={f.label}
              style={{
                display: "flex",
                flexDirection: "column",
                width: (w - (story ? 168 : 160) - 24) / 2,
                padding: story ? "40px 36px" : "30px 32px",
                borderRadius: 32,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)"
              }}
            >
              <div style={{ display: "flex", fontSize: big, fontWeight: 700, lineHeight: 1 }}>{f.value}</div>
              <div style={{ display: "flex", fontSize: story ? 30 : 26, color: "#a1a1aa", marginTop: 12 }}>{f.label}</div>
            </div>
          ))}
        </div>

        {accounts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: story ? 18 : 12 }}>
            {accounts.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: story ? 32 : 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ display: "flex", width: 18, height: 18, borderRadius: 999, background: NETWORK_META[a.network].color }} />
                  <div style={{ display: "flex" }}>{NETWORK_META[a.network].label}</div>
                  <div style={{ display: "flex", color: "#a1a1aa" }}>{(a.handle ? `@${a.handle.replace(/^@/, "")}` : a.name).slice(0, 26)}</div>
                </div>
                <div style={{ display: "flex", fontWeight: 700 }}>{a.followers == null ? "—" : `${compact(a.followers)} abonnés`}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: story ? 32 : 24 }}>
          {/* Story : la date sur sa propre ligne (sinon « 2026. » se retrouve seul). */}
          {updated && story ? (
            <div style={{ display: "flex", flexDirection: "column", fontSize: 24, color: "#a1a1aa", lineHeight: 1.4 }}>
              <div style={{ display: "flex" }}>Chiffres relevés par Nebula via les API officielles des réseaux,</div>
              <div style={{ display: "flex" }}>{`le ${updated}.`}</div>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: story ? 24 : 21, color: "#a1a1aa", lineHeight: 1.4 }}>
              {updated ? `Chiffres relevés par Nebula via les API officielles des réseaux, le ${updated}.` : "Chiffres relevés par Nebula via les API officielles des réseaux."}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: story ? 30 : 26 }}>
            <div style={{ display: "flex", color: "#ededef", fontWeight: 700 }}>{link}</div>
            <div style={{ display: "flex", color: "#c4b5fd" }}>Propulsé par Nebula</div>
          </div>
        </div>
      </div>
    ),
    { width: w, height: h, headers: { "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="carte-${editor.slug}-${format}.png"` } }
  );
  return image;
}
