import { ImageResponse } from "next/og";
import { findAudit } from "@/lib/audit/run";
import { subjectOf } from "@/lib/audit/types";

// Image de partage d'un rapport d'audit (aperçu sur X, LinkedIn, WhatsApp…) :
// le score en anneau, le nom analysé, « Audit de présence — Nebula ». Même
// identité que src/app/opengraph-image.tsx. Texte simple (chiffres sans
// espaces insécables : la police par défaut ne les a pas).
export const alt = "Audit de présence en ligne — Nebula";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VIOLET = "#a066ff";
const CYAN = "#5fe0f0";

function tone(score: number | null): string {
  if (score === null) return "#71717a";
  if (score >= 80) return "#34d399";
  if (score >= 60) return "#a78bfa";
  if (score >= 40) return "#fbbf24";
  return "#f87171";
}

export default async function AuditOgImage({ params }: { params: { token: string } }) {
  const found = await findAudit(params.token);
  const result = found.state === "found" ? found.result : null;
  const score = result?.score.global ?? null;
  const subject = result ? subjectOf(result).slice(0, 48) : "Audit de présence";
  const label = result?.score.label ?? "Rapport indisponible";
  const r = 150;
  const c = 2 * Math.PI * r;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 72,
          padding: "72px 88px",
          background: "#0e0e10",
          backgroundImage: `radial-gradient(circle at 12% 8%, ${VIOLET}55, transparent 42%), radial-gradient(circle at 88% 92%, ${CYAN}33, transparent 46%)`,
          color: "#ededef",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", position: "relative", width: 360, height: 360, alignItems: "center", justifyContent: "center" }}>
          <svg width="360" height="360" viewBox="0 0 360 360" style={{ position: "absolute", top: 0, left: 0 }}>
            <circle cx="180" cy="180" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="26" />
            <circle
              cx="180"
              cy="180"
              r={r}
              fill="none"
              stroke={tone(score)}
              strokeWidth="26"
              strokeLinecap="round"
              strokeDasharray={`${((score ?? 0) / 100) * c} ${c}`}
              transform="rotate(-90 180 180)"
            />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 128, fontWeight: 700, lineHeight: 1 }}>{score === null ? "-" : String(score)}</div>
            <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", marginTop: 8 }}>sur 100</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 5, color: "#a1a1aa" }}>AUDIT DE PRÉSENCE EN LIGNE</div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, marginTop: 18, lineHeight: 1.1 }}>{subject}</div>
          <div style={{ display: "flex", fontSize: 40, color: tone(score), marginTop: 18 }}>{label}</div>
          <div style={{ display: "flex", fontSize: 28, color: "#a1a1aa", marginTop: 48 }}>Audit gratuit, sans compte</div>
          <div style={{ display: "flex", fontSize: 28, color: "#d4d4d8", marginTop: 6 }}>nebulahub.space/outils/audit</div>
        </div>
      </div>
    ),
    size
  );
}
