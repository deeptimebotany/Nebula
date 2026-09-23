import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Image de partage (OpenGraph / Twitter) générée par Next.js à la demande et
// mise en cache : c'est ce qui s'affiche quand un lien nebulahub.space est
// collé sur LinkedIn, X, WhatsApp, Slack, iMessage... Avant ce fichier, ces
// aperçus n'avaient ni image ni carte. Le rendu reprend l'identité du site :
// fond "void" bleu nuit, halos violet/cyan, anneaux + étincelle du logo,
// nom et promesse. Couleurs en dur volontairement (le thème par défaut) :
// une image de partage ne peut pas suivre le thème choisi par un compte.
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VIOLET = "#7c6cf0";
const MAGENTA = "#e857b0";
const CYAN = "#3ee6dd";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 88px",
          background: "#05070f",
          backgroundImage:
            "radial-gradient(circle at 12% 8%, rgba(124,108,240,0.45), transparent 42%), radial-gradient(circle at 88% 92%, rgba(62,230,221,0.28), transparent 46%), radial-gradient(circle at 80% 15%, rgba(232,87,176,0.22), transparent 38%)",
          color: "#eaf0ff",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="112" height="112" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="rgba(124,108,240,0.18)" />
            <g strokeWidth="6" fill="none" strokeLinecap="round">
              <ellipse cx="60" cy="60" rx="34" ry="20" stroke={VIOLET} opacity="0.95" />
              <ellipse cx="60" cy="60" rx="34" ry="20" stroke={MAGENTA} opacity="0.9" transform="rotate(60 60 60)" />
              <ellipse cx="60" cy="60" rx="34" ry="20" stroke={CYAN} opacity="0.9" transform="rotate(120 60 60)" />
            </g>
            <path d="M60,42 L64,56 L78,60 L64,64 L60,78 L56,64 L42,60 L56,56 Z" fill="#ffffff" />
          </svg>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 46, fontWeight: 600, lineHeight: 1.15, maxWidth: 960 }}>
          {SITE_TAGLINE}
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 26, lineHeight: 1.4, color: "#a9b6d6", maxWidth: 940 }}>
          {SITE_DESCRIPTION}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 44, fontSize: 22, color: "#8d9bb5" }}>
          <span style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: CYAN }} />
          Instagram · TikTok · YouTube · Facebook
          <span style={{ display: "flex", marginLeft: 18, color: "#6f7c96" }}>nebulahub.space</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
