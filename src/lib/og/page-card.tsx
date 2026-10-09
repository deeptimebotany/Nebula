import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// Image de partage PROPRE à une page publique (SEO, 29/09/2026) : même
// identité que l'image de l'accueil (src/app/opengraph-image.tsx), avec le
// titre de la page. Générée une fois au build (fichiers opengraph-image.tsx
// des pages), jamais à la demande.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const CYAN = "#5fe0f0";
const BLUE = "#7a95ff";
const VIOLET = "#a066ff";
const PINK = "#f062d0";

export function renderPageOg({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "#0f0f0f",
          backgroundImage:
            "radial-gradient(circle at 12% 8%, rgba(160,102,255,0.36), transparent 42%), radial-gradient(circle at 88% 92%, rgba(95,224,240,0.2), transparent 46%), radial-gradient(circle at 82% 12%, rgba(240,98,208,0.18), transparent 38%)",
          color: "#ededef",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={CYAN} />
                <stop offset="0.35" stopColor={BLUE} />
                <stop offset="0.6" stopColor={VIOLET} />
                <stop offset="1" stopColor={PINK} />
              </linearGradient>
            </defs>
            <g fill="none" stroke="url(#g)" strokeWidth="3.4">
              <ellipse cx="16" cy="16" rx="14.3" ry="6.4" />
              <ellipse cx="16" cy="16" rx="14.3" ry="6.4" transform="rotate(60 16 16)" />
              <ellipse cx="16" cy="16" rx="14.3" ry="6.4" transform="rotate(120 16 16)" />
            </g>
            <path d="M16 9 Q17.8 14.2 23 16 Q17.8 17.8 16 23 Q14.2 17.8 9 16 Q14.2 14.2 16 9Z" fill="#ffffff" />
          </svg>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: VIOLET, textTransform: "uppercase", letterSpacing: 3 }}>{eyebrow}</div>
          <div style={{ display: "flex", marginTop: 18, fontSize: title.length > 48 ? 58 : 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 1040 }}>{title}</div>
          {subtitle && <div style={{ display: "flex", marginTop: 22, fontSize: 28, lineHeight: 1.35, color: "#a1a1aa", maxWidth: 1000 }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, color: "#8b8b94" }}>
          <span style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: VIOLET }} />
          nebulahub.space
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
