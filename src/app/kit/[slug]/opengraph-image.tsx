import { ImageResponse } from "next/og";
import { getCachedPublicKit } from "@/lib/media-kit/cache";
import { formatCompact } from "@/lib/engagement-metrics";
import { NETWORK_META } from "@/lib/types";

// Image de partage d'un media kit (aperçu dans un e-mail, WhatsApp,
// LinkedIn…) : nom, accroche, audience, engagement, vues sur 90 jours.
// Même identité que l'image de l'audit. Espaces insécables remplacés : la
// police par défaut ne les a pas.
export const alt = "Media kit — Nebula";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VIOLET = "#a066ff";
const CYAN = "#5fe0f0";
const plain = (s: string) => s.replace(/[  ]/g, " ");
const pct = (x: number) => plain(`${x.toLocaleString("fr-FR", { maximumFractionDigits: x < 1 ? 2 : 1 })} %`);

export default async function MediaKitOgImage({ params }: { params: { slug: string } }) {
  const kit = await getCachedPublicKit(params.slug);
  const name = (kit?.brandName ?? "Media kit").slice(0, 40);
  const headline = (kit?.headline ?? "").slice(0, 90);
  const t = kit?.stats.totals;
  const figures = [
    { label: "abonnés", value: t?.audience != null ? plain(formatCompact(t.audience)) : null },
    { label: "d'engagement", value: t?.engagementRate != null ? pct(t.engagementRate) : null },
    { label: "vues sur 90 jours", value: t?.views90 != null ? plain(formatCompact(t.views90)) : null }
  ].filter((f): f is { label: string; value: string } => f.value !== null);
  const networks = Array.from(new Set((kit?.stats.accounts ?? []).map((a) => NETWORK_META[a.network].label))).join("  ·  ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 88px",
          background: "#0e0e10",
          backgroundImage: `radial-gradient(circle at 12% 8%, ${VIOLET}55, transparent 42%), radial-gradient(circle at 88% 92%, ${CYAN}33, transparent 46%)`,
          color: "#ededef",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: "#c4b5fd" }}>MEDIA KIT</div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, marginTop: 14, lineHeight: 1.05 }}>{name}</div>
          {headline && <div style={{ display: "flex", fontSize: 34, color: "#a1a1aa", marginTop: 16 }}>{headline}</div>}
        </div>
        <div style={{ display: "flex", gap: 72 }}>
          {figures.map((f) => (
            <div key={f.label} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1 }}>{f.value}</div>
              <div style={{ display: "flex", fontSize: 28, color: "#a1a1aa", marginTop: 8 }}>{f.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#a1a1aa" }}>
          <div style={{ display: "flex" }}>{networks || "Chiffres relevés par Nebula"}</div>
          <div style={{ display: "flex", color: "#d4d4d8" }}>{`nebulahub.space/kit/${params.slug}`.slice(0, 60)}</div>
        </div>
      </div>
    ),
    size
  );
}
