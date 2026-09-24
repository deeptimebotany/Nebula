import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Image de partage (OpenGraph / Twitter) générée par Next.js à la demande et
// mise en cache : c'est ce qui s'affiche quand un lien nebulahub.space est
// collé sur LinkedIn, X, WhatsApp, Slack, iMessage... Avant ce fichier, ces
// aperçus n'avaient ni image ni carte. Le rendu reprend l'identité du site :
// fond noir de l'appli, halos aux couleurs du logo, logo R4 (nouvelle
// identité du 24/09/2026 : trois anneaux épais en dégradé cyan → bleu →
// violet → rose + étoile), nom et promesse. Couleurs en dur volontairement
// (le thème par défaut) : une image de partage ne peut pas suivre le thème
// choisi par un compte.
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CYAN = "#5fe0f0";
const BLUE = "#7a95ff";
const VIOLET = "#a066ff";
const PINK = "#f062d0";

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
          background: "#0e0e10",
          backgroundImage:
            "radial-gradient(circle at 12% 8%, rgba(160,102,255,0.38), transparent 42%), radial-gradient(circle at 88% 92%, rgba(95,224,240,0.22), transparent 46%), radial-gradient(circle at 80% 15%, rgba(240,98,208,0.2), transparent 38%)",
          color: "#ededef",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="112" height="112" viewBox="0 0 32 32">
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
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 46, fontWeight: 600, lineHeight: 1.15, maxWidth: 960 }}>
          {SITE_TAGLINE}
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 26, lineHeight: 1.4, color: "#a1a1aa", maxWidth: 940 }}>
          {SITE_DESCRIPTION}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 44, fontSize: 22, color: "#8b8b94" }}>
          <span style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: VIOLET }} />
          Instagram · TikTok · YouTube · Facebook
          <span style={{ display: "flex", marginLeft: 18, color: "#6b6b74" }}>nebulahub.space</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
